"""Extended Data Figure 1. Exact against length, every system, every length.

The registered run's 220 problems (paper/BASELINES.md; records paper/baselines/results.json, through
data/baselines.json from baselines.py): 20 problems per length when complete. Each cell is the share exact at one
length, shaded white to cobalt (Sketchpad's row white to rose), with the count printed. Systems still running are
listed; a system with 10 per length so far shows k/10.
"""
import json

import numpy as np
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import Rectangle

from common import (COBALT, GREY, INK, MIST, ROSE, SOFT, DATA, canvas, check, figure, load, save, setup)

setup()
BL = load("baselines.json")
REC = json.loads((DATA.parents[1] / "baselines" / "results.json").read_text())
CELLS = [("add", n) for n in (10, 30, 100, 300, 1000)] + [("mul", n) for n in (2, 4, 6, 10, 15, 20)]
GROUPS = [("ours", None), ("frontier", "frontier models"), ("open", "open models"), ("qwen", "Qwen3.5")]

blue = LinearSegmentedColormap.from_list("b", ["#FFFFFF", "#DCE6F5", "#9DB8E0", "#4F7EC4", COBALT])
rose = LinearSegmentedColormap.from_list("r", ["#FFFFFF", "#FBE3EB", "#F1A3BC", "#E3678F", ROSE])

rows = []
for g, glabel in GROUPS:
    members = [s for s in BL["systems"] if s["group"] == g]
    members.sort(key=lambda s: -(s["shown"]["exact"] / s["shown"]["n"]) if s["shown"] else 1)
    if glabel:
        rows.append(("group", glabel))
    for s in members:
        if s["name"] == "Qwen3.5-0.8B":  # both settings here
            for st in s["settings"]:
                rows.append(("system", s, st))
        else:
            rows.append(("system", s, s["shown"]))

fig = figure(14 + 4.4 * len(rows))
cv = canvas(fig)
x0, cw, ch = 50.0, 10.2, 3.4
y = 14.0
for j, (fam, n) in enumerate(CELLS):
    xx = x0 + j * cw + (3.0 if fam == "mul" else 0)
    cv.text(xx + cw / 2, y - 1.4, ("+ " if fam == "add" else "× ") + f"{n:,}", fontsize=5.2, color=SOFT,
            ha="center", va="bottom")
cv.text(x0, y - 5.6, "sums, digits per number", fontsize=5.5, color=INK, ha="left", va="bottom")
cv.text(x0 + 5 * cw + 3.0, y - 5.6, "products, digits per number", fontsize=5.5, color=INK, ha="left", va="bottom")
cv.text(x0 + 11 * cw + 9.5, y - 1.4, "all", fontsize=5.2, color=SOFT, ha="center", va="bottom")
for row in rows:
    if row[0] == "group":
        y += 1.0
        cv.text(4.0, y + 1.2, row[1], fontsize=4.8, color=GREY, ha="left", va="center", style="italic")
        y += 2.6
        continue
    _, s, st = row
    ours = s["name"] == "Sketchpad"
    cv.text(4.0, y + ch / 2, s["name"], fontsize=5.6, color=INK, ha="left", va="center",
            fontweight="bold" if ours else "normal")
    if st and st["setting"]:
        cv.text(31.0, y + ch / 2, st["setting"], fontsize=4.6, color=GREY, ha="left", va="center")
    if st is None:
        cv.text(x0 + 0.5, y + ch / 2, "running", fontsize=5, color=MIST, ha="left", va="center", style="italic")
        y += ch + 0.9
        continue
    rs = [r for r in REC if r["system"] == st["system"] and r.get("mode") == st["mode"]]
    tot_k = 0
    for j, (fam, n) in enumerate(CELLS):
        c = [r for r in rs if r["family"] == fam and r["n"] == n]
        k, m = sum(bool(r["exact"]) for r in c), len(c)
        check([k, m] == st["cells"][f"{fam}{n}"], f"{s['name']} {fam}{n}")
        tot_k += k
        xx = x0 + j * cw + (3.0 if fam == "mul" else 0)
        v = k / m
        col = (rose if ours else blue)(v)
        cv.add_patch(Rectangle((xx + 0.2, y), cw - 0.4, ch, fc=col, ec="none"))
        cv.text(xx + cw / 2, y + ch / 2, f"{k}/{m}", fontsize=4.8, color="white" if v > 0.6 else INK, ha="center",
                va="center")
    check(tot_k == st["exact"] and len(rs) == st["n"], f"{s['name']}: total")
    cv.text(x0 + 11 * cw + 9.5, y + ch / 2, f"{st['exact']}/{st['n']}", fontsize=5.2, color=ROSE if ours else INK,
            ha="center", va="center", fontweight="bold" if ours else "normal")
    y += ch + 0.9
save(fig, "ed1")
