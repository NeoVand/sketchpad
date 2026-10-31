"""Figure 2. The sheet machine.

a  the five tables as views: one real view of each (the true strip, assembleStrip on the training sprites) and the
   answer the table gives it (referenceAnswer); table sizes from the certificate (data/certificate_e7.json)
b  a procedure as a walk over tables: Knuth's Algorithm D on its sheet (4,100 / 59, the runtime's own grid at the
   subtraction whose borrow lowers the guess), every forward pass of the run as a column, and the square root's walk
   (data/sheets.json, from sheets.ts with the reference tables as the policy)
c  waves: four independent jobs sharing forward passes (sheets.ts, Mux), and the M4 cost model against measured time
   for all 200 T3 problems (data/calc3_t3.json)
d  T3: time per problem by operation, 200 of 200 exact, with the 12 s line (data/calc3_t3.json)
"""
import numpy as np
from matplotlib.patches import Rectangle

from common import (CELL, COBALT, GREY, INK, MIST, ROSE, ROSE_L, SOFT, TINT, VIOLET, axes, canvas, check, clean,
                    draw_sheet, figure, letter, load, save, setup, strip_image)

setup()
S = load("sheets.json")
CERT = load("certificate_e7.json")
T3 = load("calc3_t3.json")

fig = figure(150)
cv = canvas(fig)

# ---- a: the five tables ------------------------------------------------------------------------------------------
sizes = {"ADD-FAST": CERT["kinds"]["add"]["rows"], "MUL": CERT["kinds"]["mul"]["rows"]}
calc_ops = {"SUB": 242, "EST": 400, "DEC": 9}
check(sum(calc_ops.values()) == CERT["kinds"]["calc"]["rows"] == 651, "SUB + EST + DEC = 651 rows")
sizes.update(calc_ops)
check(sizes["ADD-FAST"] == 242 and sizes["MUL"] == 1553, "242 and 1,553 rows")
cards = {
    "ADD-FAST": ("SUM", "add", r"$1+7+8=16$", ["g"], ["6, carry 1"]),
    "MUL": ("MUL", "multiply", r"$7\times 6+4=46$", ["6", "4", "A"], ["digit", "carry", "next"]),
    "SUB": ("SUB", "subtract", r"$13-8-1=4$", ["4", "1", "S"], ["digit", "borrow", "next"]),
    "EST": ("EST", "estimate a quotient digit", r"$\lfloor 47/6 \rfloor = 7$", ["7", "–", "M"],
            ["guess", "", "next"]),
    "DEC": ("DEC", "lower the guess", r"$7-1=6$", ["6", "–", "C"], ["digit", "", "next"]),
}
cw = 35.2
for i, t in enumerate(S["tables"]):
    code, name, rule, ans, gloss = cards[t["op"]]
    shown = [g if g != "-" else "–" for g in t["answer"]]
    check(shown == ans, f"{t['op']} answer {t['answer']}")
    X, Y = 4.0 + i * cw, 10.0
    sw, sh = 6.0, 18.0
    cv.imshow(strip_image(t["strip"]), extent=(X, X + sw, Y + sh, Y), interpolation="nearest", zorder=3,
              resample=False)
    for k in range(3):
        cv.add_patch(Rectangle((X, Y + k * sh / 3), sw, sh / 3, fc="none", ec=MIST, lw=0.4, zorder=4))
    cv.text(X, Y - 2.2, code, fontsize=6.5, color=INK, ha="left", va="bottom", fontweight="bold")
    cv.text(X + 8.2 if len(code) == 3 else X + 9, Y - 2.2, name, fontsize=5.2, color=SOFT, ha="left", va="bottom")
    ax0 = X + sw + 3.0
    if len(ans) == 1:
        cv.text(ax0, Y + 6.0, ans[0], fontsize=9, color=ROSE, ha="left", va="center", family="monospace",
                fontweight="bold")
        cv.text(ax0 + 3.2, Y + 6.0, "= " + gloss[0], fontsize=5.2, color=ROSE, ha="left", va="center")
        cv.text(ax0, Y + 9.6, "one token", fontsize=4.6, color=GREY, ha="left", va="top")
    else:
        for k, (g, gl) in enumerate(zip(ans, gloss)):
            cv.text(ax0 + k * 6.6, Y + 6.0, g, fontsize=9, color=ROSE if g != "–" else MIST, ha="left",
                    va="center", family="monospace", fontweight="bold")
            if gl:
                cv.text(ax0 + k * 6.6 + 1.0, Y + 9.6, gl, fontsize=4.6, color=GREY, ha="center", va="top")
    cv.text(ax0, Y + 14.0, rule, fontsize=6.5, color=INK, ha="left", va="center")
    n = sizes[t["op"]]
    cv.text(ax0, Y + sh, f"{n:,} views" + (" in five tables" if t["op"] == "MUL" else ""),
            fontsize=4.6, color=SOFT, ha="left", va="bottom")
