"""Figure 1c's data: share exact against digits per operand, per system and task, from the writer's registered run
(paper/BASELINES.md; records paper/baselines/results.json, summary RESULT.md). Writes data/baselines.json.

    python paper/figures/baselines.py
"""
import collections
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parents[0] / "baselines" / "results.json"

SYSTEMS = [  # key in results.json, name on the figure, role, dashed
    ("sketchpad", "Sketchpad", "ours", False),
    ("27b thinking", "Qwen3.5-27B, thinking", "strongest", False),
    ("0.8b thinking", "Qwen3.5-0.8B, thinking", "baseline", False),
    ("0.8b nothink", "Qwen3.5-0.8B, no thinking", "baseline", True),
]


def tally(records):
    t = collections.defaultdict(lambda: [0, 0])
    for r in records:
        k = (r["system"], r["family"], r["n"])
        t[k][0] += bool(r["exact"])
        t[k][1] += 1
    return t


def build():
    records = json.loads(SRC.read_text())
    assert len(records) == 880, len(records)
    t = tally(records)
    out = {"source": "paper/baselines/results.json (RESULT.md): 220 problems, 20 per length, four systems",
           "series": []}
    for key, name, role, dashed in SYSTEMS:
        for fam in ("add", "mul"):
            ns = sorted(n for (s, f, n) in t if s == key and f == fam)
            pts = [[n, t[(key, fam, n)][0], t[(key, fam, n)][1]] for n in ns]
            out["series"].append({"system": key, "name": name, "role": role, "dashed": dashed, "family": fam,
                                  "points": pts})
    totals = {key: sum(r["exact"] for r in records if r["system"] == key) for key, *_ in SYSTEMS}
    assert totals == {"sketchpad": 220, "27b thinking": 121, "0.8b thinking": 3, "0.8b nothink": 23}, totals
    out["totals"] = totals
    (HERE / "data" / "baselines.json").write_text(json.dumps(out, indent=1))
    return out


if __name__ == "__main__":
    o = build()
    print("baselines.json:", o["totals"])
