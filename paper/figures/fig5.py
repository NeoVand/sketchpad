"""Figure 5. Gating: one model that decides when to compute.

a  the gate: one graph input g scales every adapter branch, y = xW + g s (xA^T) B^T. At g = 0 the graph is the base
   model and at g = 1 the sheet machine (E7), bit for bit on ONNX Runtime CPU: every logit, hidden state and cached
   state (data/e7_gate_identity_summary.json, e7_gate_identity.py)
b  IFEval against GSM8K, in points against the base model, for every dialogue fine-tune with both measured and for
   switching the gate within a reply; the region where both criteria hold
c  invoking the sheet: precision and recall on the 780 held-out items, the base model with four examples and every
   fine-tune with the gate on and no examples
   b and c: every value recomputed from the chat stream's eval files (data/chat/, listed in data/chat_runs.json) and
   checked against the values reported there and in the paper's Extended Data Table 'Dialogue fine-tuning'.
   Points are labelled by recipe; the final adapter is filled rose.
"""
import json

import numpy as np
from matplotlib.patches import Circle, Polygon, Rectangle

from common import (COBALT, DATA, GREY, INK, MIST, ROSE, ROSE_L, SOFT, VIOLET, assert_clean, axes, canvas, check,
                    clean, figure, letter, load, save, setup)

setup()
GID = load("e7_gate_identity_summary.json")
CH = load("chat_runs.json")
fig = figure(132)
cv = canvas(fig)

# ---- a: the gate ---------------------------------------------------------------------------------------------------
pairs = GID["pairs"]
for k in ("chat/stock_vs_gate0", "chat/e7_vs_gate1", "rows/stock_vs_gate0", "rows/e7_vs_gate1"):
    p = pairs[k]
    check(p["logits_bit"] == p["hidden_bit"] == p["present_bit"] == p["calls"] and p["max_logit_diff"] == 0.0,
          f"{k}: bit for bit")
check(pairs["chat/stock_vs_gate0"]["calls"] == 2500 and pairs["rows/stock_vs_gate0"]["calls"] == 2688,
      "2,500 chat calls and 2,688 table rows")

y0 = 24.0  # the main line
xin, xW0, xW1, xplus, xout = 6.0, 15.0, 33.0, 52.0, 60.0
# the input vector and the output vector, as columns of cells
for xx in (xin, xout):
    for k in range(7):
        cv.add_patch(Rectangle((xx - 0.9, y0 - 6.3 + k * 1.8), 1.8, 1.8, fc="white", ec=SOFT, lw=0.35, zorder=3))
cv.text(xin, y0 - 7.6, "$x$", fontsize=7, color=INK, ha="center", va="bottom")
cv.text(xout, y0 - 7.6, "$y$", fontsize=7, color=INK, ha="center", va="bottom")
# W: the frozen base weight, a fine grid
n = 12
cell = (xW1 - xW0) / n
for i in range(n + 1):
    cv.plot([xW0 + i * cell] * 2, [y0 - 9, y0 + 9], color=MIST, lw=0.3, zorder=2)
    cv.plot([xW0, xW1], [y0 - 9 + i * 1.5] * 2, color=MIST, lw=0.3, zorder=2)
cv.add_patch(Rectangle((xW0, y0 - 9), xW1 - xW0, 18, fc="#F7F9FC", ec=INK, lw=0.6, zorder=1))
cv.text((xW0 + xW1) / 2, y0 - 10.2, "$W$", fontsize=7, color=INK, ha="center", va="bottom")
cv.text((xW0 + xW1) / 2, y0 + 10.0, "base weight, frozen", fontsize=6, color=SOFT, ha="center", va="top")
cv.plot([xin + 0.9, xW0], [y0, y0], color=INK, lw=0.6, zorder=2)
cv.plot([xW1, xplus - 1.6], [y0, y0], color=INK, lw=0.6, zorder=2)
cv.plot([xplus + 1.6, xout - 0.9], [y0, y0], color=INK, lw=0.6, zorder=2)
cv.add_patch(Circle((xplus, y0), 1.6, fc="white", ec=INK, lw=0.6, zorder=3))
cv.plot([xplus - 0.9, xplus + 0.9], [y0, y0], color=INK, lw=0.6, zorder=4)
cv.plot([xplus, xplus], [y0 - 0.9, y0 + 0.9], color=INK, lw=0.6, zorder=4)
# the adapter: A narrows, B widens, the gate scales
ya = y0 + 18.5
xa0, xa1, xb0, xb1, xg = 15.0, 22.0, 25.0, 32.0, 42.0
cv.add_patch(Polygon([(xa0, ya - 4.5), (xa1, ya - 1.2), (xa1, ya + 1.2), (xa0, ya + 4.5)], closed=True, fc=ROSE_L,
                     ec=ROSE, lw=0.5, alpha=0.9, zorder=2))
