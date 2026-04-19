# ══════════════════════════════════════════════════════════════
# Retrieval Stage
# HyDE → Hybrid Search (Vector + BM25) → Deduplicate
# → Reciprocal Rank Fusion → Semantic Re-ranking → Top 7
# ══════════════════════════════════════════════════════════════

import re
import time
from embeddings import get_embedding, call_gemini
from vector_store import vector_store


def generate_hyde(query: str) -> str:
    """
    HyDE: Generate a Hypothetical Document Embedding.
    Creates a hypothetical answer to improve vector search quality.
    """
    prompt = f"""Given this question, write a brief hypothetical answer paragraph (2-3 sentences) as if you had the information. This will be used to search for relevant documents.

Question: "{query}"

Hypothetical answer:"""

    try:
        result = call_gemini(prompt)
        return result.strip()
    except Exception as e:
        print(f"HyDE error: {e}")
        return query


def deduplicate_chunks(chunks: list[dict]) -> list[dict]:
    """Deduplicate chunks based on content similarity (first 100 chars)."""
    seen = set()
    result = []
    for chunk in chunks:
        normalized = chunk["content"].lower().strip()[:100]
        if normalized not in seen:
            seen.add(normalized)
            result.append(chunk)
    return result


def reciprocal_rank_fusion(vector_results: list[dict], bm25_results: list[dict], k: int = 60) -> list[dict]:
    """
    Merge vector + BM25 results using Reciprocal Rank Fusion.
    RRF(d) = Σ 1 / (k + rank)  for each ranking that contains d
    """
    scores = {}
    chunk_map = {}

    for rank, chunk in enumerate(vector_results):
        key = f"{chunk.get('index', 0)}-{chunk['content'][:50]}"
        scores[key] = scores.get(key, 0) + 1 / (k + rank + 1)
        chunk_map[key] = chunk

    for rank, chunk in enumerate(bm25_results):
        key = f"{chunk.get('index', 0)}-{chunk['content'][:50]}"
        scores[key] = scores.get(key, 0) + 1 / (k + rank + 1)
        if key not in chunk_map:
            chunk_map[key] = chunk

    # Sort by fusion score descending
    sorted_keys = sorted(scores.keys(), key=lambda k: scores[k], reverse=True)
    return [{**chunk_map[k], "fusionScore": scores[k]} for k in sorted_keys]


def semantic_rerank(query: str, chunks: list[dict], top_k: int = 7) -> list[dict]:
    """
    Semantic re-ranking using Gemini.
    Asks the LLM to rank chunks by relevance to the query.
    """
    if len(chunks) <= top_k:
        return chunks

    # Prepare chunk texts for ranking
    chunk_texts = "\n\n".join(
        f"[{i}] {c['content'][:300]}"
        for i, c in enumerate(chunks[:15])
    )

    prompt = f"""Given the question and the following text chunks, rank the top {top_k} most relevant chunk indices. Return ONLY comma-separated indices, most relevant first.

Question: "{query}"

Chunks:
{chunk_texts}

Top {top_k} indices (comma-separated):"""

    try:
        result = call_gemini(prompt)
        indices = [int(x) for x in re.findall(r'\d+', result) if int(x) < len(chunks)]

        if indices:
            reranked = [{**chunks[i], "reranked": True} for i in indices[:top_k]]
            return reranked
    except Exception as e:
        print(f"Rerank error: {e}")

    # Fallback: return top-K by existing score
    return chunks[:top_k]


def run_retrieval(query: str, expanded_query: str, doc_id: str) -> dict:
    """
    Full retrieval pipeline with timing.
    Steps: HyDE → Embeddings → Vector Search → BM25 → RRF → Re-rank
    """
    steps = {}
    start_time = time.time()

    # Step 1: HyDE
    t1 = time.time()
    hyde_answer = generate_hyde(query)
    steps["hyde"] = {
        "input": query,
        "hypotheticalAnswer": hyde_answer[:200],
        "time": int((time.time() - t1) * 1000),
    }

    # Step 2: Get embeddings for query + HyDE
    t2 = time.time()
    query_embedding = get_embedding(query)
    hyde_embedding = get_embedding(hyde_answer)
    steps["embeddings"] = {"time": int((time.time() - t2) * 1000)}

    # Step 3: Vector search with both embeddings
    t3 = time.time()
    vector_results1 = vector_store.vector_search(doc_id, query_embedding, 10)
    vector_results2 = vector_store.vector_search(doc_id, hyde_embedding, 10)

    # Merge and deduplicate vector results
    all_vector = deduplicate_chunks(vector_results1 + vector_results2)
    all_vector.sort(key=lambda x: x.get("score", 0), reverse=True)
    vector_top = all_vector[:12]

    steps["vectorSearch"] = {
        "queryResults": len(vector_results1),
        "hydeResults": len(vector_results2),
        "mergedUnique": len(vector_top),
        "topScore": f"{vector_top[0]['score']:.4f}" if vector_top and "score" in vector_top[0] else "N/A",
        "time": int((time.time() - t3) * 1000),
    }

    # Step 4: BM25 keyword search
    t4 = time.time()
    bm25_results = vector_store.bm25_search(doc_id, expanded_query or query, 10)
    steps["bm25Search"] = {
        "results": len(bm25_results),
        "topScore": f"{bm25_results[0]['bm25Score']:.4f}" if bm25_results and "bm25Score" in bm25_results[0] else "N/A",
        "time": int((time.time() - t4) * 1000),
    }

    # Step 5: Reciprocal Rank Fusion
    t5 = time.time()
    fused = reciprocal_rank_fusion(vector_top, bm25_results)
    deduped = deduplicate_chunks(fused)
    steps["fusion"] = {
        "fusedCount": len(deduped),
        "time": int((time.time() - t5) * 1000),
    }

    # Step 6: Semantic Re-ranking → Top 7
    t6 = time.time()
    top_chunks = semantic_rerank(query, deduped, 7)
    steps["reranking"] = {
        "inputCount": len(deduped),
        "outputCount": len(top_chunks),
        "time": int((time.time() - t6) * 1000),
    }

    return {
        "chunks": top_chunks,
        "steps": steps,
        "totalTime": int((time.time() - start_time) * 1000),
    }
