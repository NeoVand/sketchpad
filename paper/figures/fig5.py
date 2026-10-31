"""Figure 5. One model that decides.

a  the gate: one graph input g scales every adapter branch, y = xW + g s (xA^T) B^T. At g = 0 the graph is stock
   Qwen3.5-0.8B and at g = 1 the sheet machine (E7), bit for bit on ONNX Runtime CPU: every logit, hidden state and
   cached state (data/e7_gate_identity_summary.json, e7_gate_identity.py)
b  instruction following against multi-step reasoning across the chat runs, in points against stock: IFEval (strict,
   prompt level, 541 prompts) and GSM8K (250, sheet run by a Python stand-in); the region where both bars pass
c  opening the sheet: precision against recall on the held-out set, stock few-shot and every run at gate 1 zero-shot
   b and c: data/chat_runs.json, transcribed from the chat stream's record (CHAT3.md, lines in the file)
"""
import numpy as np
from matplotlib.patches import Circle, FancyBboxPatch, Polygon, Rectangle

from common import (COBALT, GREY, INK, MIST, ROSE, ROSE_L, SOFT, TINT, VIOLET, axes, canvas, check, clean, figure,
                    letter, load, save, setup)

setup()
GID = load("e7_gate_identity_summary.json")
CH = load("chat_runs.json")

fig = figure(68)
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
cv.text((xW0 + xW1) / 2, y0 + 10.0, "base weight, frozen", fontsize=4.8, color=SOFT, ha="center", va="top")
cv.plot([xin + 0.9, xW0], [y0, y0], color=INK, lw=0.6, zorder=2)
cv.plot([xW1, xplus - 1.6], [y0, y0], color=INK, lw=0.6, zorder=2)
cv.plot([xplus + 1.6, xout - 0.9], [y0, y0], color=INK, lw=0.6, zorder=2)
cv.add_patch(Circle((xplus, y0), 1.6, fc="white", ec=INK, lw=0.6, zorder=3))
cv.plot([xplus - 0.9, xplus + 0.9], [y0, y0], color=INK, lw=0.6, zorder=4)
cv.plot([xplus, xplus], [y0 - 0.9, y0 + 0.9], color=INK, lw=0.6, zorder=4)
# the adapter: A narrows, B widens, the gate scales
ya = y0 + 17.0
xa0, xa1, xb0, xb1, xg = 15.0, 22.0, 25.0, 32.0, 42.0
cv.add_patch(Polygon([(xa0, ya - 4.5), (xa1, ya - 1.2), (xa1, ya + 1.2), (xa0, ya + 4.5)], closed=True, fc=ROSE_L,
                     ec=ROSE, lw=0.5, alpha=0.9, zorder=2))
cv.add_patch(Polygon([(xb0, ya - 1.2), (xb1, ya - 4.5), (xb1, ya + 4.5), (xb0, ya + 1.2)], closed=True, fc=ROSE_L,
                     ec=ROSE, lw=0.5, alpha=0.9, zorder=2))
cv.text((xa0 + xa1) / 2, ya + 5.6, "$A$", fontsize=6.5, color=ROSE, ha="center", va="top")
cv.text((xb0 + xb1) / 2, ya + 5.6, "$B$", fontsize=6.5, color=ROSE, ha="center", va="top")
cv.text((xa0 + xb1) / 2, ya + 8.8, "low-rank adapter", fontsize=4.8, color=SOFT, ha="center", va="top")
cv.plot([xin + 3.0, xin + 3.0, xa0], [y0, ya, ya], color=ROSE, lw=0.6, zorder=1)
cv.plot([xa1, xb0], [ya, ya], color=ROSE, lw=0.6, zorder=1)
cv.plot([xb1, xg - 2.0], [ya, ya], color=ROSE, lw=0.6, zorder=1)
cv.plot([xg + 2.0, xplus, xplus], [ya, ya, y0 + 1.6], color=ROSE, lw=0.6, zorder=1)
cv.add_patch(Circle((xg, ya), 2.0, fc="white", ec=INK, lw=0.6, zorder=3))
cv.text(xg, ya, "$g$", fontsize=7, color=INK, ha="center", va="center", zorder=4)
cv.text(xg, ya + 3.0, "the gate:\none input", fontsize=4.8, color=INK, ha="center", va="top", linespacing=1.05)
cv.text(4.0, 56.0, r"$y = xW + g\,s\,(xA^{\mathrm{T}})\,B^{\mathrm{T}}$", fontsize=7, color=INK, ha="left", va="center")
ch, rw = pairs["chat/stock_vs_gate0"]["calls"], pairs["rows/stock_vs_gate0"]["calls"]
cv.text(4.0, 60.6, "$g = 0$: stock Qwen3.5-0.8B", fontsize=5.2, color=INK, ha="left", va="center")
cv.text(4.0, 64.2, "$g = 1$: the sheet machine", fontsize=5.2, color=ROSE, ha="left", va="center")
cv.text(37.0, 60.6, f"bit for bit on {ch:,} chat calls", fontsize=4.8, color=SOFT, ha="left", va="center")
cv.text(37.0, 64.2, f"and {rw:,} table rows, each", fontsize=4.8, color=SOFT, ha="left", va="center")
letter(fig, 1.0, 3.0, "a")

# ---- b: the seesaw -------------------------------------------------------------------------------------------------
st = CH["stock"]
pts = {}
for r in CH["runs"]:
    if r.get("gsm8k") is None and r.get("gsm8k_rate") is None:
        continue
    ife = 100 * (r["ifeval"] - st["ifeval"]) / CH["ifeval_n"]
    g = r["gsm8k"] if r.get("gsm8k") is not None else r["gsm8k_rate"] * CH["gsm8k_n"]
    gsm = 100 * (g - st["gsm8k"]) / CH["gsm8k_n"]
    pts[r["name"]] = (gsm, ife)