cv.add_patch(Polygon([(xb0, ya - 1.2), (xb1, ya - 4.5), (xb1, ya + 4.5), (xb0, ya + 1.2)], closed=True, fc=ROSE_L,
                     ec=ROSE, lw=0.5, alpha=0.9, zorder=2))
cv.text((xa0 + xa1) / 2, ya + 5.6, "$A$", fontsize=6.5, color=ROSE, ha="center", va="top")
cv.text((xb0 + xb1) / 2, ya + 5.6, "$B$", fontsize=6.5, color=ROSE, ha="center", va="top")
cv.text((xa0 + xb1) / 2, ya + 8.8, "low-rank adapter", fontsize=6, color=SOFT, ha="center", va="top")
cv.plot([xin + 3.0, xin + 3.0, xa0], [y0, ya, ya], color=ROSE, lw=0.6, zorder=1)
cv.plot([xa1, xb0], [ya, ya], color=ROSE, lw=0.6, zorder=1)
cv.plot([xb1, xg - 2.0], [ya, ya], color=ROSE, lw=0.6, zorder=1)
cv.plot([xg + 2.0, xplus, xplus], [ya, ya, y0 + 1.6], color=ROSE, lw=0.6, zorder=1)
cv.add_patch(Circle((xg, ya), 2.0, fc="white", ec=INK, lw=0.6, zorder=3))
cv.text(xg, ya, "$g$", fontsize=7, color=INK, ha="center", va="center", zorder=4)
cv.text(xg, ya + 3.0, "the gate:", fontsize=6, color=INK, ha="center", va="top")
cv.text(xg, ya + 5.9, "one input", fontsize=6, color=INK, ha="center", va="top")
cv.text(4.0, 56.0, r"$y = xW + g\,s\,(xA^{\mathrm{T}})\,B^{\mathrm{T}}$", fontsize=7, color=INK, ha="left", va="center")
ch, rw = pairs["chat/stock_vs_gate0"]["calls"], pairs["rows/stock_vs_gate0"]["calls"]
cv.text(4.0, 60.8, "$g = 0$: the base model, Qwen3.5-0.8B", fontsize=6, color=INK, ha="left", va="center")
cv.text(4.0, 64.0, "$g = 1$: the sheet machine", fontsize=6, color=ROSE, ha="left", va="center")
cv.text(4.0, 67.6, f"each bit for bit, on {ch:,} chat forward passes and {rw:,} table views", fontsize=6,
        color=SOFT, ha="left", va="center")
letter(fig, 1.0, 3.0, "a")


# ---- the runs, recomputed --------------------------------------------------------------------------------------------
def ev(name):
    return json.loads((DATA / name).read_text())


base = ev(CH["base"]["eval"])
base_fs = ev(CH["base"]["fewshot"])
B_IF, B_GS, B_MM = base["ifeval"]["prompt_strict"], base["gsm8k"]["acc"], base["mmlu"]["acc"]
check((round(B_IF, 3), B_GS, B_MM) == (0.536, 0.516, 0.476), "the base model: 0.536, 0.516, 0.476")
runs = []
for r in CH["runs"]:
    e = ev(r["eval"])
    tp, fp, fn = (e["open_counts"][k] for k in ("tp", "fp", "fn"))
    v = {"precision": tp / (tp + fp), "recall": tp / (tp + fn),
         "ifeval": 100 * (e["ifeval"]["prompt_strict"] - B_IF),
         "gsm8k": None if "gsm8k" not in e else 100 * (e["gsm8k"]["acc"] - B_GS),
         "mmlu": 100 * (e["mmlu"]["acc"] - B_MM)}
    check(abs(v["precision"] - e["open_precision"]) < 1e-12 and abs(v["recall"] - e["open_recall"]) < 1e-12,
          f"{r['id']}: precision and recall from the counts")
    rep = r["reported"]
    for k in ("precision", "recall"):
        check(abs(v[k] - rep[k]) < 0.0006, f"{r['id']} {k}: {v[k]:.4f} against {rep[k]}")
    for k in ("ifeval", "gsm8k", "mmlu"):
        if rep[k] is None:
            check(v[k] is None, f"{r['id']}: no {k}")
            continue
        tol = 0.051 if abs(rep[k] * 10 - round(rep[k] * 10)) < 1e-9 else 0.0051
        check(abs(v[k] - rep[k]) <= tol, f"{r['id']} {k}: {v[k]:.3f} against {rep[k]}")
    runs.append({**r, **v})
