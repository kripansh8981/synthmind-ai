# ══════════════════════════════════════════════════════════════
# Generation Stage
# Context Compression → Draft (Groq/Llama) → Refinement (Gemini)
# → Self-Reflection (Gemini) → Citation Extraction
# ══════════════════════════════════════════════════════════════

import json
import time
from embeddings import call_gemini, call_groq


def compress_context(query: str, chunks: list[dict]) -> str:
    """Compress context by removing irrelevant parts using Gemini."""
    if not chunks:
        return ""

    context = "\n\n---\n\n".join(
        f"[Chunk {i + 1}{' | Page ' + str(c.get('pageNumber', '')) if c.get('pageNumber') else ''}]\n{c['content']}"
        for i, c in enumerate(chunks)
    )

    prompt = f"""Given the question and context chunks, extract and return ONLY the parts that are relevant to answering the question. Remove irrelevant information but preserve key details, numbers, and facts.

Question: "{query}"

Context:
{context}

Relevant compressed context:"""

    try:
        result = call_gemini(prompt)
        return result.strip()
    except Exception as e:
        print(f"Context compression error: {e}")
        return context


def generate_draft(query: str, compressed_context: str, intent: str) -> str:
    """Generate a draft answer using Groq (Llama 3.3 70B)."""
    intent_instructions = {
        "FACTUAL": "Provide a precise, factual answer with specific details.",
        "ANALYTICAL": "Provide a thorough analysis with reasoning and comparisons.",
        "SUMMARY": "Provide a clear, structured summary of the main points.",
        "PROCEDURAL": "Provide step-by-step instructions or process description.",
        "OPINION": "Provide evidence-based recommendations with pros and cons.",
    }

    system_prompt = f"""You are an expert document analyst. Answer questions based ONLY on the provided context. {intent_instructions.get(intent, intent_instructions['FACTUAL'])}

Rules:
- Answer ONLY from the context provided
- If the context doesn't contain enough information, say so clearly
- Use markdown formatting for readability
- Be thorough but concise
- Reference specific parts of the context when possible"""

    prompt = f"""Context:
{compressed_context}

Question: {query}

Answer:"""

    try:
        result = call_groq(prompt, system_prompt)
        return result.strip()
    except Exception as e:
        print(f"Draft generation error: {e}")
        # Fallback to Gemini if Groq fails
        return call_gemini(prompt, system_prompt).strip()


def refine_answer(query: str, draft: str, context: str, intent: str) -> str:
    """Refine the draft answer using Gemini for improved quality."""
    prompt = f"""You are a reasoning expert. Review and improve this draft answer. Fix any errors, improve clarity, add missing details from the context, and ensure logical reasoning.

Question: "{query}"
Intent: {intent}

Context:
{context}

Draft Answer:
{draft}

Provide an improved, refined answer in markdown format:"""

    try:
        result = call_gemini(prompt)
        return result.strip()
    except Exception as e:
        print(f"Refinement error: {e}")
        return draft


def self_reflect(query: str, answer: str, context: str) -> dict:
    """Self-reflection and confidence scoring using Gemini."""
    prompt = f"""You are a quality assurance expert. Evaluate this answer for accuracy and completeness.

Question: "{query}"

Context (ground truth):
{context[:2000]}

Answer to evaluate:
{answer}

Respond in this EXACT JSON format (no markdown code blocks):
{{"confidence": <0-100>, "reasoning": "<brief explanation>", "issues": "<any issues found or 'none'>", "improved_answer": "<if confidence < 70, provide improved answer, otherwise write 'N/A'>"}}"""

    try:
        result = call_gemini(prompt)
        # Extract JSON from potential markdown code blocks
        cleaned = result.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(cleaned)
        return {
            "confidence": min(100, max(0, parsed.get("confidence", 75))),
            "reasoning": parsed.get("reasoning", ""),
            "issues": parsed.get("issues", "none"),
            "improvedAnswer": parsed.get("improved_answer") if parsed.get("improved_answer") != "N/A" else None,
        }
    except Exception as e:
        print(f"Self-reflection error: {e}")
        return {"confidence": 75, "reasoning": "Auto-assessed", "issues": "none", "improvedAnswer": None}