letter(fig, 1.0, 3.0, "a")

# ---- b: a procedure as a walk over tables --------------------------------------------------------------------------
D = S["div"]
check(D["result"] == {"q": "69", "r": "29"} and int(D["a"]) == 69 * int(D["b"]) + 29, "4,100 = 69 x 59 + 29")
calls = D["calls"]
check(len(calls) == 19, "19 forward passes")
K = 5  # the subtraction of the top column: its borrow out says the guess 8 was too high
check(calls[K]["ops"] == ["SUB"] and calls[K]["outs"][0][1] == "1" and calls[K + 1]["ops"] == ["DEC"], "the borrow")
snap = calls[K]["snap"]
s = 0.122
x0, y0 = 23.0, 46.0
geo = draw_sheet(cv, snap, x0=x0, y0=y0, scale=s, label_size=4.6, pad=8, label_gap=4)
cv.text(x0 - 8 * s, y0 - 2.6, f"{int(D['a']):,} ÷ {D['b']}", fontsize=6.5, color=INK, ha="left", va="bottom")
right = x0 + snap["cols"] * CELL * s + 8 * s

TABLES = ["EST", "MUL", "SUB", "DEC", "ADD-FAST"]
TNAME = {"EST": "EST", "MUL": "MUL", "SUB": "SUB", "DEC": "DEC", "ADD-FAST": "SUM", "ADD": "ADD"}


def walk(ax_x, ax_y, w, h, run_calls, title, mark_k=None, answers=True, rows=TABLES):
    """every forward pass a column, every table a row; dots where the pass reads a view of that table"""
    n = len(run_calls)
    dx = w / max(n, 1)
    ry = {t: ax_y + (i + 0.5) * h / len(rows) for i, t in enumerate(rows)}
    for t in rows:
        cv.text(ax_x - 1.6, ry[t], TNAME[t], fontsize=4.8, color=SOFT, ha="right", va="center")
        cv.plot([ax_x, ax_x + w], [ry[t], ry[t]], color="#E3E8F1", lw=0.4, zorder=1)
    prev = None
    for k, c in enumerate(run_calls):
        xx = ax_x + (k + 0.5) * dx
        ys = sorted(ry[o] for o in c["ops"])
        if len(ys) > 1:
            cv.plot([xx, xx], [ys[0], ys[-1]], color=ROSE_L, lw=1.4, zorder=2, solid_capstyle="round")
        here = (xx, ys[0])
        if prev is not None:
            cv.plot([prev[0], here[0]], [prev[1], here[1]], color=GREY, lw=0.35, zorder=1)
        prev = (xx, ys[-1])
        for o, out in zip(c["ops"], c["outs"]):
            cv.scatter([xx], [ry[o]], s=7 if n < 30 else 3.2, color=ROSE, lw=0, zorder=3)
            if answers and o in ("EST", "DEC"):
                cv.text(xx, ry[o] - 1.5, out[0], fontsize=4.8, color=ROSE, ha="center", va="bottom")
        if mark_k is not None and k == mark_k:
            cv.add_patch(Rectangle((xx - dx / 2, ax_y - 0.5), dx, h + 1.0, fc="none", ec=INK, lw=0.4, zorder=4))
    cv.text(ax_x, ax_y - 2.2, title, fontsize=5.5, color=INK, ha="left", va="bottom")
    return dx