fin = [r for r in runs if r.get("final")]
check(len(fin) == 1 and fin[0]["id"] == "P9", "one final adapter")
F = fin[0]
for k in ("ifeval", "gsm8k", "mmlu"):
    check(F[k] >= CH["criterion"]["points"], f"the final adapter meets the {k} criterion")
check(F["precision"] >= 0.95 and F["recall"] >= 0.95, "the final adapter meets the invocation criterion")
SW = ev(CH["switch"]["eval"])
switch = []
for w in CH["switch"]["writers"]:
    h = SW[f"heldout_{w}"]
    v = {"precision": h["open_precision"], "recall": h["open_recall"],
         "ifeval": 100 * (SW[f"ifeval_{w}"]["prompt_strict"] - B_IF),
         "gsm8k": 100 * (SW[f"gsm8k_{w}"]["acc"] - B_GS)}
    rep = CH["switch"]["reported"][w]
    for k in rep:
        tol = 0.0006 if k in ("precision", "recall") else 0.051
        check(abs(v[k] - rep[k]) <= tol, f"switch {w} {k}: {v[k]:.3f} against {rep[k]}")
    switch.append(v)
check(abs(base_fs["open_precision"] - 0.971) < 6e-4 and abs(base_fs["open_recall"] - 0.809) < 6e-4,
      "the base model with four examples: 0.971 / 0.809")

# ---- b: instruction following against multi-step reasoning ----------------------------------------------------------
ax = axes(fig, 84.0, 8.0, 92.0, 56.0)
clean(ax)
XL, YL = (-41.0, 4.5), (-5.8, 3.0)
crit = CH["criterion"]["points"]
ax.add_patch(Rectangle((crit, crit), XL[1] - crit, YL[1] - crit, fc="#FBE3EB", ec="none", zorder=0))
ax.text(1.25, 2.55, "both", fontsize=6, color=ROSE, ha="center", va="center")
ax.text(1.25, 2.05, "criteria", fontsize=6, color=ROSE, ha="center", va="center")
ax.axhline(-5, color=VIOLET, lw=0.6, ls=(0, (1, 1.5)), zorder=0)
ax.text(4.2, -5.2, "IFEval kill line", fontsize=6, color=VIOLET, ha="right", va="top")
pts = {r["id"]: (r["gsm8k"], r["ifeval"]) for r in runs if r["gsm8k"] is not None}
for r in runs:
    if r["gsm8k"] is None:
        continue
    if r.get("final"):
        ax.scatter([r["gsm8k"]], [r["ifeval"]], s=22, color=ROSE, lw=0, zorder=5)
    else:
        ax.scatter([r["gsm8k"]], [r["ifeval"]], s=13, facecolor="white", edgecolor=ROSE, lw=0.8, zorder=4)
for v in switch:
    ax.scatter([v["gsm8k"]], [v["ifeval"]], s=10, color=GREY, marker="s", lw=0, zorder=3)
ax.scatter([0], [0], s=16, facecolor="white", edgecolor=COBALT, lw=0.8, zorder=4)
ax.text(0.7, -0.05, "base", fontsize=6, color=COBALT, ha="left", va="bottom")
ax.text(0.7, -0.15, "model", fontsize=6, color=COBALT, ha="left", va="top")
rec = {r["id"]: r["recipe"] for r in runs}
# the early recipes, labelled beside their points
ax.text(pts["P2"][0] + 1.3, pts["P2"][1], rec["P2"], fontsize=6, color=ROSE, ha="left", va="center")
ax.text(pts["P3"][0] + 1.3, pts["P3"][1], rec["P3"], fontsize=6, color=ROSE, ha="left", va="center")
ax.text(pts["P4"][0] - 1.3, pts["P4"][1], rec["P4"], fontsize=6, color=ROSE, ha="right", va="center")
ax.text(-40.4, -3.3, "switching the gate within a reply", fontsize=6, color=GREY, ha="left", va="bottom")
# the recipes near the base model: a column of labels with leaders, ordered so no two leaders cross
import itertools
near = ["P5", "P6", "P7", "P8", "P9"]
LX, LYS = -8.4, [2.62, 2.08, 1.54, 1.0, 0.46]


