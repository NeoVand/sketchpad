"""The open tier through Ollama cloud (BASELINES.md, "Ten comparison models"): one /api/chat request per problem.

`think: "high"` for gpt-oss, `think: true` for the other four (all five report the thinking capability in
/api/show). `options.num_predict = 32768` caps every generated token, thinking included (`eval_count`). The answer is
scored on `message.content`; the thinking text is kept in the raw record. Free tier: cost 0, usage recorded.
"""

import os
import threading

import ollama

MODELS = {
    "gpt-oss:120b": "high",
    "deepseek-v4-pro:0813": True,
    "kimi-k3": True,
    "glm-5.3": True,
    "gemma4:31b": True,
}
WORKERS = 2  # the free tier rate-limits; keep it low

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


def make(model):
    """A provider module for one Ollama model, with the driver's interface (call, retryable)."""
    think = MODELS[model]

    class Mod:
        MODEL = model
        THINK = think

        @staticmethod
        def call(prompt, cap):
            r = client().chat(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                think=think,
                stream=False,
                options={"num_predict": cap},
            )
            msg = r.message
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
                "cost": 0.0,
            }

        @staticmethod
        def retryable(e):
            if isinstance(e, ollama.ResponseError):
                return e.status_code == 429 or e.status_code >= 500
            return type(e).__name__ in ("ConnectError", "ReadTimeout", "RemoteProtocolError", "ReadError",
                                        "ConnectTimeout", "WriteError")

    Mod.WORKERS = WORKERS
    return Mod