for s_ in CH["switch"]:
    pts[s_["name"]] = (100 * (s_["gsm8k_rate"] * CH["gsm8k_n"] - st["gsm8k"]) / CH["gsm8k_n"],
                       100 * (s_["ifeval_rate"] - st["ifeval"] / CH["ifeval_n"]))
for k, (ri, rg) in CH["reported_points"].items():
    check(abs(pts[k][1] - ri) < 0.06 and abs(pts[k][0] - rg) < 0.06, f"{k}: {ri}, {rg} points as reported")
ax = axes(fig, 84.0, 8.0, 44.0, 46.0)
clean(ax)
ax.add_patch(Rectangle((-2, -2), 6, 4, fc="#FBE3EB", ec="none", zorder=0))
ax.text(1.0, -1.05, "both\nbars\npass", fontsize=4.4, color=ROSE, ha="center", va="center", linespacing=1.0)
ax.axhline(-5, color=VIOLET, lw=0.6, ls=(0, (1, 1.5)), zorder=0)
ax.text(3.6, -5.15, "IFEval kill line", fontsize=4.6, color=VIOLET, ha="right", va="top")
seq = ["P2", "P3", "P4"]
ax.plot([pts[k][0] for k in seq], [pts[k][1] for k in seq], color=ROSE, lw=0.6, zorder=2)
ax.plot([pts["P4"][0], pts["P5"][0]], [pts["P4"][1], pts["P5"][1]], color=ROSE, lw=0.6, ls=(0, (2, 1.5)), zorder=2)
for k in seq + ["P5"]:
    ax.scatter(*pts[k], s=12, color=ROSE, lw=0, zorder=3)
for k in ("switch, P4 writes", "switch, P2 writes"):
    ax.scatter(*pts[k], s=9, color=GREY, marker="s", lw=0, zorder=3)
ax.scatter([0], [0], s=14, facecolor="white", edgecolor=INK, lw=0.7, zorder=4)
lab = {"P2": (0.0, 0.32, "center", "bottom"), "P3": (0.0, 0.32, "center", "bottom"),
       "P4": (0.9, 0.0, "left", "center"), "P5": (-0.9, -0.1, "right", "top")}
for k, (dx, dy, ha, va) in lab.items():
    ax.text(pts[k][0] + dx, pts[k][1] + dy, k, fontsize=5, color=ROSE, ha=ha, va=va)
ax.text(pts["P5"][0] - 1.0, pts["P5"][1] - 0.62, "on-policy", fontsize=4.4, color=ROSE, ha="right", va="top")
ax.text(-31.0, -3.55, "the gate switched\ninside a reply", fontsize=4.6, color=GREY, ha="center", va="bottom",
        linespacing=1.05)
ax.text(0.0, 0.4, "stock", fontsize=5, color=INK, ha="center", va="bottom")
ax.set_xlim(-42, 4)
ax.set_ylim(-6.2, 1.6)
ax.set_xticks([-40, -30, -20, -10, 0])
ax.set_yticks([-6, -4, -2, 0])
ax.set_xlabel("GSM8K, points against stock", labelpad=1.5)
ax.set_ylabel("IFEval, points against stock", labelpad=1.5)
letter(fig, 74.0, 3.0, "b")

# ---- c: opening the sheet ------------------------------------------------------------------------------------------
ax = axes(fig, 145.0, 8.0, 32.0, 46.0)
clean(ax)
bar = CH["open_bar"]
ax.add_patch(Rectangle((bar, bar), 0.06, 0.06, fc="#FBE3EB", ec="none", zorder=0))
ax.scatter([st["recall"]], [st["precision"]], s=12, color=COBALT, lw=0, zorder=3)
ax.text(st["recall"] + 0.008, st["precision"] - 0.001, "stock, few-shot", fontsize=4.8, color=COBALT, ha="left",
        va="top")
for s_ in CH["switch"]:
    ax.scatter([s_["recall"]], [s_["precision"]], s=8, color=GREY, marker="s", lw=0, zorder=2)
ax.text(0.817, 0.9765, "gate switched", fontsize=4.6, color=GREY, ha="left", va="bottom")
runs = {r["name"]: r for r in CH["runs"]}
check(runs["P3"]["precision"] == runs["P4"]["precision"] and runs["P3"]["recall"] == runs["P4"]["recall"],
      "P3 and P4 coincide")
for k, r in runs.items():
    ax.scatter([r["recall"]], [r["precision"]], s=12, color=ROSE, lw=0, zorder=3)
off = {"P1": (-0.004, 0.0, "right", "center", "P1 (E6)"), "P2": (0.0, 0.004, "center", "bottom", "P2"),
       "P3": (-0.004, -0.006, "right", "top", "P3, P4"), "P5": (-0.004, 0.0, "right", "center", "P5")}
for k, (dx, dy, ha, va, t) in off.items():
    ax.text(runs[k]["recall"] + dx, runs[k]["precision"] + dy, t, fontsize=4.8, color=ROSE, ha=ha, va=va)
check(runs["P5"]["recall"] < bar <= min(runs[k]["recall"] for k in ("P1", "P2", "P3", "P4")), "only P5 misses recall")
ax.set_xlim(0.79, 1.008)
ax.set_ylim(0.94, 1.008)
ax.set_xticks([0.8, 0.9, 1.0])
ax.set_yticks([0.95, 1.0])
ax.set_xlabel("recall", labelpad=1.5)
ax.set_ylabel("precision", labelpad=1.5)
letter(fig, 136.0, 3.0, "c")

save(fig, "fig5")
