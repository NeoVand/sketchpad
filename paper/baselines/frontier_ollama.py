"""The open tier through Ollama cloud (BASELINES.md, "Ten comparison models"): one /api/chat request per problem.

`think: "high"` for gpt-oss, `think: true` for the other four (all five report the thinking capability in
/api/show). `options.num_predict = 32768` caps every generated token, thinking included (`eval_count`). The answer is
scored on `message.content`; the thinking text is kept in the raw record. Usage is costed at the ollama.com/pricing rates below.
"""

import datetime as dt
import os
import threading

import ollama

MODELS = {
    "gpt-oss:120b": "high",
    "deepseek-v4-pro:0813": True,
    "mistral-large-4": True,
    "glm-5.3": True,
    "gemma4:31b": True,
}
WORKERS = 2  # keep it low on the shared cloud
# USD per million tokens (input, output), https://ollama.com/pricing, 31 Oct 2026; DeepSeek at its peak rate
RATES = {
    "gpt-oss:120b": (0.15, 0.60),
    "deepseek-v4-pro:0813": (1.32, 3.96),
    "kimi-k3": (3.00, 15.00),  # dropped on cost (BASELINES.md); its pilot stays in raw
    "mistral-large-4": (0.70, 2.10),
    "glm-5.3": (1.40, 4.40),
    "gemma4:31b": (0.14, 0.40),
}
OFF_PEAK = {"deepseek-v4-pro:0813": (0.66, 1.98)}  # outside 12:00-18:00 UTC on weekdays, all weekend
BUDGET = 55.0  # USD of Ollama usage (BASELINES.md): no new request past it

_client = None
_lock = threading.Lock()  # one client for all threads


def client():
    global _client
    with _lock:
        if _client is None:
            _client = ollama.Client(
                host="https://ollama.com",
                headers={"Authorization": "Bearer " + os.environ["OLLAMA_API_KEY"]},
                timeout=3600,
            )
        return _client


def off_peak(t):
    """ollama.com/pricing: off-peak is outside 12:00-18:00 UTC on weekdays, and all weekend."""
    return t.weekday() >= 5 or not (12 <= t.hour < 18)


def make(model):
    """A provider module for one Ollama model, with the driver's interface (call, retryable)."""
    think = MODELS[model]

    class Mod:
        MODEL = model
        THINK = think

        @staticmethod
        def call(prompt, cap):
            t0 = dt.datetime.now(dt.timezone.utc)
            r = client().chat(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                think=think,
                stream=False,
                options={"num_predict": cap},
            )
            msg = r.message
            t1 = dt.datetime.now(dt.timezone.utc)
            off = model in OFF_PEAK and off_peak(t0) and off_peak(t1)
            rin, rout = OFF_PEAK[model] if off else RATES[model]
            return {
                "model": f"{model} (ollama cloud, think={think})",
                "text": msg.content or "",
                "thinking_tail": (msg.thinking or "")[-2000:],
                "thinking_chars": len(msg.thinking or ""),
                "tokens": r.eval_count,
                "reasoning_tokens": None,  # Ollama reports one count for all generated tokens
                "prompt_tokens": r.prompt_eval_count,
                "hit_cap": r.done_reason == "length",
                "finish_reason": r.done_reason,
                "cost": ((r.prompt_eval_count or 0) * rin + (r.eval_count or 0) * rout) / 1e6,
                "rate": "off-peak" if off else "standard",
                "t_start": t0.isoformat(timespec="seconds"),
                "t_end": t1.isoformat(timespec="seconds"),
            }

        @staticmethod
        def retryable(e):
            if isinstance(e, ollama.ResponseError):
                return e.status_code == 429 or e.status_code >= 500
            return type(e).__name__ in ("ConnectError", "ReadTimeout", "RemoteProtocolError", "ReadError",
                                        "ConnectTimeout", "WriteError")

    Mod.WORKERS = WORKERS
    Mod.BUDGET = BUDGET
    Mod.GROUP = "ollama"
    return Mod
