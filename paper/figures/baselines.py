"""Figure 1c and Extended Data Figure 1: share exact, per system, on the 220 problems of the registered run
(paper/BASELINES.md; records paper/baselines/results.json). Writes data/baselines.json. Systems still running are
listed with what has landed (n below 220) or with no records at all; re-run when the writer reports.

    python paper/figures/baselines.py
"""
import collections
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parents[0] / "baselines" / "results.json"

# name in the paper, group, and how its records are found: a system key, or a model id fragment (lower case)
REGISTRY = [
    ("Sketchpad", "ours", ["sketchpad"], []),
    ("GPT-6.1 Sol", "frontier", ["gpt high"], ["gpt-6.1-sol"]),
    ("Claude Opus 5.5", "frontier", ["claude high", "opus high"], ["claude-opus-5-5"]),
    ("Gemini 4 Argon", "frontier", ["gemini high"], ["gemini-4-argon"]),
    ("gpt-oss-120b", "open", [], ["gpt-oss-120b"]),
    ("DeepSeek-V4-Pro", "open", [], ["deepseek-v4-pro"]),
    ("Kimi K3", "open", [], ["kimi-k3"]),
    ("GLM-5.3", "open", [], ["glm-5.3"]),
    ("Gemma 4 31B", "open", [], ["gemma-4-31b"]),
    ("Qwen3.5-27B", "qwen", ["27b thinking"], []),
    ("Qwen3.5-0.8B", "qwen", ["0.8b thinking", "0.8b nothink"], []),  # its better setting is shown
]
SETTING = {"high": "high reasoning", "thinking": "thinking", "nothink": "no thinking", None: ""}
CELLS = [("add", n) for n in (10, 30, 100, 300, 1000)] + [("mul", n) for n in (2, 4, 6, 10, 15, 20)]
HARD = [("add", 1000), ("mul", 20)]


def match(rec, keys, frags):
    model = (rec.get("model") or "").lower()
    return rec["system"] in keys or any(f in model for f in frags)


def summarise(records):
    """per registry entry: every setting found, with its totals and cells; the entry's shown setting is the best"""
    out = []
    for name, group, keys, frags in REGISTRY:
        recs = [r for r in records if match(r, keys, frags)]
        settings = collections.defaultdict(list)
        for r in recs:
            settings[(r["system"], r.get("mode"))].append(r)
        rows = []
        for (sys_key, mode), rs in settings.items():
            cells = {}
            for fam, n in CELLS:
                c = [r for r in rs if r["family"] == fam and r["n"] == n]
                cells[f"{fam}{n}"] = [sum(bool(r["exact"]) for r in c), len(c)]
            rows.append({"system": sys_key, "mode": mode, "setting": SETTING.get(mode, mode or ""),
                         "exact": sum(bool(r["exact"]) for r in rs), "n": len(rs), "cells": cells,
                         "model": rs[0].get("model")})
        rows.sort(key=lambda x: (-x["exact"] / max(x["n"], 1), x["system"]))
        out.append({"name": name, "group": group, "settings": rows, "shown": rows[0] if rows else None})
    return out


def build():
    records = json.loads(SRC.read_text())
    seen = {(r["system"], r["id"]) for r in records}
    assert len(seen) == len(records), "one record per system and problem"
    claimed = [r for r in records if any(match(r, k, f) for _, _, k, f in REGISTRY)]
    assert len(claimed) == len(records), "every record belongs to a listed system"
    out = {"source": "paper/baselines/results.json (BASELINES.md, RESULT.md); 20 problems per length when complete",
           "hard": [f"{f}{n}" for f, n in HARD], "systems": summarise(records)}
    (HERE / "data" / "baselines.json").write_text(json.dumps(out, indent=1))
    return out


if __name__ == "__main__":
    o = build()
    for s in o["systems"]:
        sh = s["shown"]
        print(f"{s['name']:18s}", "not run" if sh is None else f"{sh['exact']}/{sh['n']} ({sh['setting']})")
