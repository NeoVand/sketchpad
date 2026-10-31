"""GPT-6.1 Sol for the frontier baseline (BASELINES.md, "Frontier"): one Responses API request per problem.

reasoning.effort "high"; max_output_tokens covers reasoning and the visible reply. No sampling parameters.
"""

import openai

MODEL = "gpt-6.1-sol"
PRICE_IN, PRICE_OUT = 2.00, 10.00  # USD per million tokens, developers.openai.com/api/docs/pricing

_client = None


def client():
    global _client
    if _client is None:
        _client = openai.OpenAI(max_retries=0, timeout=1800)  # retries are the driver's
    return _client


def call(prompt, cap):
    r = client().responses.create(
        model=MODEL,
        input=[{"role": "user", "content": prompt}],
        reasoning={"effort": "high"},
        max_output_tokens=cap,
        store=False,
    )
    u = r.usage
    reason = r.incomplete_details.reason if r.incomplete_details else None
    return {
        "model": r.model,
        "text": r.output_text or "",
        "tokens": u.output_tokens,
        "reasoning_tokens": u.output_tokens_details.reasoning_tokens if u.output_tokens_details else None,
        "prompt_tokens": u.input_tokens,
        "hit_cap": r.status == "incomplete" and reason == "max_output_tokens",
        "finish_reason": r.status if reason is None else f"{r.status}:{reason}",
        "cost": (u.input_tokens * PRICE_IN + u.output_tokens * PRICE_OUT) / 1e6,
    }


RETRYABLE = (openai.RateLimitError, openai.InternalServerError, openai.APIConnectionError, openai.APITimeoutError)
