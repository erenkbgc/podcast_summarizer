import os
import sys

# Add backend directory to sys.path to allow imports
sys.path.append(os.path.join(os.path.dirname(__file__)))

from app.db.session import SessionLocal
from app.models.podcast import Episode
from app.services.vector_store import VectorStore
from qdrant_client.http import models

def cleanup_orphaned_vectors():
    print("Starting vector cleanup...")
    
    # 1. Get all valid episode IDs from Postgres
    db = SessionLocal()
    try:
        valid_episode_ids = {e.id for e in db.query(Episode.id).all()}
        print(f"Found {len(valid_episode_ids)} valid episodes in Postgres: {valid_episode_ids}")
    finally:
        db.close()

    # 2. Connect to Qdrant
    vs = VectorStore()
    client = vs.client
    collection_name = vs.collection_name

    # 3. Scroll through all points in Qdrant
    offset = None
    limit = 100
    
    orphaned_points = []
    total_checked = 0
    unique_episode_ids_in_qdrant = set()

    print("Scanning Qdrant collection...")
    while True:
        points_batch, next_offset = client.scroll(
            collection_name=collection_name,
            limit=limit,
            offset=offset,
            with_payload=True,
            with_vectors=False
        )
        
        for point in points_batch:
            total_checked += 1
            payload = point.payload or {}
            episode_id = payload.get("episode_id")
            
            if episode_id is not None:
                unique_episode_ids_in_qdrant.add(episode_id)
                # Check if this episode_id exists in Postgres
                # Note: episode_id in Qdrant might be stored as int or str, safer to cast to int
                try:
                    ep_id_int = int(episode_id)
                    if ep_id_int not in valid_episode_ids:
                        orphaned_points.append(point.id)
                except ValueError:
                    # If ID is not an integer, it's definitely invalid for our schema
                    orphaned_points.append(point.id)
            else:
                # No episode_id? Orphan.
                orphaned_points.append(point.id)

        offset = next_offset
        if offset is None:
            break

    print(f"Scanned {total_checked} vectors.")
    print(f"Found episode IDs in Qdrant: {unique_episode_ids_in_qdrant}")
    print(f"Found {len(orphaned_points)} orphaned vectors.")

    # 4. Delete orphans
    if orphaned_points:
        print("Deleting orphaned vectors...")
        # Delete in batches to avoid huge request
        batch_size = 100
        for i in range(0, len(orphaned_points), batch_size):
            batch = orphaned_points[i:i+batch_size]
            client.delete(
                collection_name=collection_name,
                points_selector=models.PointIdsList(points=batch)
            )
            print(f"Deleted batch {i}-{i+len(batch)}")
        print("Cleanup complete.")
    else:
        print("No orphaned vectors found.")

if __name__ == "__main__":
    cleanup_orphaned_vectors()
