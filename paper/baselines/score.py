"""Score the runs as BASELINES.md registers it, and write results.json plus the tables for RESULT.md.

Answer: the content of the last \\boxed{...} in the reply after the thinking block; if there is none, the last run of
digits in the reply's final 300 characters. Separators inside a run of digits (commas, spaces, thin spaces, `\\,`,
`{,}`) are removed first. Exact: the integer equals a + b or a * b; a reply at the token cap, or with no answer, is wrong.

Choices the registration leaves open, fixed here before any reply was read:
- "After the thinking block" = after the last `</think>`. In thinking mode a reply with no `</think>` has no text after
  the thinking block, so no answer (counted as `think_open`); in no-thinking mode the template already closed the block,
  so the whole generation is the reply.
- Inside the box, the answer is the last run of digits after separators are removed (for a box holding one integer,
  that integer).
- The 300-character fallback takes the digit run as it lies inside the window (`strict`); `score.py` also reports any
  problem whose exactness would change if a run cut by the window's left edge were taken whole.

  python score.py raw/sketchpad_e7/results.json raw/stock_0.8b/raw.jsonl.gz raw/stock_27b_fp8/raw.jsonl.gz
"""

import gzip
import json
import pathlib
import re
import statistics
import sys

HERE = pathlib.Path(__file__).parent
SEP = re.compile(r"(?<=\d)(?:\\,|\{,\}|[,   ])(?=\d)")
DIGITS = re.compile(r"\d+")
SYSTEMS = [("sketchpad", None), ("0.8b", "thinking"), ("0.8b", "nothink"), ("27b", "thinking"),
           ("gpt", "high"), ("claude", "high"), ("gemini", "high")]
FRONTIER = {"gpt", "claude", "gemini"}  # BASELINES.md, "Frontier": reasoning hidden, the visible reply is the reply


def clean(s):
    prev = None
    while prev != s:
        prev, s = s, SEP.sub("", s)
    return s


def last_boxed(s):
    k = s.rfind("\\boxed{")
    if k < 0:
        return None
    i, depth = k + len("\\boxed{"), 1
    j = i
    while j < len(s) and depth:
        depth += {"{": 1, "}": -1}.get(s[j], 0)
        j += 1
    return s[i : j - 1] if depth == 0 else s[i:]


def parse(text, mode):
    """(answer or None, how, think_closed, loose answer from the fallback)."""
    if "</think>" in text:
        reply, closed = text.rsplit("</think>", 1)[1], True
    elif mode == "thinking":
        return None, "think_open", False, None
    else:
        reply, closed = text, None
    box = last_boxed(reply)
    if box is not None:
        runs = DIGITS.findall(clean(box))
        return (runs[-1] if runs else None), "boxed", closed, None
    c = clean(reply)
    tail = c[-300:]
    runs = list(DIGITS.finditer(tail))
    if not runs:
        return None, "none", closed, None
    strict = runs[-1].group()
    loose = strict
    if runs[-1].start() == 0 and len(c) > 300:  # the run may continue left of the window
        m = re.search(r"\d+$", c[: len(c) - 300])
        loose = (m.group() if m else "") + strict
    return strict, "tail", closed, loose


def norm(x):
    return None if x is None else (x.lstrip("0") or "0")


