# ══════════════════════════════════════════════════════════════
# TF-IDF Extractive + LLM Abstractive Document Summarization
# ══════════════════════════════════════════════════════════════
#
# Pipeline: Document Text → Sentence Split → Tokenize → TF-IDF Score
#           → Top-K Sentences (Extractive) → Gemini Polish (Abstractive)
#
# Mathematical Foundation:
#   TF(t,d) = count(t in d) / |d|
#   IDF(t)  = log(N / (df(t) + 1))
#   TF-IDF(t,d) = TF(t,d) × IDF(t)
#   SentenceScore = mean(TF-IDF of all terms in sentence)
#

import re
import math
import time
from embeddings import call_gemini

# ─────────────────────────────────────────────────
# Stopwords — high-frequency words with no topical value
# Removing these prevents TF-IDF from scoring common
# function words as important.
# ─────────────────────────────────────────────────
STOPWORDS = {
    'a', 'an', 'the', 'and', 'or', 'but', 'not', 'nor', 'so', 'yet',
    'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'having',
    'do', 'does', 'did', 'doing',
    'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could',
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
    'you', 'your', 'yours', 'yourself', 'yourselves',
    'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
    'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further',
    'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
    'just', 'because', 'about', 'up', 'down', 'if', 'while', 'also',
    'until', 'against', 'any', 'many', 'much', 'even', 'well', 'back',
    'still', 'since', 'around', 'however', 'therefore', 'thus', 'hence',
    'although', 'though', 'whether', 'either', 'neither', 'else',
    'already', 'always', 'never', 'often', 'sometimes', 'usually',
    'rather', 'quite', 'perhaps', 'almost', 'enough', 'really',
}


# ─────────────────────────────────────────────────
# Step 1: Split text into sentences
# Uses regex to split on sentence-ending punctuation
# while handling abbreviations and decimals.
# ─────────────────────────────────────────────────
def split_into_sentences(text: str) -> list[str]:
    """Split text on sentence boundaries (.!?) followed by whitespace."""
    raw = re.split(r'(?<=[.!?])\s+', text)

    # Filter out very short fragments
    return [
        s.strip()
        for s in raw
        if len(s.strip().split()) >= 5 and len(s.strip()) >= 20
    ]


# ─────────────────────────────────────────────────
# Step 2: Tokenize a sentence
# Lowercase → split on non-alphanumeric → remove
# stopwords → remove short tokens (< 3 chars)
# ─────────────────────────────────────────────────
def tokenize(text: str) -> list[str]:
    """Tokenize text: lowercase, remove punctuation, filter stopwords."""
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    tokens = text.split()
    return [
        t for t in tokens
        if len(t) >= 3
        and t not in STOPWORDS
        and not t.isdigit()
    ]


# ─────────────────────────────────────────────────
# Step 3: Compute Term Frequency (TF)
# TF(t, d) = count(t in d) / total_terms_in_d
#
# We normalize by document length to prevent bias
# toward longer sentences.
# ─────────────────────────────────────────────────
def compute_tf(tokens: list[str]) -> dict[str, float]:
    """Compute normalized term frequency for a list of tokens."""
    tf = {}
    total = len(tokens)
    if total == 0:
        return tf

    for token in tokens:
        tf[token] = tf.get(token, 0) + 1

    for term in tf:
        tf[term] = tf[term] / total

    return tf


# ─────────────────────────────────────────────────
# Step 4: Compute Inverse Document Frequency (IDF)
# IDF(t) = log(N / (df(t) + 1))
#
# Each sentence is treated as a "document" in the
# corpus. Words appearing in many sentences get
# lower IDF (less informative). Rare words get
# higher IDF (more informative).
#
# The +1 prevents division by zero (Laplace smoothing).
# ─────────────────────────────────────────────────
def compute_idf(tokenized_sentences: list[list[str]]) -> dict[str, float]:
    """Compute IDF across all sentences (each sentence = one document)."""
    n = len(tokenized_sentences)
    df = {}  # document frequency

    for tokens in tokenized_sentences:
        unique_tokens = set(tokens)
        for token in unique_tokens:
            df[token] = df.get(token, 0) + 1

    idf = {}
    for term, freq in df.items():
        idf[term] = math.log(n / (freq + 1))

    return idf


