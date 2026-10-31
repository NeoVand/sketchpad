"""Run the registered frontier baseline (BASELINES.md, "Frontier") and keep every raw reply.

  python frontier_run.py pilot  <gpt|claude|gemini> ...    # ids 80 (+ 1,000) and 200 (× 20)
  python frontier_run.py full   <gpt|claude|gemini> ...    # all 220, or --per-cell 10 for the registered cut
  python frontier_run.py full   ollama                    # the five open models (frontier_ollama.MODELS)
  python frontier_run.py cost                             # spend so far, from the usage fields

Keys come from the environment (source ~/.polyformer_keys in the same command); nothing here prints or writes one.
Replies go to raw/frontier/<model>.jsonl, one JSON object per problem; a problem already there is not asked again.
"""

import concurrent.futures as cf
import importlib
import json
import pathlib
import random
import sys
import threading
import time

HERE = pathlib.Path(__file__).parent
RAW = HERE / "raw" / "frontier"
CAP = 32768
WORKERS = 8
MODULES = {"gpt": "frontier_openai", "claude": "frontier_anthropic", "gemini": "frontier_gemini"}
PILOT_IDS = [80, 200]
STOP_AT = 60.0  # USD across every frontier reply so far (BASELINES.md, extension): no new request past it
lock = threading.Lock()
spent_total = [0.0]


def problems():
    return json.loads((HERE / "problems.json").read_text())["problems"]


def raw_path(key):
    return RAW / (key.replace("/", "_").replace(":", "_") + ".jsonl")


def module(key):
    if key.startswith("ollama/"):
        return importlib.import_module("frontier_ollama").make(key.split("/", 1)[1])
    return importlib.import_module(MODULES[key])


def done_ids(key):
    p = raw_path(key)
    if not p.exists():
        return set()
    return {json.loads(line)["id"] for line in p.read_text().splitlines() if line.strip() and
            json.loads(line).get("error") is None}


def retryable(mod, e):
    if hasattr(mod, "retryable"):
        return mod.retryable(e)
    return isinstance(e, mod.RETRYABLE)


def ask(mod, key, p):
    with lock:
        if spent_total[0] > STOP_AT:
            return None
    t0 = time.time()
    for attempt in range(7):
        try:
            rec = mod.call(p["prompt"], CAP)
            rec.update({"id": p["id"], "model_key": key, "mode": "frontier", "seed": None,
                        "elapsed": round(time.time() - t0, 1), "attempts": attempt + 1, "error": None})
            return rec
        except Exception as e:  # noqa: BLE001 - classified below; the message never contains a key
            if attempt < 6 and retryable(mod, e):
                time.sleep(min(300, 5 * 2 ** attempt) * (1 + random.random()))
                continue
            return {"id": p["id"], "model_key": key, "mode": "frontier", "error": f"{type(e).__name__}: {str(e)[:300]}",
                    "elapsed": round(time.time() - t0, 1), "attempts": attempt + 1}


def run(key, ids):
    mod = module(key)
    RAW.mkdir(parents=True, exist_ok=True)
    have = done_ids(key)
    todo = [p for p in problems() if p["id"] in ids and p["id"] not in have]
    print(f"{key}: {len(todo)} to ask ({len(have)} already done)", flush=True)
    spent = 0.0
    with cf.ThreadPoolExecutor(getattr(mod, "WORKERS", WORKERS)) as ex:
        for fut in cf.as_completed([ex.submit(ask, mod, key, p) for p in todo]):
            rec = fut.result()
            if rec is None:
                continue
            with lock, raw_path(key).open("a") as f:
                f.write(json.dumps(rec) + "\n")
                spent_total[0] += rec.get("cost") or 0
            spent += rec.get("cost") or 0
            tag = rec["error"] or f"{rec['tokens']} tok, cap {rec['hit_cap']}, {rec['finish_reason']}"
            print(f"  {key} id {rec['id']}: {tag}; spent ${spent:.2f}", flush=True)


def cost():
    total = 0.0
    for p in sorted(RAW.glob("*.jsonl")):
        key = p.stem
        recs = [json.loads(line) for line in p.read_text().splitlines() if line.strip()]
        c = sum(r.get("cost") or 0 for r in recs)
        total += c
        ok = [r for r in recs if r.get("error") is None]
        print(f"{key}: {len(ok)} replies, {len(recs) - len(ok)} errors, ${c:.2f}, output tokens "
              f"{sum(r['tokens'] for r in ok):,}, at cap {sum(r['hit_cap'] for r in ok)}")
    print(f"total ${total:.2f}")


if __name__ == "__main__":
    cmd, keys = sys.argv[1], [k for k in sys.argv[2:] if k in MODULES or k.startswith("ollama/")]
    if "ollama" in sys.argv[2:]:
        keys += ["ollama/" + m for m in importlib.import_module("frontier_ollama").MODELS]
    if cmd == "cost":
        cost()
        sys.exit()
    if cmd == "pilot":
        ids = set(PILOT_IDS)
    else:
        per = int(sys.argv[sys.argv.index("--per-cell") + 1]) if "--per-cell" in sys.argv else 20
        ids = {p["id"] for p in problems() if p["k"] < per}
    for f in RAW.glob("*.jsonl"):  # spend already on record counts toward the stop
        spent_total[0] += sum(json.loads(x).get("cost") or 0 for x in f.read_text().splitlines() if x.strip())
    print(f"spent so far ${spent_total[0]:.2f}; no new request past ${STOP_AT:.0f}", flush=True)
    with cf.ThreadPoolExecutor(len(keys)) as ex:
        list(ex.map(lambda k: run(k, ids), keys))
    cost()
