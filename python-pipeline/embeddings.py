# ══════════════════════════════════════════════════════════════
# Gemini & Groq API Helpers
# Uses gemini-embedding-001 for embeddings, gemini-2.0-flash
# for completions, and Groq Llama 3.3 70B for fast drafts.
# ══════════════════════════════════════════════════════════════

import os
import time
import math
import random
import requests

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"


def get_embedding(text: str) -> list[float]:
    """Get embedding vector from Gemini embedding-001 model."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set")

    url = f"{GEMINI_API_BASE}/models/gemini-embedding-001:embedContent?key={api_key}"
    payload = {
        "model": "models/gemini-embedding-001",
        "content": {"parts": [{"text": text}]},
    }

    resp = requests.post(url, json=payload, timeout=30)
    if not resp.ok:
        raise RuntimeError(f"Embedding API error: {resp.text}")

    data = resp.json()
    return data["embedding"]["values"]


def get_embedding_with_retry(text: str, max_retries: int = 3) -> list[float]:
    """Get embedding with exponential backoff retry on rate limits."""
    for attempt in range(max_retries):
        try:
            return get_embedding(text)
        except RuntimeError as e:
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                delay = (2 ** attempt) * 2.0 + random.random()
                print(f"Rate limited, retry {attempt + 1}/{max_retries} after {delay:.0f}s")
                time.sleep(delay)
            else:
                raise
    raise RuntimeError("Max retries exceeded for embedding")


def get_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Get embeddings for multiple texts.
    Processes in batches of 3 with 2s delay between batches
    to respect the free-tier rate limit (100 req/min).
    """
    results = []
    batch_size = 3

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        batch_results = [get_embedding_with_retry(t) for t in batch]
        results.extend(batch_results)

        # Delay between batches
        if i + batch_size < len(texts):
            time.sleep(2)

    return results


def call_gemini(prompt: str, system_instruction: str = "") -> str:
    """Call Gemini 2.0 Flash for text generation."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set")

    url = f"{GEMINI_API_BASE}/models/gemini-2.0-flash:generateContent?key={api_key}"

    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 2048,
        },
    }

    if system_instruction:
        body["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    resp = requests.post(url, json=body, timeout=60)
    if not resp.ok:
        raise RuntimeError(f"Gemini API error: {resp.text}")

    data = resp.json()
    candidates = data.get("candidates", [])
    if candidates:
        parts = candidates[0].get("content", {}).get("parts", [])
        if parts:
            return parts[0].get("text", "")
    return ""


def call_groq(prompt: str, system_prompt: str = "") -> str:
    """Call Groq Llama 3.3 70B for fast draft generation."""
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set")

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    resp = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json={
            "model": "llama-3.3-70b-versatile",
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": 2048,
        },
        timeout=60,
    )

    if not resp.ok:
        raise RuntimeError(f"Groq API error: {resp.text}")

    data = resp.json()
    choices = data.get("choices", [])
    if choices:
        return choices[0].get("message", {}).get("content", "")
    return ""
