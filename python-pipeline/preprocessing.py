# ══════════════════════════════════════════════════════════════
# Pre-Processing Stage
# Uses Gemini for: spell correction, query expansion,
# intent classification, contextual rewrite
# ══════════════════════════════════════════════════════════════

import re
import time
from embeddings import call_gemini


def spell_correction(query: str) -> str:
    """Fix spelling errors in a query using Gemini."""
    prompt = f"""Fix any spelling errors in this query. Return ONLY the corrected query, nothing else. If there are no errors, return the query as-is.

Query: "{query}"

Corrected:"""

    try:
        result = call_gemini(prompt)
        return result.strip().strip("\"'")
    except Exception as e:
        print(f"Spell correction error: {e}")
        return query


def query_expansion(query: str) -> str:
    """Expand a query with synonyms and related terms using Gemini."""
    prompt = f"""Given this search query, generate an expanded version that includes synonyms and related terms to improve document retrieval. Return ONLY the expanded query, keep it concise (max 2 sentences).

Query: "{query}"

Expanded query:"""

    try:
        result = call_gemini(prompt)
        return result.strip()
    except Exception as e:
        print(f"Query expansion error: {e}")
        return query


def intent_classification(query: str) -> str:
    """Classify a query into one of 5 intent categories using Gemini."""
    prompt = f"""Classify this question into exactly one category. Return ONLY the category name.

Categories:
- FACTUAL (asking for specific facts, definitions, numbers)
- ANALYTICAL (asking for analysis, comparison, reasoning)
- SUMMARY (asking for overview, summary, main points)
- PROCEDURAL (asking how to do something, steps)
- OPINION (asking for recommendations, best practices)

Question: "{query}"

Category:"""

    try:
        result = call_gemini(prompt)
        category = result.strip().upper()
        valid = {"FACTUAL", "ANALYTICAL", "SUMMARY", "PROCEDURAL", "OPINION"}
        return category if category in valid else "FACTUAL"
    except Exception:
        return "FACTUAL"


def contextual_rewrite(query: str, conversation_history: list[dict] = None) -> str:
    """Rewrite a query to be self-contained using conversation history."""
    if not conversation_history:
        return query

    history_text = "\n".join(
        f"{m['role']}: {m['content'][:200]}"
        for m in conversation_history[-4:]
    )

    prompt = f"""Given the conversation history and the latest question, rewrite the question to be self-contained (resolve pronouns, references). Return ONLY the rewritten question.

Conversation:
{history_text}

Latest question: "{query}"

Self-contained question:"""

    try:
        result = call_gemini(prompt)
        return result.strip().strip("\"'")
    except Exception as e:
        print(f"Contextual rewrite error: {e}")
        return query


def run_preprocessing(query: str, conversation_history: list[dict] = None) -> dict:
    """
    Full pre-processing pipeline with timing.
    Steps: Spell Correction → Query Expansion → Intent Classification → Contextual Rewrite
    """
    steps = {}
    start_time = time.time()

    # Step 1: Spell Correction
    corrected = spell_correction(query)
    steps["spellCorrection"] = {
        "input": query,
        "output": corrected,
        "changed": query != corrected,
        "time": int((time.time() - start_time) * 1000),
    }

    # Step 2: Query Expansion
    t2 = time.time()
    expanded = query_expansion(corrected)
    steps["queryExpansion"] = {
        "input": corrected,
        "output": expanded,
        "time": int((time.time() - t2) * 1000),
    }

    # Step 3: Intent Classification
    t3 = time.time()
    intent = intent_classification(corrected)
    steps["intentClassification"] = {
        "query": corrected,
        "intent": intent,
        "time": int((time.time() - t3) * 1000),
    }

    # Step 4: Contextual Rewrite
    t4 = time.time()
    rewritten = contextual_rewrite(corrected, conversation_history)
    steps["contextualRewrite"] = {
        "input": corrected,
        "output": rewritten,
        "hasHistory": bool(conversation_history),
        "time": int((time.time() - t4) * 1000),
    }

    return {
        "originalQuery": query,
        "processedQuery": rewritten,
        "expandedQuery": expanded,
        "intent": intent,
        "steps": steps,
        "totalTime": int((time.time() - start_time) * 1000),
    }
