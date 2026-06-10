from sentence_transformers import SentenceTransformer, CrossEncoder
from typing import List, Dict, Any
import re
from app.core.config import settings

class EmbeddingService:
    def __init__(self, model_name: str = settings.EMBEDDING_MODEL_NAME, reranker_name: str = settings.RERANKER_MODEL_NAME):
        # This will download the models the first time it's run
        self.model = SentenceTransformer(model_name)
        self.reranker = CrossEncoder(reranker_name)

    def embed_text(self, text: str) -> List[float]:
        embedding = self.model.encode(text)
        return embedding.tolist()

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        embeddings = self.model.encode(texts)
        return embeddings.tolist()

    def rerank(self, query: str, documents: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:
        if not documents:
            return []
        
        # Prepare pairs for cross-encoder
        pairs = [[query, doc["text"]] for doc in documents]
        scores = self.reranker.predict(pairs)
        
        # Attach scores and sort
        query_terms = set(re.findall(r"\b\w+\b", query.lower()))
        for i, score in enumerate(scores):
            doc_terms = set(re.findall(r"\b\w+\b", documents[i].get("text", "").lower()))
            lexical_overlap = (len(query_terms & doc_terms) / max(1, len(query_terms)))
            documents[i]["rerank_score"] = float(score)
            documents[i]["lexical_overlap"] = lexical_overlap

        # Hybrid score: cross-encoder + small lexical boost
        ranked_docs = sorted(
            documents,
            key=lambda x: (x["rerank_score"] + (0.2 * x.get("lexical_overlap", 0.0))),
            reverse=True
        )
        return ranked_docs[:top_k]
