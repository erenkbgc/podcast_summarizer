from datetime import datetime
from qdrant_client import QdrantClient
from qdrant_client.http import models
from typing import List, Dict, Any, Optional
from app.core.config import settings

class VectorStore:
    def __init__(self, url: str = settings.QDRANT_URL):
        self.client = QdrantClient(url=url)
        self.segments_collection = "podcast_segments"
        self.chat_collection = "chat_exchanges"
        self._ensure_collections()

    def _ensure_collections(self):
        collections = {c.name for c in self.client.get_collections().collections}
        
        # 1. Segments Collection
        if self.segments_collection not in collections:
            self.client.create_collection(
                collection_name=self.segments_collection,
                vectors_config=models.VectorParams(size=384, distance=models.Distance.COSINE),
            )
            self.client.create_payload_index(self.segments_collection, "episode_id", models.PayloadSchemaType.KEYWORD)
            self.client.create_payload_index(self.segments_collection, "text", models.TextIndexParams(
                type="text", tokenizer=models.TokenizerType.WORD, min_token_len=2, lowercase=True
            ))

        # 2. Chat Collection
        if self.chat_collection not in collections:
            self.client.create_collection(
                collection_name=self.chat_collection,
                vectors_config=models.VectorParams(size=384, distance=models.Distance.COSINE),
            )
            self.client.create_payload_index(self.chat_collection, "user_id", models.PayloadSchemaType.KEYWORD)
            self.client.create_payload_index(self.chat_collection, "episode_id", models.PayloadSchemaType.KEYWORD)

    def upsert_segments(self, episode_id: int, segments: List[Dict[str, Any]]):
        import hashlib
        import uuid
        points = []
        for s in segments:
            seed = f"{episode_id}_{s['timestamp']}"
            hash_obj = hashlib.md5(seed.encode())
            point_id = str(uuid.UUID(hash_obj.hexdigest()))
            
            points.append(models.PointStruct(
                id=point_id,
                vector=s["embedding"],
                payload={
                    "episode_id": episode_id,
                    "text": s["text"],
                    "timestamp": s["timestamp"],
                    "end_timestamp": s.get("end_timestamp"),
                    "speakers": s.get("speakers", []),
                }
            ))
        self.client.upsert(collection_name=self.segments_collection, points=points)

    def upsert_chat_exchange(self, user_id: str, episode_id: int, message: str, response: str, embedding: List[float]):
        import uuid
        point_id = str(uuid.uuid4())
        self.client.upsert(
            collection_name=self.chat_collection,
            points=[models.PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "user_id": user_id,
                    "episode_id": episode_id,
                    "user_message": message,
                    "ai_response": response,
                    "created_at": str(datetime.now())
                }
            )]
        )

    def search(self, episode_ids: Optional[List[int]] = None, query_vector: List[float] = [], query_text: Optional[str] = None, limit: int = 5) -> List[Dict[str, Any]]:
        must_filters = []
        if episode_ids:
            must_filters.append(models.FieldCondition(key="episode_id", match=models.MatchAny(any=episode_ids)))
        
        base_filter = models.Filter(must=must_filters) if must_filters else None
        
        # 1. Semantic Search (Dense Vector)
        semantic_hits = []
        if query_vector:
            res = self.client.query_points(
                collection_name=self.segments_collection,
                query=query_vector,
                query_filter=base_filter,
                limit=limit * 2
            )
            semantic_hits = res.points

        # 2. Keyword Search (Full-Text)
        keyword_hits = []
        if query_text:
            # Tokenize query text for basic matching (Qdrant MatchText matches if ANY token matches)
            kw_filter_conditions = must_filters.copy()
            kw_filter_conditions.append(models.FieldCondition(key="text", match=models.MatchText(text=query_text)))
            kw_filter = models.Filter(must=kw_filter_conditions)
            
            res_kw = self.client.scroll(
                collection_name=self.segments_collection,
                scroll_filter=kw_filter,
                limit=limit * 2,
                with_payload=True,
                with_vectors=False
            )
            keyword_hits = res_kw[0]  # scroll returns (points, next_page_offset)

        # 3. Reciprocal Rank Fusion (RRF)
        k = 60
        scores = {}
        payloads = {}

        for rank, hit in enumerate(semantic_hits):
            scores[hit.id] = scores.get(hit.id, 0.0) + (1.0 / (k + rank))
            payloads[hit.id] = hit.payload

        for rank, hit in enumerate(keyword_hits):
            scores[hit.id] = scores.get(hit.id, 0.0) + (1.0 / (k + rank))
            payloads[hit.id] = hit.payload

        sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
        
        results = []
        for pid in sorted_ids[:limit]:
            p = dict(payloads[pid])
            p["score"] = scores[pid]
            results.append(p)
            
        return results

    def search_chat_exchanges(self, user_id: str, query_vector: List[float], limit: int = 5) -> List[Dict[str, Any]]:
        result = self.client.query_points(
            collection_name=self.chat_collection,
            query=query_vector,
            query_filter=models.Filter(must=[models.FieldCondition(key="user_id", match=models.MatchValue(value=user_id))]),
            limit=limit
        )
        return [dict(hit.payload) for hit in result.points]

    def delete_episode(self, episode_id: int):
        self.client.delete(
            collection_name=self.segments_collection,
            points_selector=models.Filter(must=[models.FieldCondition(key="episode_id", match=models.MatchValue(value=episode_id))])
        )
        self.client.delete(
            collection_name=self.chat_collection,
            points_selector=models.Filter(must=[models.FieldCondition(key="episode_id", match=models.MatchValue(value=episode_id))])
        )