# ─────────────────────────────────────────────────
# Step 5: Compute TF-IDF score for a sentence
# Score = mean TF-IDF of all (non-stopword) terms
#
# Using mean (not sum) prevents bias toward longer
# sentences that naturally have more terms.
# ─────────────────────────────────────────────────
def score_sentence(tokens: list[str], tf: dict, idf: dict) -> float:
    """Score a sentence as the mean TF-IDF of its terms."""
    if not tokens:
        return 0.0

    total_score = 0.0
    count = 0

    for token in tokens:
        tf_val = tf.get(token, 0)
        idf_val = idf.get(token, 0)
        total_score += tf_val * idf_val
        count += 1

    return total_score / count if count > 0 else 0.0


# ─────────────────────────────────────────────────
# Step 6: Extract top-K keywords by TF-IDF score
# Aggregates TF-IDF across all sentences to find
# the most characteristic words in the document.
# ─────────────────────────────────────────────────
def extract_keywords(tokenized_sentences: list[list[str]], idf: dict, top_k: int = 10) -> list[str]:
    """Extract top-K keywords by global TF-IDF score."""
    global_tf = {}
    total_tokens = 0

    for tokens in tokenized_sentences:
        for token in tokens:
            global_tf[token] = global_tf.get(token, 0) + 1
            total_tokens += 1

    if total_tokens == 0:
        return []

    # Compute global TF-IDF
    tfidf_scores = {}
    for term, count in global_tf.items():
        tf = count / total_tokens
        idf_val = idf.get(term, 0)
        tfidf_scores[term] = tf * idf_val

    # Sort by score descending, return top-K terms
    sorted_terms = sorted(tfidf_scores.items(), key=lambda x: x[1], reverse=True)
    return [term for term, _ in sorted_terms[:top_k]]


# ═══════════════════════════════════════════════════
# MAIN: TF-IDF Extractive Summarization
# ═══════════════════════════════════════════════════
#
# Algorithm:
# 1. Split document text into sentences
# 2. Tokenize each sentence (lowercase, no stopwords)
# 3. Compute TF for each sentence
# 4. Compute IDF across all sentences
# 5. Score each sentence = mean(TF-IDF of its terms)
# 6. Select top-K sentences by score
# 7. Reorder selected sentences by original position
#    (maintains document flow/readability)
# 8. Extract top keywords for the document
#
# Returns: { extractive, keywords, sentenceScores, stats }
# ═══════════════════════════════════════════════════
def tfidf_extractive_summary(text: str, top_k: int = 7) -> dict:
    """Run TF-IDF extractive summarization on the input text."""

    # Step 1: Split into sentences
    sentences = split_into_sentences(text)

    if not sentences:
        return {
            "extractive": "",
            "keywords": [],
            "sentenceScores": [],
            "stats": {"totalSentences": 0, "selectedSentences": 0},
        }

    # If document is very short, return all sentences
    if len(sentences) <= top_k:
        tok_all = [tokenize(s) for s in sentences]
        idf_all = compute_idf(tok_all)
        return {
            "extractive": " ".join(sentences),
            "keywords": extract_keywords(tok_all, idf_all),
            "sentenceScores": [
                {"index": i, "score": 1, "sentence": s} for i, s in enumerate(sentences)
            ],
            "stats": {
                "totalSentences": len(sentences),
                "selectedSentences": len(sentences),
            },
        }

    # Step 2: Tokenize all sentences
    tokenized = [tokenize(s) for s in sentences]

    # Step 3 & 4: Compute IDF across all sentences
    idf = compute_idf(tokenized)

    # Step 5: Score each sentence
    scored = []
    for idx, sentence in enumerate(sentences):
        tokens = tokenized[idx]
        tf = compute_tf(tokens)
        score = score_sentence(tokens, tf, idf)
        scored.append({
            "index": idx,
            "score": score,
            "sentence": sentence,
            "tokenCount": len(tokens),
        })

    # Step 6: Select top-K sentences by TF-IDF score
    top_sentences = sorted(scored, key=lambda x: x["score"], reverse=True)[:top_k]

    # Step 7: Reorder by original position (maintains flow)
    top_sentences.sort(key=lambda x: x["index"])

    # Step 8: Extract top keywords
    keywords = extract_keywords(tokenized, idf, 10)

    avg_score = sum(s["score"] for s in top_sentences) / len(top_sentences)

    return {
        "extractive": " ".join(s["sentence"] for s in top_sentences),
        "keywords": keywords,
        "sentenceScores": [
            {
                "index": s["index"],
                "score": round(s["score"], 6),
                "sentence": s["sentence"][:100] + ("..." if len(s["sentence"]) > 100 else ""),
            }
            for s in top_sentences
        ],
        "stats": {
            "totalSentences": len(sentences),
            "selectedSentences": len(top_sentences),
            "avgScore": round(avg_score, 6),
            "uniqueTerms": len(idf),
        },
    }


