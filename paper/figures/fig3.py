"""Figure 3. Certification.

a  Theorem P, sheet form: sums of every length (the runtime's adder with the reference table, data/sheets.json
   addRuns) read only views of one finite table; every tick is threaded to its view among the 242
b  no finite test suffices once state leaves the sheet: the counterexample of THEOREMS.md VI.6 (Lean
   theorem8a_counterexample, no_finite_check), drawn from its closed form. A head writes 4R(k+2)/(e^c+2k+6) onto the
   wrong answer at the k-th unpinned tick; with e^c = 2N + 3 the right answer's margin stays positive for every k <= N
   and turns negative at N + 1. Pinned on the sheet, the write is the constant 12R/(e^c+8).
c  margins per table, all 2,446 views on the M4 (data/certificate_e7.json), and the weakest tenth of each kind that
   every new device checks again (pad.svelte.ts, SPOT = 0.1)
d  across devices: each table's lowest margin on the server (PyTorch; data/eval_*_server.json) against the browser
   (WebGPU): fp16 decoders (E7, E6) and the earlier q4 decoders (E2, E2b; REPORT.md, results table)
"""
import numpy as np
from matplotlib.patches import Rectangle

from common import (COBALT, COBALT_L, GREY, INK, MIST, ROSE, ROSE_L, SOFT, TINT, VIOLET, axes, canvas, check, clean,
                    figure, letter, load, save, setup)

setup()
S = load("sheets.json")
CERT = load("certificate_e7.json")
UNG = load("certificate_e7_ungated.json")
CE6 = load("certificate_e6.json")
E7 = load("eval_e7_server.json")
E6 = load("eval_e6_server.json")
E2 = load("eval_e2_server.json")
E2B = load("eval_e2b_server.json")

fig = figure(128)
cv = canvas(fig)

# ---- a: every run folds onto the finite table ---------------------------------------------------------------------
R = S["addRuns"]
check(R["table"] == 242, "the add table has 242 views")
runs = R["runs"]
check([r["digits"] for r in runs] == [4, 8, 16, 32, 64, 128, 256, 512, 1024], "run lengths")
check(all(r["ticks"] == r["digits"] + 1 for r in runs), "one tick per column, and the halt")
seen = set()
for r in runs:
    seen |= set(r["views"])
G = 11
cell = 1.32
gx0, gy0 = 30.0, 45.0  # the table: rows bottom digit, columns (carry, top digit)
gw = 2 * G * cell


def view_xy(i):
    ci, ti, bi = i // (G * G), (i // G) % G, i % G
    return gx0 + (ci * G + ti + 0.5) * cell, gy0 + (bi + 0.5) * cell


rx0, step, rx1 = 22.0, 1.05, 98.0
ry = np.linspace(9.0, 33.0, len(runs))
for r, yy in zip(runs, ry):
    n = r["ticks"]
    xs = rx0 + np.arange(n) * step
    vis = xs < rx1
    # threads first, under everything
    for x, v in zip(xs[vis], np.asarray(r["views"])[vis]):
        tx, ty = view_xy(v)
        cv.plot([x, tx], [yy + 0.5, ty], color=ROSE, lw=0.22, alpha=0.16, zorder=1, solid_capstyle="round")
    end = min(xs[-1], rx1)
    cv.plot([rx0, end], [yy, yy], color=SOFT, lw=0.4, zorder=2)
    alpha = np.clip((rx1 - xs[vis]) / 14.0, 0.0, 1.0) if n * step > rx1 - rx0 else np.ones(vis.sum())
    for x, a in zip(xs[vis], alpha):
        cv.plot([x], [yy], marker="o", ms=1.5, color=INK, alpha=float(a), lw=0, zorder=3)
    if n * step > rx1 - rx0:
        cv.text(rx1 + 0.6, yy, "…", fontsize=6, color=SOFT, ha="left", va="center")
    cv.text(rx0 - 1.6, yy, f"{r['digits']:,}", fontsize=5, color=SOFT, ha="right", va="center")
    cv.text(rx1 + 7.5, yy, f"{len(set(r['views']))}", fontsize=5, color=ROSE, ha="right", va="center")
