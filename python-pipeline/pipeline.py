# ══════════════════════════════════════════════════════════════
# Main Pipeline Orchestrator
# Cache → Pre-Processing → Retrieval → Generation → Post-Processing
# ══════════════════════════════════════════════════════════════

import time
from cache import cache_layer
from preprocessing import run_preprocessing
from retrieval import run_retrieval
from generation import run_generation


def run_pipeline(query: str, doc_id: str, conversation_history: list[dict] = None) -> dict:
    """
    Run the full RAG pipeline.

    Stages:
    1. Cache Layer (exact + semantic)
    2. Pre-Processing (spell correct, expand, intent, rewrite)
    3. Retrieval (HyDE + vector + BM25 + RRF + rerank)
    4. Generation (compress + draft + refine + reflect)
    5. Post-Processing (cache result)
    """
    if conversation_history is None:
        conversation_history = []

    pipeline = {"steps": {}, "timings": {}, "totalTime": 0}
    start_time = time.time()

    # ═══════════════════════════════════════════════════
    # STAGE 1: CACHE LAYER
    # ═══════════════════════════════════════════════════
    cache_start = time.time()

    # Check exact cache
    exact_hit = cache_layer.check_exact(query, doc_id)
    if exact_hit:
        pipeline["steps"]["cache"] = {
            "type": "EXACT_HIT",
            "time": int((time.time() - cache_start) * 1000),
        }
        pipeline["totalTime"] = int((time.time() - start_time) * 1000)
        return {
            "answer": exact_hit.get("answer", ""),
            "confidence": exact_hit.get("confidence", 0),
            "citations": exact_hit.get("citations", []),
            "cached": True,
            "cacheType": "exact",
            "pipeline": pipeline,
        }

    # Check semantic cache
    semantic_hit = cache_layer.check_semantic(query, doc_id)
    if semantic_hit:
        pipeline["steps"]["cache"] = {
            "type": "SEMANTIC_HIT",
            "similarity": f"{semantic_hit.get('similarity', 0):.4f}",
            "time": int((time.time() - cache_start) * 1000),
        }
        pipeline["totalTime"] = int((time.time() - start_time) * 1000)
        return {
            "answer": semantic_hit.get("answer", ""),
            "confidence": semantic_hit.get("confidence", 0),
            "citations": semantic_hit.get("citations", []),
            "cached": True,
            "cacheType": "semantic",
            "pipeline": pipeline,
        }

    pipeline["steps"]["cache"] = {
        "type": "MISS",
        "exactChecked": True,
        "semanticChecked": True,
        "time": int((time.time() - cache_start) * 1000),
    }

    # ═══════════════════════════════════════════════════
    # STAGE 2: PRE-PROCESSING (Gemini)
    # ═══════════════════════════════════════════════════
    preprocess_result = run_preprocessing(query, conversation_history)
    pipeline["steps"]["preprocessing"] = {
        **preprocess_result["steps"],
        "totalTime": preprocess_result["totalTime"],
    }

    # ═══════════════════════════════════════════════════
    # STAGE 3: RETRIEVAL (HyDE + Hybrid Search + Re-rank)
    # ═══════════════════════════════════════════════════
    retrieval_result = run_retrieval(
        preprocess_result["processedQuery"],
        preprocess_result["expandedQuery"],
        doc_id,
    )
    pipeline["steps"]["retrieval"] = {
        **retrieval_result["steps"],
        "chunksFound": len(retrieval_result["chunks"]),
        "totalTime": retrieval_result["totalTime"],
    }

    # ═══════════════════════════════════════════════════
    # STAGE 4: GENERATION (Groq Draft + Gemini Refine + Reflect)
    # ═══════════════════════════════════════════════════
    generation_result = run_generation(
        preprocess_result["processedQuery"],
        retrieval_result["chunks"],
        preprocess_result["intent"],
        "",
    )
    pipeline["steps"]["generation"] = {
        **generation_result["steps"],
        "totalTime": generation_result["totalTime"],
    }

    # ═══════════════════════════════════════════════════
    # STAGE 5: POST-PROCESSING (Cache + Analytics)
    # ═══════════════════════════════════════════════════
    post_start = time.time()

    # Store in cache
    cache_layer.store(query, doc_id, {
        "answer": generation_result["answer"],
        "confidence": generation_result["confidence"],
        "citations": generation_result["citations"],
    })

    pipeline["steps"]["postProcessing"] = {
        "cachedResult": True,
        "time": int((time.time() - post_start) * 1000),
    }

    pipeline["totalTime"] = int((time.time() - start_time) * 1000)

    return {
        "answer": generation_result["answer"],
        "confidence": generation_result["confidence"],
        "citations": generation_result["citations"],
        "cached": False,
        "pipeline": pipeline,
    }