def extract_citations(answer: str, chunks: list[dict]) -> list[dict]:
    """Extract citations by matching chunk phrases in the answer."""
    citations = []
    answer_lower = answer.lower()

    for i, chunk in enumerate(chunks):
        # Check if key phrases from the chunk appear in the answer
        phrases = [s.strip() for s in chunk["content"].split(".") if len(s.strip()) > 20]
        for phrase in phrases:
            clean_phrase = phrase[:50].lower()
            if clean_phrase in answer_lower:
                citations.append({
                    "chunkIndex": chunk.get("index", i),
                    "content": chunk["content"][:150],
                    "pageNumber": chunk.get("pageNumber"),
                })
                break

    return citations[:5]


def out_of_domain_rejection(query: str) -> str:
    """Generate a polite rejection message for out-of-domain queries."""
    prompt = f"""The uploaded document does not contain relevant information to answer this question. Generate a polite, helpful rejection message explaining that the question is outside the scope of the uploaded document(s).

Question: "{query}"

Rejection message:"""

    try:
        result = call_gemini(prompt)
        return result.strip()
    except Exception:
        return (
            "I couldn't find relevant information in the uploaded document(s) to answer "
            "this question. Please try rephrasing your question or upload a document that "
            "contains the relevant information."
        )


def run_generation(query: str, chunks: list[dict], intent: str, context: str) -> dict:
    """
    Full generation pipeline with timing.
    Steps: Context Compression → Draft (Groq) → Refine (Gemini)
           → Self-Reflect → Citation Extraction
    """
    steps = {}
    start_time = time.time()

    # Check if chunks were found
    if not chunks:
        t1 = time.time()
        rejection = out_of_domain_rejection(query)
        steps["outOfDomain"] = {
            "triggered": True,
            "time": int((time.time() - t1) * 1000),
        }
        return {
            "answer": rejection,
            "confidence": 0,
            "citations": [],
            "steps": steps,
            "totalTime": int((time.time() - start_time) * 1000),
        }

    # Step 1: Context Compression
    t1 = time.time()
    raw_context = "\n\n---\n\n".join(
        f"[Chunk {i + 1}{' | Page ' + str(c.get('pageNumber', '')) if c.get('pageNumber') else ''}]\n{c['content']}"
        for i, c in enumerate(chunks)
    )
    compressed = compress_context(query, chunks)
    steps["contextCompression"] = {
        "inputLength": len(raw_context),
        "outputLength": len(compressed),
        "ratio": f"{len(compressed) / len(raw_context) * 100:.1f}%",
        "time": int((time.time() - t1) * 1000),
    }

    # Step 2: Draft Generation (Groq/Llama)
    t2 = time.time()
    draft = generate_draft(query, compressed, intent)
    steps["draftGeneration"] = {
        "model": "Groq / Llama 3.3 70B",
        "length": len(draft),
        "time": int((time.time() - t2) * 1000),
    }

    # Step 3: Reasoning + Refinement (Gemini)
    t3 = time.time()
    refined = refine_answer(query, draft, compressed, intent)
    steps["refinement"] = {
        "model": "Gemini 2.0 Flash",
        "inputLength": len(draft),
        "outputLength": len(refined),
        "time": int((time.time() - t3) * 1000),
    }

    # Step 4: Self-Reflection + Confidence (Gemini)
    t4 = time.time()
    reflection = self_reflect(query, refined, raw_context)
    steps["selfReflection"] = {
        "model": "Gemini 2.0 Flash",
        "confidence": reflection["confidence"],
        "reasoning": reflection["reasoning"],
        "issues": reflection["issues"],
        "time": int((time.time() - t4) * 1000),
    }

    # Use improved answer if confidence was low
    final_answer = reflection["improvedAnswer"] or refined

    # Step 5: Citation Extraction
    citations = extract_citations(final_answer, chunks)
    steps["citations"] = {"found": len(citations)}

    return {
        "answer": final_answer,
        "confidence": reflection["confidence"],
        "citations": citations,
        "steps": steps,
        "totalTime": int((time.time() - start_time) * 1000),
    }
