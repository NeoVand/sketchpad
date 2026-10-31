"""Claude Opus 5.5 for the frontier baseline (BASELINES.md, "Frontier"): one streamed Messages request per problem.

Thinking is always on for this model; effort "high" is set in output_config (its default is "medium"). max_tokens
covers thinking and the visible reply. No sampling parameters, no fallback model (a fallback would answer in Claude
Opus 5.5's place); a refusal is recorded as such.
"""

import anthropic

MODEL = "claude-opus-5-5"
PRICE_IN, PRICE_OUT = 4.00, 20.00  # USD per million tokens, platform.claude.com/docs/en/about-claude/pricing

_client = None


def client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(max_retries=0, timeout=1800)  # retries are the driver's
    return _client


def call(prompt, cap):
    with client().messages.stream(
        model=MODEL,
        max_tokens=cap,
        output_config={"effort": "high"},
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        msg = stream.get_final_message()
    text = "".join(b.text for b in msg.content if b.type == "text")
    u = msg.usage
    return {
        "model": msg.model,
        "text": text,
        "tokens": u.output_tokens,
        "reasoning_tokens": None,  # not reported separately; output_tokens includes thinking
        "prompt_tokens": u.input_tokens,
        "hit_cap": msg.stop_reason == "max_tokens",
        "finish_reason": msg.stop_reason,
        "cost": (u.input_tokens * PRICE_IN + u.output_tokens * PRICE_OUT) / 1e6,
    }


RETRYABLE = (anthropic.RateLimitError, anthropic.InternalServerError, anthropic.APIConnectionError,
             anthropic.APITimeoutError)
