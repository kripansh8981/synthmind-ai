# ══════════════════════════════════════════════════════════════
# SynthMind AI — Python Pipeline Server
# FastAPI backend serving the RAG pipeline
# ══════════════════════════════════════════════════════════════
#
# Endpoints:
#   POST /api/pipeline/process-doc  — Embed chunks + generate summary
#   POST /api/pipeline/query        — Run full RAG pipeline
#   GET  /api/pipeline/health       — Health check
#
# Start:  python main.py
# Runs on: http://localhost:8000
# ══════════════════════════════════════════════════════════════

import os
import sys
import time
import traceback

from dotenv import load_dotenv

# Load env vars from the Next.js .env.local file
env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
load_dotenv(env_path)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from embeddings import get_embeddings
from summarization import generate_document_summary
from vector_store import vector_store
from pipeline import run_pipeline

# ── FastAPI App ──────────────────────────────────────────────

app = FastAPI(title="SynthMind AI Pipeline", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response Models ────────────────────────────────

class ChunkInput(BaseModel):
    content: str
    index: int
    pageNumber: int = 1


class ProcessDocRequest(BaseModel):
    doc_id: str
    chunks: list[ChunkInput]
    full_text: str


class QueryRequest(BaseModel):
    query: str
    doc_id: str
    conversation_history: list[dict] = []


# ── Endpoints ────────────────────────────────────────────────

@app.get("/api/pipeline/health")
def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "SynthMind Python Pipeline",
        "totalChunks": vector_store.get_total_chunks(),
        "gemini_key": "configured" if os.environ.get("GEMINI_API_KEY") else "missing",
        "groq_key": "configured" if os.environ.get("GROQ_API_KEY") else "missing",
    }


@app.post("/api/pipeline/process-doc")
async def process_document(req: ProcessDocRequest):
    """
    Process a document: generate embeddings + TF-IDF summary.
    Called by Next.js upload/scrape routes after file parsing.
    """
    try:
        start_time = time.time()
        print(f"[Pipeline] Processing doc {req.doc_id}: {len(req.chunks)} chunks, {len(req.full_text)} chars")

        # Convert Pydantic models to dicts
        chunks = [c.model_dump() for c in req.chunks]
        chunk_texts = [c["content"] for c in chunks]

        # Generate embeddings
        print(f"[Pipeline] Generating embeddings for {len(chunk_texts)} chunks...")
        embeddings = get_embeddings(chunk_texts)

        # Store in vector store
        vector_chunks = [{**chunk, "embedding": emb} for chunk, emb in zip(chunks, embeddings)]
        vector_store.add_document(req.doc_id, vector_chunks)
        print(f"[Pipeline] Stored {len(vector_chunks)} chunks in vector store")

        # Generate summary
        summary_result = None
        try:
            print(f"[Pipeline] Generating TF-IDF summary...")
            summary_result = generate_document_summary(req.full_text)
            print(
                f"[Pipeline] Summary: {len(summary_result.get('abstractive', ''))} chars, "
                f"{len(summary_result.get('keywords', []))} keywords, "
                f"{summary_result.get('time', 0)}ms"
            )
        except Exception as e:
            print(f"[Pipeline] Summarization error (non-fatal): {e}")

        elapsed = int((time.time() - start_time) * 1000)
        print(f"[Pipeline] Document processed in {elapsed}ms")

        return {
            "status": "ready",
            "embeddingsCount": len(embeddings),
            "summary": summary_result,
            "processingTime": elapsed,
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")


@app.post("/api/pipeline/query")
async def query_pipeline(req: QueryRequest):
    """
    Run the full RAG pipeline for a chat query.
    Called by Next.js chat/query route.
    """
    try:
        start_time = time.time()
        print(f"[Pipeline] Query: '{req.query[:80]}...' on doc {req.doc_id}")

        # Check if document is indexed
        if not vector_store.has_document(req.doc_id):
            raise HTTPException(
                status_code=400,
                detail="Document not indexed. Please re-upload or wait for processing.",
            )

        # Run the full pipeline
        result = run_pipeline(req.query, req.doc_id, req.conversation_history)

        elapsed = int((time.time() - start_time) * 1000)
        print(
            f"[Pipeline] Response: confidence={result.get('confidence', 0)}, "
            f"cached={result.get('cached', False)}, {elapsed}ms"
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")


@app.get("/api/pipeline/stats")
def get_stats():
    """Get vector store stats (total chunks count)."""
    return {"totalChunks": vector_store.get_total_chunks()}


@app.post("/api/pipeline/reindex")
async def reindex_document(req: ProcessDocRequest):
    """
    Re-index a document that's already in the DB.
    Called by document list route when doc is not in vector store.
    """
    try:
        print(f"[Pipeline] Re-indexing doc {req.doc_id}: {len(req.chunks)} chunks")
        chunks = [c.model_dump() for c in req.chunks]
        chunk_texts = [c["content"] for c in chunks]

        embeddings = get_embeddings(chunk_texts)
        vector_chunks = [{**chunk, "embedding": emb} for chunk, emb in zip(chunks, embeddings)]
        vector_store.add_document(req.doc_id, vector_chunks)

        print(f"[Pipeline] Re-indexed {len(vector_chunks)} chunks for doc {req.doc_id}")
        return {"status": "ok", "chunksIndexed": len(vector_chunks)}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Re-index error: {str(e)}")


@app.delete("/api/pipeline/document/{doc_id}")
def delete_document(doc_id: str):
    """Remove a document from the vector store."""
    vector_store.remove_document(doc_id)
    print(f"[Pipeline] Removed doc {doc_id} from vector store")
    return {"status": "ok"}


@app.get("/api/pipeline/document/{doc_id}/exists")
def check_document(doc_id: str):
    """Check if a document exists in the vector store."""
    return {"exists": vector_store.has_document(doc_id)}


# ── Main Entry Point ────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    print("=" * 60)
    print("  SynthMind AI - Python Pipeline Server")
    print("=" * 60)
    print(f"  GEMINI_API_KEY: {'[OK] configured' if os.environ.get('GEMINI_API_KEY') else '[X] MISSING'}")
    print(f"  GROQ_API_KEY:   {'[OK] configured' if os.environ.get('GROQ_API_KEY') else '[X] MISSING'}")
    print("=" * 60)

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
