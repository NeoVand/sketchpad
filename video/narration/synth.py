"""Synthesises the narration, one line at a time, with the model and voice in lines.json (OpenAI chat completions with
audio output). Writes wav/<id>.wav, and usage.json with the tokens each call used and their cost at the published
rates. A line is re-asked (up to three times) if the model's own transcript does not match the spoken text word for word.

    python3 synth.py            # every line that has no wav yet
    python3 synth.py N2 N7      # just these lines, again
"""

import base64
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from openai_key import key

HERE = Path(__file__).parent
SPEC = json.loads((HERE / "lines.json").read_text())
OUT = HERE / "wav"
OUT.mkdir(exist_ok=True)
USAGE = HERE / "usage.json"
# USD per 1M tokens for gpt-audio-1.5 (openai.com/api/pricing, 1 Nov 2026)
RATES = {"text_in": 2.50, "audio_in": 32.00, "text_out": 10.00, "audio_out": 64.00}


def words(s: str) -> list[str]:
    return re.sub(r"[^a-z0-9 ]+", " ", s.lower().replace("-", " ")).split()


def ask(text: str) -> dict:
    body = {
        "model": SPEC["model"],
        "modalities": ["text", "audio"],
        "audio": {"voice": SPEC["voice"], "format": "wav"},
        "temperature": 0.6,
        "messages": [
            {"role": "system", "content": SPEC["instructions"]},
            {"role": "user", "content": text},
        ],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key()}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code}: {e.read().decode()[:400]}")


def cost(u: dict) -> float:
    pin, pout = u.get("prompt_tokens_details", {}), u.get("completion_tokens_details", {})
    a_in, a_out = pin.get("audio_tokens", 0) or 0, pout.get("audio_tokens", 0) or 0
    t_in, t_out = u["prompt_tokens"] - a_in, u["completion_tokens"] - a_out
    return (t_in * RATES["text_in"] + a_in * RATES["audio_in"] + t_out * RATES["text_out"] + a_out * RATES["audio_out"]) / 1e6


def main() -> None:
    ids = sys.argv[1:]
    log = json.loads(USAGE.read_text()) if USAGE.exists() else {"calls": []}
    for line in SPEC["lines"]:
        if ids and line["id"] not in ids:
            continue
        if not ids and (OUT / f"{line['id']}.wav").exists():
            continue
        for attempt in range(3):
            r = ask(line["spoken"])
            msg = r["choices"][0]["message"]
            said = msg.get("audio", {}).get("transcript", "")
            c = cost(r["usage"])
            ok = words(said) == words(line["spoken"])
            log["calls"].append({"id": line["id"], "attempt": attempt, "match": ok, "usage": r["usage"], "usd": c, "transcript": said})
            print(f"{line['id']} attempt {attempt}: match={ok} ${c:.4f}")
            if ok:
                (OUT / f"{line['id']}.wav").write_bytes(base64.b64decode(msg["audio"]["data"]))
                break
            print("   said:", said)
            time.sleep(1)
    log["total_usd"] = round(sum(x["usd"] for x in log["calls"]), 4)
    USAGE.write_text(json.dumps(log, indent=1))
    print(f"total so far ${log['total_usd']:.4f}")


if __name__ == "__main__":
    main()