wx, ww = 74.0, 104.0
walk(wx, 46.0, ww, 20.0, calls, "Algorithm D: every forward pass of the run, left to right", mark_k=K)
# the story of the second digit, under the walk
dxd = ww / len(calls)
# the windows the run divides, by schoolbook long division of the dividend (checked against the views EST reads)
A_, B_ = int(D["a"]), int(D["b"])
digs, m_ = D["a"], len(D["b"])
win, wins, rem = int(digs[:m_ - 1] or 0), [], 0
for d in digs[m_ - 1:]:
    win = rem * 10 + int(d) if wins else int(digs[:m_])
    wins.append(win)
    rem = win - (win // B_) * B_
    win = rem
check(wins == [41, 410, 560], "the windows 41, 410, 560")
ests = [c["cells"][0] for c in calls if c["ops"] == ["EST"]]
check([e[:2] for e in ests] == [["0", "4"], ["4", "1"], ["5", "6"]], "EST reads each window's top two digits")
phases = [("guess 0, 8", 0, 1), (f"8 × {B_} from {wins[1]}", 2, 5), ("too high: 7", 6, 6),
          ("add back", 7, 9), ("too high: 6", 10, 10), ("add back", 11, 13), ("guess 9", 14, 14),
          (f"9 × {B_} from {wins[2]}", 15, 18)]
for lab, a, b in phases:
    xa, xb = wx + a * dxd + 0.4, wx + (b + 1) * dxd - 0.4
    cv.plot([xa, xb], [68.6, 68.6], color=MIST, lw=0.5, solid_capstyle="butt")
    cv.text((xa + xb) / 2, 69.4, lab, fontsize=4.4, color=SOFT, ha="center", va="top")

Q = S["sqrt"]
check(Q["result"]["root"] == "1414" and 1414 ** 2 <= 2000000 < 1415 ** 2, "isqrt(2,000,000) = 1,414")
walk(wx, 80.0, ww, 15.0, Q["calls"], f"square root of 2,000,000 = 1,414: {len(Q['calls'])} forward passes",
     answers=False, rows=["EST", "MUL", "SUB", "DEC", "ADD"])
check(len(Q["calls"]) == 56, "56 passes")
cv.text(x0 + (snap["cols"] * CELL * s) / 2, y0 + geo["H"] * s + 8 * s + 1.5,
        "the borrow out of the top column\nsays the guess 8 is too high",
        fontsize=4.8, color=INK, ha="center", va="top", linespacing=1.15)
letter(fig, 1.0, 38.0, "b")

# ---- c: waves ------------------------------------------------------------------------------------------------------
W = S["wave"]
together = W["together"]["calls"]
alone = [a["calls"] for a in W["alone"]]
check(len(W["calls"]) == together == 32 and alone == [11, 32, 24, 6] and sum(alone) == 73, "73 calls alone, 32 together")
gx, gy, gw, gh = 22.0, 113.0, 62.0, 22.0
nj = len(W["jobs"])
dx = gw / together
for k in range(together):
    if k % 2 == 0:
        cv.add_patch(Rectangle((gx + k * dx, gy - 1.0), dx, gh + 2.0, fc=TINT, ec="none", zorder=0))
for j, name in enumerate(W["jobs"]):
    yy = gy + (j + 0.5) * gh / nj
    cv.text(gx - 1.6, yy, name, fontsize=4.8, color=SOFT, ha="right", va="center")
    cv.text(gx + gw + 1.6, yy, f"{alone[j]} alone", fontsize=4.6, color=GREY, ha="left", va="center")
    for k, call in enumerate(W["calls"]):
        m = sum(1 for v in call if v["job"] == j)
        if m:
            cv.scatter([gx + (k + 0.5) * dx], [yy], s=3.0 * m + 2.0, color=ROSE, lw=0, zorder=3)
cv.text(gx, gy - 2.6, f"four jobs at once: {together} forward passes, against {sum(alone)} one after another",
        fontsize=5.5, color=INK, ha="left", va="bottom")
cv.text(gx + gw / 2, gy + gh + 2.4, "forward pass", fontsize=5, color=SOFT, ha="center", va="top")

ax = axes(fig, 103.0, 107.0, 30.0, 30.0)
clean(ax)
r = T3["rows"]
wall = np.array([x["wall"] for x in r])
model = np.array([x["model"] for x in r])
calls_ = np.array([x["calls"] for x in r])
views_ = np.array([x["views"] for x in r])
check(np.allclose(model, 0.065 * calls_ + 0.037 * views_, atol=0.006), "cost model = 0.065 s/call + 0.037 s/view")
ax.plot([0, 18], [0, 18], color=VIOLET, lw=0.6, ls=(0, (1, 1.5)), zorder=1)
ax.scatter(model, wall, s=3.2, color=ROSE, lw=0, alpha=0.75, zorder=3)
ax.set_xlim(0, 18)
ax.set_ylim(0, 18)
ax.set_xticks([0, 6, 12, 18])
ax.set_yticks([0, 6, 12, 18])
ax.set_xlabel("cost model (s)", labelpad=1.5)
ax.set_ylabel("measured on the M4 (s)", labelpad=1.5)
ratio = float(np.median(wall / model))
check(abs(ratio - 1.0146) < 1e-3, "median measured / modelled")
ax.text(0.8, 17.2, "0.065 s a pass\n+ 0.037 s a view", fontsize=4.8, color=INK, ha="left", va="top",
        linespacing=1.15)
ax.text(17.5, 1.0, f"median ratio {ratio:.2f}", fontsize=4.8, color=SOFT, ha="right", va="bottom")
letter(fig, 1.0, 101.0, "c")

# ---- d: T3 ---------------------------------------------------------------------------------------------------------
ax = axes(fig, 146.0, 107.0, 32.0, 30.0)
clean(ax)
sets = [("div", "÷ to 10\nplaces"), ("sqrt", "√ to 6\nplaces"), ("gcd", "gcd"), ("pm", "signed\n±")]
rng = np.random.default_rng(3)
for i, (key, lab) in enumerate(sets):
    w = np.array([x["wall"] for x in r if x["set"] == key])
    ok = sum(x["ok"] for x in r if x["set"] == key)
    check(len(w) == 50 and ok == 50 == T3["set"][key]["exact"], f"{key} 50/50")
    check(int((w > 12).sum()) == T3["set"][key]["over12"], f"{key} over 12 s")
    jit = (rng.random(len(w)) - 0.5) * 0.5
    ax.scatter(i + jit, w, s=2.6, color=ROSE, lw=0, alpha=0.8, zorder=3)
    ax.text(i, 18.6, f"{ok}/50", fontsize=4.8, color=ROSE, ha="center", va="bottom")
ax.axhline(12, color=VIOLET, lw=0.6, ls=(0, (1, 1.5)), zorder=1)
ax.text(3.45, 12.3, "12 s", fontsize=4.8, color=VIOLET, ha="right", va="bottom")
ax.set_xlim(-0.6, 3.6)
ax.set_ylim(0, 18)
ax.set_yticks([0, 6, 12, 18])
ax.set_xticks(range(4))
ax.set_xticklabels([l for _, l in sets], fontsize=4.8, linespacing=1.0)
ax.tick_params(axis="x", length=0, pad=2)
ax.set_ylabel("seconds", labelpad=1.5)
under = int((wall <= 12).sum())
check(under == 184, "184 of 200 within 12 s")
letter(fig, 138.0, 101.0, "d")

save(fig, "fig2")