# ═══════════════════════════════════════════════════
# LLM Abstractive Summarization
# ═══════════════════════════════════════════════════
#
# Takes the TF-IDF extracted sentences and uses
# Gemini to produce a fluent, coherent summary.
# The LLM is constrained to the extracted content,
# preventing hallucination.
# ═══════════════════════════════════════════════════
def abstractive_summary(extractive: str, keywords: list[str]) -> str:
    """Use Gemini to polish the extractive summary into a coherent paragraph."""
    prompt = f"""You are a document summarization expert. Given these key sentences extracted from a document using TF-IDF analysis, write a clear, coherent, and informative summary.

RULES:
- Write 150-250 words
- Maintain all key facts, numbers, and details from the extracted sentences
- Do NOT add information that isn't in the extracted sentences
- Make it flow naturally as a cohesive paragraph
- Use professional language
- Do NOT use markdown headings or bullet points — write in paragraph form

Key Topics: {', '.join(keywords)}

Extracted Key Sentences:
{extractive}

Summary:"""

    try:
        result = call_gemini(prompt)
        return result.strip()
    except Exception as e:
        print(f"Abstractive summary error: {e}")
        # Fallback: return extractive summary as-is
        return extractive


# ═══════════════════════════════════════════════════
# MAIN EXPORT: Full Summarization Pipeline
# ═══════════════════════════════════════════════════
#
# Document Text
#      │
#      ▼
# TF-IDF Extractive Summary (top 7 sentences)
#      │
#      ▼
# LLM Abstractive Polish (Gemini)
#      │
#      ▼
# { extractive, abstractive, keywords, stats }
# ═══════════════════════════════════════════════════
def generate_document_summary(text: str) -> dict:
    """Full summarization pipeline: TF-IDF extractive → Gemini abstractive."""
    start_time = time.time()

    # Limit text for very large documents (first 30K chars)
    input_text = text[:30000] if len(text) > 30000 else text

    # Step 1: TF-IDF Extractive Summary
    extractive_result = tfidf_extractive_summary(input_text, 7)

    if not extractive_result["extractive"]:
        return {
            "extractive": "Document is too short to summarize.",
            "abstractive": "Document is too short to summarize.",
            "keywords": [],
            "stats": extractive_result["stats"],
            "time": int((time.time() - start_time) * 1000),
        }

    # Step 2: LLM Abstractive Summary
    abstract = abstractive_summary(
        extractive_result["extractive"],
        extractive_result["keywords"],
    )

    elapsed = int((time.time() - start_time) * 1000)

    return {
        "extractive": extractive_result["extractive"],
        "abstractive": abstract,
        "keywords": extractive_result["keywords"],
        "sentenceScores": extractive_result["sentenceScores"],
        "stats": {
            **extractive_result["stats"],
            "inputLength": len(input_text),
            "extractiveLength": len(extractive_result["extractive"]),
            "abstractiveLength": len(abstract),
        },
        "time": elapsed,
    }