def crosses(p1, p2, q1, q2):
    def o(a, b, c):
        return np.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
    return o(p1, p2, q1) != o(p1, p2, q2) and o(q1, q2, p1) != o(q1, q2, p2)


best = None
for perm in itertools.permutations(near):
    segs = [((LX + 0.5, y), pts[k]) for k, y in zip(perm, LYS)]
    n = sum(crosses(*segs[i], *segs[j]) for i in range(5) for j in range(i + 1, 5))
    if best is None or n < best[0]:
        best = (n, perm)
check(best[0] == 0, "the leaders do not cross")
for k, y in zip(best[1], LYS):
    r = [r_ for r_ in runs if r_["id"] == k][0]
    label = r["recipe"] + (" (final)" if r.get("final") else "")
    ax.text(LX, y, label, fontsize=6, color=ROSE, ha="right", va="center",
            fontweight="bold" if r.get("final") else "normal")
    ax.plot([LX + 0.5, pts[k][0]], [y, pts[k][1]], color=ROSE, lw=0.35, alpha=0.8, zorder=2)
ax.set_xlim(*XL)
ax.set_ylim(*YL)
ax.set_xticks([-40, -30, -20, -10, 0])
ax.set_yticks([-4, -2, 0, 2])
ax.set_xlabel("GSM8K, points against the base model", labelpad=1.5)
ax.set_ylabel("IFEval, points against the base model", labelpad=1.5)
letter(fig, 74.0, 3.0, "b")

# ---- c: invoking the sheet ------------------------------------------------------------------------------------------
Y0 = 82.0
rows = [("base model, four examples", base_fs["open_precision"], base_fs["open_recall"], COBALT, False)]
rows += [(r["recipe"], r["precision"], r["recall"], ROSE if r.get("final") else ROSE_L, bool(r.get("final")))
         for r in runs]
rows += [(CH["switch"]["name"] + ", two writers", None, None, GREY, False)]
ax = axes(fig, 92.0, Y0, 56.0, 3.6 * len(rows))
clean(ax, left=False)
ax.set_xlim(0.76, 1.004)
ax.set_ylim(len(rows) - 0.5, -0.5)
ax.axvline(CH["criterion"]["invocation"], color=VIOLET, lw=0.6, ls=(0, (1, 1.5)), zorder=0)
for i, (name, p, rc, col, final) in enumerate(rows):
    cv.text(88.0, Y0 + (i + 0.5) * 3.6, name + (" (final)" if final else ""), fontsize=6, color=INK, ha="right",
            va="center", fontweight="bold" if final else "normal")
    pr = [(p, rc)] if p is not None else [(v["precision"], v["recall"]) for v in switch]
    for (pp, rr) in pr:
        ax.plot([min(pp, rr), max(pp, rr)], [i, i], color=col, lw=0.8, zorder=2, alpha=0.7)
        ax.scatter([pp], [i], s=14, facecolor="white", edgecolor=col, lw=0.8, zorder=4)
        ax.scatter([rr], [i], s=14, color=col, lw=0, zorder=5)
    if len(pr) == 1:
        vals = f"{pr[0][0]:.3f} / {pr[0][1]:.3f}"
    else:
        check(abs(pr[0][1] - pr[1][1]) < 1e-12, "both writers: the same recall")
        vals = f"{pr[0][0]:.3f}, {pr[1][0]:.3f} / {pr[0][1]:.3f}"
    cv.text(152.0, Y0 + (i + 0.5) * 3.6, vals, fontsize=6, color=INK if final else SOFT, ha="left", va="center",
            fontweight="bold" if final else "normal")
ax.set_xticks([0.8, 0.9, 0.95, 1.0])
ax.set_xticklabels(["0.80", "0.90", "0.95", "1"])
ax.set_xlabel("share", labelpad=1.5)
cv.text(92.0, Y0 - 2.4, "○ precision    ● recall", fontsize=6, color=INK, ha="left", va="center",
        family="DejaVu Sans")
cv.text(152.0, Y0 - 2.4, "precision / recall", fontsize=6, color=SOFT, ha="left", va="center")
letter(fig, 1.0, Y0 - 5.0, "c")

assert_clean(fig)
save(fig, "fig5")
