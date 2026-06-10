from app.services.llm_client import LLMClient
import requests
import json
from typing import List, Dict, Any
from app.core.config import settings


class FactChecker:
    def __init__(self):
        self.provider = getattr(settings, "FACT_CHECK_PROVIDER", "searxng")
        self.searxng_url = getattr(settings, "SEARXNG_URL", "http://localhost:8080")
        self.llm = LLMClient()

    def verify_claims(self, claims: List[str]) -> List[Dict[str, Any]]:
        if not claims:
            return []
            
        raw_results = []
        if self.provider == "searxng" and self.searxng_url:
            raw_results = self._verify_searxng(claims)
        else:
            return [
                {
                    "claim": c,
                    "status": "unverified",
                    "confidence": 0.0,
                    "sources": [],
                    "reason": "No valid fact-check provider (like SearxNG) configured"
                }
                for c in claims
            ]
            
        judged_results = []
        for res in raw_results:
            if res["status"] == "review" and res["sources"]:
                judgement = self._judge_claim_veracity(res["claim"], res["sources"])
                res.update(judgement)
            judged_results.append(res)
            
        return judged_results

    def _judge_claim_veracity(self, claim: str, sources: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Ask LLM to verify claim against search snippets."""
        context = "\n".join([f"Source: {s['title']}\nSnippet: {s['snippet']}" for s in sources])
        prompt = (
            f"Analyze this claim against the provided search results.\n\nCLAIM: {claim}\n\nCONTEXT:\n{context}\n\n"
            "Judge if the claim is 'verified', 'refuted', or 'uncertain'.\n"
            "Return JSON: {\"status\": \"verified|refuted|uncertain\", \"confidence\": 0.0-1.0, \"reason\": \"...\"}"
        )
        try:
            res = self.llm.chat([{"role": "user", "content": prompt}], format="json")
            return self.llm._parse_json_object(res)
        except:
            return {"status": "review", "confidence": 0.5, "reason": "AI judgement failed"}

    def _verify_searxng(self, claims: List[str]) -> List[Dict[str, Any]]:
        results = []
        for claim in claims:
            try:
                resp = requests.get(
                    f"{self.searxng_url}/search",
                    params={"q": claim, "format": "json"},
                    timeout=15
                )
                resp.raise_for_status()
                data = resp.json()
                sources = []
                for item in data.get("results", [])[:3]:
                    sources.append({
                        "title": item.get("title"),
                        "link": item.get("url"),
                        "snippet": item.get("content")
                    })
                results.append({
                    "claim": claim,
                    "status": "review",
                    "confidence": 0.5,
                    "sources": sources
                })
            except Exception as e:
                results.append({
                    "claim": claim,
                    "status": "error",
                    "confidence": 0.0,
                    "sources": [],
                    "reason": f"SearxNG error: {str(e)}"
                })
        return results
