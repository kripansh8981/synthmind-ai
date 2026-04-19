# ══════════════════════════════════════════════════════════════
# In-Memory Vector Store with Cosine Similarity + BM25
# Stores document chunks with their embeddings for fast retrieval
# ══════════════════════════════════════════════════════════════

import math
import numpy as np


class VectorStore:
    """
    In-memory vector store supporting:
    - Cosine similarity vector search
    - BM25 keyword search
    - Multi-document search
    """

    def __init__(self):
        # { doc_id: [{ content, embedding, index, pageNumber }] }
        self._store: dict[str, list[dict]] = {}

    def add_document(self, doc_id: str, chunks: list[dict]):
        """Add document chunks with embeddings to the store."""
        self._store[doc_id] = chunks

    def remove_document(self, doc_id: str):
        """Remove a document from the store."""
        self._store.pop(doc_id, None)

    def has_document(self, doc_id: str) -> bool:
        """Check if a document exists and has chunks."""
        return doc_id in self._store and len(self._store[doc_id]) > 0

    def get_document_chunks(self, doc_id: str) -> list[dict]:
        """Get all chunks for a document."""
        return self._store.get(doc_id, [])

    @staticmethod
    def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
        """Compute cosine similarity between two vectors using numpy."""
        a = np.array(vec_a)
        b = np.array(vec_b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))

    def vector_search(self, doc_id: str, query_embedding: list[float], top_k: int = 10) -> list[dict]:
        """Find top-K most similar chunks by cosine similarity."""
        chunks = self._store.get(doc_id, [])
        if not chunks:
            return []

        scored = []
        for chunk in chunks:
            score = self.cosine_similarity(query_embedding, chunk["embedding"])
            scored.append({**chunk, "score": score})

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]

    def multi_doc_vector_search(self, doc_ids: list[str], query_embedding: list[float], top_k: int = 10) -> list[dict]:
        """Search across multiple documents."""
        all_results = []
        for doc_id in doc_ids:
            results = self.vector_search(doc_id, query_embedding, top_k)
            all_results.extend([{**r, "docId": doc_id} for r in results])

        all_results.sort(key=lambda x: x["score"], reverse=True)
        return all_results[:top_k]

    def bm25_search(self, doc_id: str, query: str, top_k: int = 10) -> list[dict]:
        """
        BM25 keyword search.
        Parameters: k1=1.5, b=0.75 (standard BM25 defaults)
        """
        chunks = self._store.get(doc_id, [])
        if not chunks:
            return []

        query_terms = [t for t in query.lower().split() if len(t) > 2]
        N = len(chunks)
        avg_dl = sum(len(c["content"].split()) for c in chunks) / N
        k1 = 1.5
        b = 0.75

        # Calculate IDF for each query term
        idf = {}
        for term in query_terms:
            df = sum(1 for c in chunks if term in c["content"].lower())
            idf[term] = math.log((N - df + 0.5) / (df + 0.5) + 1)

        scored = []
        for chunk in chunks:
            words = chunk["content"].lower().split()
            dl = len(words)
            score = 0.0

            for term in query_terms:
                tf = sum(1 for w in words if term in w)
                numerator = tf * (k1 + 1)
                denominator = tf + k1 * (1 - b + b * (dl / avg_dl))
                score += idf.get(term, 0) * (numerator / denominator)

            scored.append({**chunk, "bm25Score": score})

        scored.sort(key=lambda x: x["bm25Score"], reverse=True)
        return scored[:top_k]

    def get_total_chunks(self) -> int:
        """Get total number of chunks across all documents."""
        return sum(len(chunks) for chunks in self._store.values())


# Singleton instance
vector_store = VectorStore()