cv.text(rx0 - 1.6, ry[0] - 3.2, "digits", fontsize=5, color=SOFT, ha="right", va="bottom")
cv.text(rx1 + 7.5, ry[0] - 3.2, "views read", fontsize=5, color=ROSE, ha="right", va="bottom")
cv.text(rx0, ry[0] - 3.2, "sums of every length, one tick per column", fontsize=5.5, color=INK, ha="left",
        va="bottom")
check([len(set(r["views"])) for r in runs] == [5, 9, 16, 30, 56, 91, 142, 181, 201], "distinct views per run")
# the table
for i in range(242):
    x, y = view_xy(i)
    on = i in seen
    cv.add_patch(Rectangle((x - cell / 2 + 0.08, y - cell / 2 + 0.08), cell - 0.16, cell - 0.16,
                           fc=ROSE if on else "white", ec=ROSE if on else MIST, lw=0.25, alpha=0.85 if on else 1,
                           zorder=4))
check(len(seen) == 202, "202 of the 242 views read by these nine runs")
unread = [i for i in range(242) if i not in seen]
check(len(unread) == 40 and all(((i // G) % G == 0) != (i % G == 0) for i in unread),
      "the 40 unread views have exactly one blank operand")
cv.text(gx0 + gw + 2.5, gy0 + 3.0, "the add table:\n242 views", fontsize=5.5, color=INK, ha="left", va="top",
        linespacing=1.15)
cv.text(gx0 + gw + 2.5, gy0 + 9.0, f"{len(seen)} read by these nine sums;\nthe other {len(unread)} need numbers\nof unequal length",
        fontsize=5, color=ROSE, ha="left", va="top", linespacing=1.15)
cv.text(gx0 + gw / 2, gy0 + G * cell + 3.4,
        r"exact on every view  $\Longleftrightarrow$  exact on every run, of every length",
        fontsize=6.5, color=INK, ha="center", va="top")
letter(fig, 1.0, 3.0, "a")

# ---- b: no finite test --------------------------------------------------------------------------------------------
ax = axes(fig, 126.0, 8.0, 50.0, 48.0)
clean(ax)
k = np.arange(1, 25)


def unpinned(k, N):
    ec = 2 * N + 3
    return 1 - 4 * (k + 2) / (ec + 2 * k + 6)


for N in (4, 8, 16):
    m = unpinned(k, N)
    check(np.all(m[k <= N] > 0) and unpinned(N + 1, N) < 0, f"N = {N}: right up to N, wrong at N + 1")
    main = N == 8
    col = COBALT if main else COBALT_L
    ax.plot(k, m, color=col, lw=0.9 if main else 0.7, zorder=3, marker="o", ms=1.6 if main else 1.1)
    ax.plot([N + 1], [unpinned(N + 1, N)], marker="x", ms=3.2, mew=0.8, color=INK, zorder=4, lw=0)
    if N == 4:
        ax.text(N + 0.4, -0.04, f"N = {N}", fontsize=5, color=col, ha="right", va="top")
    else:
        ax.text(N + 1.5, 0.035, f"N = {N}", fontsize=5, color=col, ha="left", va="bottom")
pin = 1 - 12 / (2 * 8 + 3 + 8)
check(abs(pin - 15 / 27) < 1e-12 and abs(unpinned(1, 8) - pin) < 1e-12, "pinned write = the first tick's")
ax.plot([1, 24], [pin, pin], color=ROSE, lw=1.0, zorder=3)
ax.text(24.2, pin + 0.03, "state on the sheet (pinned)", fontsize=5, color=ROSE, ha="right", va="bottom")
ax.axhline(0, color=VIOLET, lw=0.6, ls=(0, (1, 1.5)), zorder=1)
ax.axvspan(0.5, 8.5, color=TINT, zorder=0, lw=0)
ax.text(4.5, -0.42, "every test up\nto N = 8 passes", fontsize=4.8, color=SOFT, ha="center", va="bottom",
        linespacing=1.1)
ax.text(24.2, 0.80, "×  first wrong tick, N + 1", fontsize=5, color=INK, ha="right", va="top")
ax.set_xlim(0.5, 24.5)
ax.set_ylim(-0.45, 0.82)
ax.set_xticks([1, 8, 16, 24])
ax.set_yticks([0, 0.4, 0.8])
ax.set_xlabel("tick", labelpad=1.5)
ax.set_ylabel("margin of the right answer (units of R)", labelpad=1.5)
ax.text(24.2, 0.73, "state in the context (unpinned)", fontsize=5, color=COBALT, ha="right", va="top")
letter(fig, 116.0, 3.0, "b")

# ---- c: margins per table -----------------------------------------------------------------------------------------
add_m = np.array(CERT["kinds"]["add"]["margins"])
mul_m = np.array(CERT["kinds"]["mul"]["margins"])
calc_m = np.array(CERT["kinds"]["calc"]["margins"])
check(all(np.array_equal(m, UNG[k]["margins"]) for k, m in (("add", add_m), ("mul", mul_m), ("calc", calc_m))),
      "gate 1 = ungated E7: every margin equal")
tables = [("SUM", add_m, "add", 0, 242), ("MUL", mul_m, "mul", 0, 1100), ("ADD", mul_m, "mul", 1100, 1320),
          ("ADZ", mul_m, "mul", 1320, 1540), ("FLS", mul_m, "mul", 1540, 1542), ("NXT", mul_m, "mul", 1542, 1553),
          ("SUB", calc_m, "calc", 0, 242), ("EST", calc_m, "calc", 242, 642), ("DEC", calc_m, "calc", 642, 651)]
spot = {}
for kind, arr in (("add", add_m), ("mul", mul_m), ("calc", calc_m)):
    n = int(np.ceil(len(arr) * 0.1))
    spot[kind] = set(np.argsort(arr, kind="stable")[:n].tolist())
check([len(spot[k]) for k in ("add", "mul", "calc")] == [25, 156, 66], "weakest tenth: 25, 156, 66 views")
ax = axes(fig, 14.0, 76.0, 86.0, 44.0)
clean(ax, left=False)
rng = np.random.default_rng(7)
mins = {}
for row, (name, arr, kind, a, b) in enumerate(tables):
    v = arr[a:b]
    idx = np.arange(a, b)
    y = row + (rng.random(len(v)) - 0.5) * 0.56
    weak = np.array([i in spot[kind] for i in idx])
    ax.scatter(v[~weak], y[~weak], s=1.6, color=ROSE_L, lw=0, alpha=0.7, zorder=2)
    ax.scatter(v[weak], y[weak], s=2.2, color=ROSE, lw=0, zorder=3)
    mins[name] = float(v.min())
    ax.text(v.min() - 0.35, row, f"{v.min():.2f}", fontsize=4.8, color=INK, ha="right", va="center")
    ax.text(-0.4, row, f"{name}", fontsize=5.2, color=SOFT, ha="right", va="center")
    ax.text(21.3, row, f"{b - a:,}", fontsize=4.8, color=GREY, ha="right", va="center")
check(abs(mins["SUM"] - 3.016) < 1e-9 and abs(mins["MUL"] - 6.516) < 1e-9 and abs(mins["EST"] - 4.609) < 1e-9,
      "minima 3.02, 6.52, 4.61")
ax.axvline(0, color=VIOLET, lw=0.6, ls=(0, (1, 1.5)), zorder=1)
ax.set_ylim(len(tables) - 0.5, -0.9)
ax.set_xlim(-2.6, 21.5)
ax.set_xticks([0, 5, 10, 15, 20])
ax.set_xlabel("margin on the M4 (logits)", labelpad=1.5)
ax.text(21.3, -0.85, "views", fontsize=4.8, color=GREY, ha="right", va="center")
ax.text(0.4, -0.85, "dark: the weakest tenth of each kind, checked again by every new device", fontsize=5,
        color=ROSE, ha="left", va="center")
letter(fig, 1.0, 69.0, "c")

# ---- d: across devices --------------------------------------------------------------------------------------------
ax = axes(fig, 126.0, 74.0, 46.0, 46.0)
clean(ax)
pts7 = [(E7["min_margin"][n], mins[n], n) for n, *_ in tables]
e6_add = np.array(CE6["kinds"]["add"]["margins"])
e6_mul = np.array(CE6["kinds"]["mul"]["margins"])
e6_dev = {"SUM": e6_add.min(), "MUL": e6_mul[:1100].min(), "ADD": e6_mul[1100:1320].min(),
          "ADZ": e6_mul[1320:1540].min(), "FLS": e6_mul[1540:1542].min(), "NXT": e6_mul[1542:].min()}
check(abs(e6_add.min() - 5.578) < 1e-9 and abs(e6_mul.min() - 3.531) < 1e-9, "E6 device minima 5.58, 3.53")
pts6 = [(E6["min_margin"][n], e6_dev[n], n) for n in e6_dev]
# q4 decoders, from REPORT.md's results table (device column): E2 0.59, E2b 1.40
q4 = [(E2["min_margin"], 0.59, "E2"), (E2B["min_margin"], 1.40, "E2b")]
check(abs(E2["min_margin"] - 3.555) < 1e-3 and abs(E2B["min_margin"] - 1.248) < 1e-3, "E2 3.56, E2b 1.25 server")
lim = (0, 15)
ax.plot(lim, lim, color=VIOLET, lw=0.6, ls=(0, (1, 1.5)), zorder=1)
ax.scatter([p[0] for p in pts7], [p[1] for p in pts7], s=9, color=ROSE, lw=0, zorder=3)
ax.scatter([p[0] for p in pts6], [p[1] for p in pts6], s=9, facecolor="white", edgecolor=ROSE, lw=0.7, zorder=3)
ax.scatter([p[0] for p in q4], [p[1] for p in q4], s=9, color=GREY, marker="s", lw=0, zorder=3)
off = {"SUM": (0.4, -0.2, "left"), "MUL": (-0.4, 0.3, "right"), "EST": (0.4, -0.3, "left"),
       "SUB": (-0.4, 0.3, "right"), "ADZ": (0.4, -0.3, "left"), "ADD": (-0.4, 0.3, "right"),
       "DEC": (0.4, -0.3, "left"), "NXT": (-0.4, 0.3, "right"), "FLS": (0.4, -0.3, "left")}
for x, y, n in pts7:
    dx, dy, ha = off[n]
    ax.text(x + dx, y + dy, n, fontsize=4.6, color=ROSE, ha=ha, va="center")
for x, y, n in q4:
    ax.text(x + 0.4, y - 0.1, n, fontsize=4.6, color=GREY, ha="left", va="center")
ax.set_xlim(*lim)
ax.set_ylim(*lim)
ax.set_xticks([0, 5, 10, 15])
ax.set_yticks([0, 5, 10, 15])
ax.set_xlabel("lowest margin, server (PyTorch)", labelpad=1.5)
ax.set_ylabel("lowest margin, browser (WebGPU)", labelpad=1.5)
ax.scatter([0.9], [14.2], s=9, color=ROSE, lw=0)
ax.text(1.5, 14.2, "E7, fp16 decoder", fontsize=5, color=ROSE, ha="left", va="center")
ax.scatter([0.9], [13.0], s=9, facecolor="white", edgecolor=ROSE, lw=0.7)
ax.text(1.5, 13.0, "E6, fp16 decoder", fontsize=5, color=ROSE, ha="left", va="center")
ax.scatter([0.9], [11.8], s=9, color=GREY, marker="s", lw=0)
ax.text(1.5, 11.8, "E2, E2b, 4-bit (q4) decoder", fontsize=5, color=GREY, ha="left", va="center")
letter(fig, 116.0, 69.0, "d")

save(fig, "fig3")
