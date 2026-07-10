from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List
import json
import logging
import asyncio
import redis.asyncio as redis
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.podcast import Episode

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:

    def __init__(self):
        # Maps episode_id (as string) to a list of (WebSocket, user_id)
        self.active_connections: Dict[str, List[tuple[WebSocket, str]]] = {}
        self.redis_client = redis.from_url(settings.REDIS_URL)
        self.pubsub_task = None

    async def connect(self, websocket: WebSocket, episode_id: str, user_id: str):
        try:
            # await websocket.accept() # Handled in endpoint
            if episode_id not in self.active_connections:
                self.active_connections[episode_id] = []
            self.active_connections[episode_id].append((websocket, user_id))
            
            # Start the pubsub listener if not already running
            if self.pubsub_task is None:
                self.pubsub_task = asyncio.create_task(self._redis_listener())
                
            logger.info(f"WebSocket ACCEPTED: {episode_id}. Total connections for this id: {len(self.active_connections[episode_id])}")
        except Exception as e:
            logger.error(f"Error during WebSocket connection for {episode_id}: {e}")
            raise

    def disconnect(self, websocket: WebSocket, episode_id: str):
        if episode_id in self.active_connections:
            self.active_connections[episode_id] = [
                (ws, uid) for (ws, uid) in self.active_connections[episode_id] if ws != websocket
            ]
            if not self.active_connections[episode_id]:
                del self.active_connections[episode_id]
        logger.info(f"WebSocket DISCONNECTED: {episode_id}")

    async def _redis_listener(self):
        retry_delay = 1
        while True:
            logger.info("Attempting to start Redis Pub/Sub listener...")
            try:
                pubsub = self.redis_client.pubsub()
                await pubsub.subscribe("episode_updates")
                logger.info("Redis Pub/Sub SUBSCRIBED to 'episode_updates'")
                retry_delay = 1  # reset backoff on successful connect

                async for message in pubsub.listen():
                    if message["type"] == "message":
                        try:
                            data = json.loads(message["data"])
                            episode_id = str(data.get("episode_id"))
                            user_id = str(data.get("user_id")) if data.get("user_id") is not None else None

                            if episode_id in self.active_connections:
                                await self.broadcast_to_episode(episode_id, data, user_id=user_id)

                            if "dashboard" in self.active_connections:
                                await self.broadcast_to_episode("dashboard", data, user_id=user_id)
                        except Exception as e:
                            logger.error(f"Error broadcasting message: {e}")
            except asyncio.CancelledError:
                logger.info("Redis Pub/Sub listener CANCELLED")
                break
            except Exception as e:
                logger.error(f"Redis Pub/Sub listener CRASHED: {e} — retrying in {retry_delay}s")
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 30)
        self.pubsub_task = None
        logger.info("Redis Pub/Sub listener STOPPED")

    async def broadcast_to_episode(self, episode_id: str, message: dict, user_id: str | None = None):
        if episode_id in self.active_connections:
            for connection, uid in self.active_connections[episode_id]:
                if user_id and uid != user_id:
                    continue
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.debug(f"Failed to send message to {episode_id} connection: {e}")

manager = ConnectionManager()

@router.websocket("/{episode_id}")
async def websocket_endpoint(websocket: WebSocket, episode_id: str):
    await websocket.accept() # Accept first to send proper close codes
    logger.info(f"WebSocket connection accepted: {episode_id}")
    
    try:
        token = websocket.query_params.get("token")
        if not token:
            logger.warning(f"WebSocket closing: Missing token for {episode_id}")
            await websocket.close(code=4001)
            return

        try:
            from jose import jwt, JWTError
            from app.core.config import settings
            from app.core.security import ALGORITHM
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
        except JWTError:
            logger.warning(f"WebSocket closing: Invalid token for {episode_id}")
            await websocket.close(code=4001)
            return

        if not user_id:
            logger.warning(f"WebSocket closing: No sub in token for {episode_id}")
            await websocket.close(code=4001)
            return

        # If connecting to a specific episode, enforce ownership
        if episode_id != "dashboard":
            try:
                ep_id_int = int(episode_id)
                db = SessionLocal()
                try:
                    ep = db.query(Episode).filter(Episode.id == ep_id_int, Episode.user_id == user_id).first()
                    if not ep:
                        logger.warning(f"WebSocket closing: Episode {episode_id} not found or not owned by {user_id}")
                        await websocket.close(code=4003) # 4003: Forbidden
                        return
                finally:
                    db.close()
            except ValueError:
                logger.error(f"Invalid episode_id: {episode_id}")
                await websocket.close(code=4000)
                return

        await manager.connect(websocket, episode_id, user_id)
        while True:
            # Keep the connection open - receive_text blocks
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, episode_id)
    except Exception as e:
        logger.error(f"WebSocket runtime error ({episode_id}): {e}")
        manager.disconnect(websocket, episode_id)



