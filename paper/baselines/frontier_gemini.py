"""Gemini 4 Argon for the frontier baseline (BASELINES.md, "Frontier"): one generateContent request per problem.

thinkingLevel "high"; maxOutputTokens covers thought tokens and the visible reply. No sampling parameters.
Billed output = candidates + thoughts (ai.google.dev/gemini-api/docs/pricing: "Output price (including thinking
tokens)").
"""

import threading

from google import genai
from google.genai import errors, types

MODEL = "gemini-4-argon"
PRICE_IN, PRICE_OUT = 2.00, 10.00  # USD per million tokens through 30 Nov 2026, ai.google.dev/gemini-api/docs/pricing

_client = None
_lock = threading.Lock()  # one client for all threads: a second one, once dropped, closes its connection pool


def client():
    global _client
    with _lock:
        if _client is None:
            _client = genai.Client(http_options=types.HttpOptions(timeout=1_800_000))  # reads GEMINI_API_KEY
        return _client


def call(prompt, cap):
    r = client().models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            max_output_tokens=cap,
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.HIGH),
        ),
    )
    cand = r.candidates[0] if r.candidates else None
    finish = str(cand.finish_reason.name if cand and cand.finish_reason else None)
    text = "".join(p.text or "" for p in (cand.content.parts if cand and cand.content and cand.content.parts else [])
                   if not getattr(p, "thought", False))
    um = r.usage_metadata
    out = (um.candidates_token_count or 0) + (um.thoughts_token_count or 0)
    return {
        "model": MODEL + (f" ({r.model_version})" if getattr(r, "model_version", None) else ""),
        "text": text,
        "tokens": out,
        "reasoning_tokens": um.thoughts_token_count,
        "prompt_tokens": um.prompt_token_count,
        "hit_cap": finish == "MAX_TOKENS",
        "finish_reason": finish,
        "cost": ((um.prompt_token_count or 0) * PRICE_IN + out * PRICE_OUT) / 1e6,
    }


RETRYABLE = (errors.ServerError,)


def retryable(e):
    return isinstance(e, errors.ServerError) or (isinstance(e, errors.ClientError) and e.code == 429)