def main(sk_path, raw_paths):
    probs = {p["id"]: p for p in json.loads((HERE / "problems.json").read_text())["problems"]}
    out, notes = [], []
    for r in json.loads(pathlib.Path(sk_path).read_text()):
        r = dict(r)
        r["system"], r["mode"] = "sketchpad", None
        out.append(r)
    for path in raw_paths:
        text = gzip.open(path, "rt").read() if str(path).endswith(".gz") else pathlib.Path(path).read_text()
        for line in text.splitlines():
            g = json.loads(line)
            if g.get("error"):  # an API error after the retries: reported, never scored
                notes.append(f"{g['model_key']} id {g['id']}: not scored, {g['error'][:80]}")
                continue
            p = probs[g["id"]]
            mk = g["model_key"]
            key = mk if (mk in FRONTIER or mk.startswith("ollama/")) else ("27b" if mk != "0.8b" else "0.8b")
            if key in FRONTIER or key.startswith("ollama/"):
                g = dict(g, mode="high")
            ans, how, closed, loose = parse(g["text"], g["mode"])
            exact = (not g["hit_cap"]) and norm(ans) == p["truth"]
            if loose is not None and ((not g["hit_cap"]) and norm(loose) == p["truth"]) != exact:
                notes.append(f"{key} {g['mode']} id {g['id']}: the left-cut tail run would change exactness")
            reply = g["text"].rsplit("</think>", 1)[1] if "</think>" in g["text"] else g["text"]
            out.append({"system": f"{key} {g['mode']}", "model": g["model"], "mode": g["mode"], "id": g["id"],
                        "reasoning_tokens": g.get("reasoning_tokens"), "cost": g.get("cost"),
                        "family": p["family"], "n": p["n"], "a": p["a"], "b": p["b"], "truth": p["truth"],
                        "answer": ans, "exact": exact, "tokens": g["tokens"], "hit_cap": g["hit_cap"],
                        "finish_reason": g["finish_reason"], "parsed_from": how, "think_closed": closed,
                        "no_answer": ans is None, "prompt_tokens": g["prompt_tokens"], "seed": g["seed"],
                        "reply_tail": reply[-400:]})
    order = [s for s, _ in SYSTEMS]
    out.sort(key=lambda r: (order.index(r["system"].split()[0]) if r["system"].split()[0] in order else len(order),
                            r["system"], r.get("mode") != "thinking", r["id"]))
    (HERE / "results.json").write_text(json.dumps(out, indent=1) + "\n")
    return out, notes


def tables(out):
    cells = [("add", n) for n in (10, 30, 100, 300, 1000)] + [("mul", n) for n in (2, 4, 6, 10, 15, 20)]
    head = "| system | " + " | ".join(f"{'+' if f == 'add' else '×'} {n:,}" for f, n in cells) + " |"
    sep = "|---|" + "---|" * len(cells)
    known = ["sketchpad", "0.8b thinking", "0.8b nothink", "27b thinking", "gpt high", "claude high", "gemini high"]
    systems = sorted({r["system"] for r in out}, key=lambda s: (known.index(s) if s in known else len(known), s))
    lines = {"exact": [head, sep], "cap": [head, sep], "tokens": [head, sep], "noans": [head, sep]}
    for s in systems:
        rows = {k: [] for k in lines}
        for f, n in cells:
            rs = [r for r in out if r["system"] == s and r["family"] == f and r["n"] == n]
            if not rs:
                for k in rows:
                    rows[k].append("not run")
                continue
            rows["exact"].append(f"{sum(r['exact'] for r in rs)}/{len(rs)}")
            if s == "sketchpad":
                rows["cap"].append("—")
                rows["tokens"].append(f"{statistics.median(r['ticks'] for r in rs):g} ticks")
                rows["noans"].append(f"off-table views {sum(r['views_off_table'] for r in rs)}")
            else:
                rows["cap"].append(str(sum(r["hit_cap"] for r in rs)))
                rows["tokens"].append(f"{statistics.median(r['tokens'] for r in rs):,.0f}")
                rows["noans"].append(str(sum(r["no_answer"] for r in rs)))
        for k in lines:
            lines[k].append(f"| {s} | " + " | ".join(rows[k]) + " |")
    return {k: "\n".join(v) for k, v in lines.items()}


if __name__ == "__main__":
    out, notes = main(sys.argv[1], sys.argv[2:])
    t = tables(out)
    for k in ("exact", "cap", "tokens", "noans"):
        print(f"\n### {k}\n\n{t[k]}")
    print("\nnotes:", notes or "none")
    for s in sorted({r["system"] for r in out}):
        rs = [r for r in out if r["system"] == s and r["system"] != "sketchpad"]
        if rs:
            from collections import Counter
            print(s, "parsed_from", dict(Counter(r["parsed_from"] for r in rs)),
                  "finish", dict(Counter(r["finish_reason"] for r in rs)))
