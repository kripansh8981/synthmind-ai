# ══════════════════════════════════════════════════════════════
# Exact + Semantic Cache Layer
# Caches query-answer pairs to avoid redundant API calls
# ══════════════════════════════════════════════════════════════

from embeddings import get_embedding
from vector_store import VectorStore


class CacheLayer:
    """
    Two-tier cache:
    - Exact: hash-based lookup for identical queries
    - Semantic: cosine similarity >= 0.92 for similar queries
    """

    def __init__(self):
        self._exact: dict[str, dict] = {}      # hash -> result
        self._semantic: list[dict] = []          # [{ embedding, query, doc_id, ... }]

    @staticmethod
    def _hash_query(query: str, doc_id: str) -> str:
        """Generate a hash for exact cache matching."""
        s = f"{doc_id}:{query.lower().strip()}"
        h = 0
        for ch in s:
            h = ((h << 5) - h) + ord(ch)
            h &= 0xFFFFFFFF  # Keep as 32-bit
        return str(h)

    def check_exact(self, query: str, doc_id: str) -> dict | None:
        """Check exact cache for a matching query."""
        key = self._hash_query(query, doc_id)
        return self._exact.get(key)

    def check_semantic(self, query: str, doc_id: str) -> dict | None:
        """Check semantic cache for a similar query (cosine >= 0.92)."""
        if not self._semantic:
            return None

        try:
            query_embedding = get_embedding(query)

            for entry in self._semantic:
                if entry.get("doc_id") != doc_id:
                    continue

                sim = VectorStore.cosine_similarity(query_embedding, entry["embedding"])
                if sim >= 0.92:
                    return {**entry, "similarity": sim}
        except Exception as e:
            print(f"Semantic cache error: {e}")

        return None

    def store(self, query: str, doc_id: str, result: dict):
        """Store a result in both exact and semantic caches."""
        # Exact cache
        key = self._hash_query(query, doc_id)
        self._exact[key] = result

        # Semantic cache
        try:
            embedding = get_embedding(query)
            self._semantic.append({
                "embedding": embedding,
                "query": query,
                "doc_id": doc_id,
                **result,
            })

            # Keep semantic cache manageable (max 200 entries)
            if len(self._semantic) > 200:
                self._semantic = self._semantic[-100:]
        except Exception as e:
            print(f"Cache store error: {e}")


# Singleton instance
cache_layer = CacheLayer()
