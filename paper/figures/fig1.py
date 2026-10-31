"""Figure 1. The sheet: one tick, any length, one certificate.

a  a real long multiplication on the sheet (the runtime's own layout, data/sheets.json from sheets.ts), the three
   cells being read, and the glyphs the model writes next (rose, hollow)
b  one tick: the three cells as the model receives them (the true 32 x 96 strip), through the vision tower, one forward
   pass of the 24 layers, three answers out
c  share exact against digits: Sketchpad's measured runs (E7 server evaluation, data/eval_e7_server.json); baseline
   series are drawn from data/baselines.json when that record exists (the writer's registered run)
d  the certificate: all 2,446 views on the M4 (data/certificate_e7.json = HF 2df87172 arithmetic/certificate.json),
   each a square shaded by its margin, laid out along each table's own axes; the lowest margin ringed
"""
import numpy as np
from matplotlib.patches import Ellipse, FancyBboxPatch, PathPatch, Rectangle
from matplotlib.path import Path
from matplotlib.colors import LinearSegmentedColormap

from common import (CELL, COBALT, GREY, INK, MIST, ROSE, ROSE_L, SOFT, TINT, axes, canvas, check, clean,
                    draw_sheet, figure, fovea_box, letter, load, save, setup, strip_image, DATA, cmap_exact)

setup()
S = load("sheets.json")
M = S["mul"]
CERT = load("certificate_e7.json")
EV = load("eval_e7_server.json")

fig = figure(122)
cv = canvas(fig)

# ---- a: the sheet --------------------------------------------------------------------------------------------------
snap = M["sheet"]
check(M["product"] == M["expected"] == str(int(M["a"]) * int(M["b"])), "the product")
check(M["op"] == "MUL" and M["answer"] == ["8", "0", "A"], "the next tick")
s = 0.200  # mm per sheet pixel: a cell is 6.4 mm
x0, y0 = 19.0, 13.0
# the glyphs this tick writes, drawn hollow in rose where they will land
stamps = {(st["r"], st["c"]): (g, ROSE, 0.42) for st, g in zip(M["stamps"], M["answer"][:2])}
geo = draw_sheet(cv, snap, x0=x0, y0=y0, scale=s, extra=stamps, label_size=5.5, pad=9, label_gap=5)
for (r, c), (g, _, _) in stamps.items():
    fovea_box(cv, x0 + c * CELL * s, y0 + geo["ys"][r] * s, CELL * s, color=ROSE, lw=0.7, zorder=6)
ncol = snap["cols"]
right = x0 + ncol * CELL * s
# what the sheet says, in words, off every line
tick = M["tick"] + 1
check(tick == 33 and M["ticks_total"] == 56, "tick 33 of 56")
cv.text(x0 - 9 * s, y0 - 4.2, f"{int(M['a']):,} × {int(M['b']):,}", fontsize=7, color=INK, ha="left", va="bottom")
cv.text(right + 9 * s, y0 - 4.2, f"tick {tick} of {M['ticks_total']}", fontsize=6, color=SOFT, ha="right",
        va="bottom")
# leaders to the reading and the writing
fy = [f for f in snap["fovea"] if f]
top_f = min(fy, key=lambda f: f["r"])
cv.annotate("reads three cells", xy=(x0 + (top_f["c"] + 0.5) * CELL * s, y0 + geo["ys"][0] * s - 0.4),
            xytext=(x0 + (top_f["c"] + 0.5) * CELL * s, y0 - 1.0), fontsize=5.5, color=INK, ha="center",
            va="bottom", arrowprops=dict(arrowstyle="-", lw=0.4, color=INK, shrinkA=0.5, shrinkB=0))
pr = [st for st in M["stamps"] if st["r"] == 4][0]
py = y0 + (geo["ys"][4] + CELL / 2) * s
cv.text(x0 + (pr["c"] + 1) * CELL * s + 1.4, py, "writes 8, carries 0", fontsize=5.5, color=ROSE, ha="left",
        va="center")
check(snap["glyphs"][5][4:] == list("3968837"), "partial product on the sheet")
check([g for g in snap["glyphs"][4] if g != " "] == [] and snap["glyphs"][4][pr["c"]] == " ", "product row empty")

# ---- b: one tick ---------------------------------------------------------------------------------------------------
bx = 98.0
strip = np.asarray(M["strip"], dtype=float)
check(strip.shape == (96, 32), "the strip is 32 x 96")
sw, sh = 7.2, 21.6
sx, sy = bx + 2.0, 22.0
cv.imshow(strip_image(strip), extent=(sx, sx + sw, sy + sh, sy), interpolation="nearest", zorder=3, resample=False)
for k in range(3):
    cv.add_patch(Rectangle((sx, sy + k * sh / 3), sw, sh / 3, fc="none", ec=MIST, lw=0.4, zorder=4))
cv.text(sx + sw / 2, sy + sh + 1.6, "the view\n32 × 96 px", fontsize=5, color=SOFT, ha="center", va="top",
        linespacing=1.1)
# which sheet cell each strip cell is
for k, name in enumerate(["a", "b", "carry"]):
    cv.text(sx - 0.8, sy + (k + 0.5) * sh / 3, name, fontsize=4.6, color=GREY, ha="right", va="center")

# the vision tower as a lens
lx, lc, lh = bx + 14.0, sy + sh / 2, 30.0
lens = Ellipse((lx, lc), 3.4, lh, fc="#EEF2F9", ec=SOFT, lw=0.5, zorder=2)
cv.add_patch(lens)
cv.text(lx + 0.8, lc + lh / 2 + 1.2, "vision\ntower", fontsize=5, color=SOFT, ha="center", va="top", linespacing=1.1)

# the prompt's tokens, top to bottom, and 24 layers left to right
tokens = ["MUL", "img", "img", "img", "=", "?", "?"]
ty = np.linspace(14.0, 52.0, len(tokens))
tx = bx + 22.0
for k, (t, yy) in enumerate(zip(tokens, ty)):
    if t == "img":
        cv.add_patch(Rectangle((tx - 1.3, yy - 1.3), 2.6, 2.6, fc=TINT, ec=INK, lw=0.45, zorder=4))
        # rays: strip cell k-1 through the lens to its token
        cy = sy + (k - 1 + 0.5) * sh / 3
        xm = (sx + sw + tx - 1.3) / 2
        verts = [(sx + sw, cy), (xm, cy), (xm, yy), (tx - 1.3, yy)]
        cv.add_patch(PathPatch(Path(verts, [Path.MOVETO, Path.CURVE4, Path.CURVE4, Path.CURVE4]), fc="none",
                               ec=SOFT, lw=0.45, zorder=3))
        if k == 1:
            cv.text(tx - 2.0, yy - 2.2, "image\ntokens", fontsize=4.6, color=GREY, ha="right", va="bottom", linespacing=1.0)
    else:
        cv.text(tx, yy, t, fontsize=6, color=INK, ha="center", va="center", family="monospace")
L0, L1 = tx + 4.5, tx + 36.0
lx_ = np.linspace(L0, L1, 24)
full = [3, 7, 11, 15, 19, 23]  # Qwen3.5: every fourth layer is full attention, the rest Gated DeltaNet
for i, xx in enumerate(lx_):
    on = i in full
    cv.plot([xx, xx], [ty[0] - 2.4, ty[-1] + 2.4], color=SOFT if on else "#D5DCE8", lw=0.6 if on else 0.35,
            zorder=2, solid_capstyle="butt")
answer_rows = [4, 5, 6]
for k, yy in enumerate(ty):
    ans = k in answer_rows
    cv.plot([tx + 2.6, L1 + (3.0 if ans else 0.6)], [yy, yy], color=ROSE if ans else GREY,
            lw=0.75 if ans else 0.4, zorder=3, solid_capstyle="round")
cv.text((L0 + L1) / 2, ty[0] - 4.6, "one forward pass of Qwen3.5-0.8B", fontsize=5.5, color=INK, ha="center",
        va="bottom")
cv.text((L0 + L1) / 2, ty[-1] + 4.4, "24 layers: 6 full attention (dark), 18 Gated DeltaNet", fontsize=5,
        color=SOFT, ha="center", va="top")
for k, (g, what) in zip(answer_rows, zip(M["answer"], ["digit", "carry", "next step"])):
    cv.text(L1 + 4.2, ty[k], g, fontsize=8.5, color=ROSE, ha="left", va="center", family="monospace",
            fontweight="bold")
    cv.text(L1 + 7.6, ty[k], what, fontsize=5, color=SOFT, ha="left", va="center")

# ---- c: share exact against digits, sums and products apart ------------------------------------------------------
import collections
import json

BL = load("baselines.json")
REC = json.loads((DATA.parents[1] / "baselines" / "results.json").read_text())
truth = collections.defaultdict(lambda: [0, 0])
for r in REC:
    truth[(r["system"], r["family"], r["n"])][0] += bool(r["exact"])
    truth[(r["system"], r["family"], r["n"])][1] += 1
check(BL["totals"] == {"sketchpad": 220, "27b thinking": 121, "0.8b thinking": 3, "0.8b nothink": 23},
      "220, 121, 3 and 23 of 220")
STYLE = {"ours": dict(color=ROSE, lw=1.1, z=5), "strongest": dict(color=COBALT, lw=1.0, z=4),
         "baseline": dict(color=GREY, lw=0.8, z=3)}
panels = {"add": (13.0, "sums  $a + b$", (6, 2000), [10, 100, 1000], ["10", "100", "1,000"]),
          "mul": (45.0, r"products  $a \times b$", (1.6, 26), [2, 5, 10, 20], ["2", "5", "10", "20"])}
ends = {}
for fam, (x0c, title, xlim, ticks, tlabels) in panels.items():
    ax = axes(fig, x0c, 77.0, 25.0, 37.0)
    clean(ax, left=(fam == "add"))
    ax.set_xscale("log")
    ax.set_xlim(*xlim)
    ax.set_ylim(-0.04, 1.06)
    ax.set_xticks(ticks)
    ax.set_xticklabels(tlabels)
    ax.minorticks_off()
    ax.set_xlabel("digits per number", labelpad=1.5)
    if fam == "add":
        ax.set_yticks([0, 0.5, 1])
        ax.set_yticklabels(["0", "0.5", "1"])
        ax.set_ylabel("share exact", labelpad=1.5)
    ax.text(xlim[0], 1.13, title, fontsize=6, color=INK, ha="left", va="bottom")
    for ser in BL["series"]:
        if ser["family"] != fam:
            continue
        st = STYLE[ser["role"]]
        xs_ = [p[0] for p in ser["points"]]
        ys_ = []
        for n, k, tot in ser["points"]:
            check([k, tot] == truth[(ser["system"], fam, n)] and tot == 20, f"{ser['name']} {fam} {n}: {k}/{tot}")
            ys_.append(k / tot)
        ax.plot(xs_, ys_, color=st["color"], lw=st["lw"], ls=(0, (3, 1.6)) if ser["dashed"] else "-",
                marker="o", ms=1.9, zorder=st["z"], clip_on=False)
        ends[(ser["name"], fam)] = (xs_[-1], ys_[-1])
    ax_mul = ax
# labels at the line ends, in the products panel (the same styles in both)
lab = {"Sketchpad": (0.0, ROSE), "Qwen3.5-27B, thinking": (0.0, COBALT)}
check(ends[("Sketchpad", "mul")][1] == 1.0 and abs(ends[("Qwen3.5-27B, thinking", "mul")][1] - 7 / 20) < 1e-12
      and ends[("Qwen3.5-0.8B, thinking", "mul")][1] == 0 and ends[("Qwen3.5-0.8B, no thinking", "mul")][1] == 0,
      "the products' line ends: 1, 0.35, 0, 0")
for name, (dy, col) in lab.items():
    x_, y_ = ends[(name, "mul")]
    ax_mul.text(x_ * 1.12, y_ + dy, name.replace("Qwen3.5-", ""), fontsize=4.8, color=col, ha="left",
                va="center", clip_on=False)
x_, y_ = ends[("Qwen3.5-0.8B, thinking", "mul")]
ax_mul.text(x_ * 1.12, y_ + 0.03, "0.8B: thinking,\nno thinking (dashed)", fontsize=4.8, color=GREY, ha="left",
            va="bottom", linespacing=1.05, clip_on=False)
check(ends[("Sketchpad", "add")][1] == 1.0 and ends[("Qwen3.5-27B, thinking", "add")][1] == 0.0,
      "the sums' line ends: 1 and 0")

# ---- d: the certificate --------------------------------------------------------------------------------------------
kinds = CERT["kinds"]
check(sum(k["rows"] for k in kinds.values()) == 2446 and all(k["rows"] == k["pass"] for k in kinds.values()),
      "2,446 of 2,446 pass")
add_m = np.array(kinds["add"]["margins"])
mul_m = np.array(kinds["mul"]["margins"])
calc_m = np.array(kinds["calc"]["margins"])
check(len(add_m) == 242 and len(mul_m) == 1553 and len(calc_m) == 651, "row counts")
G = 11  # glyphs: blank, 0-9
blocks = {}
# SUM: carry (2) x top (11) x bottom (11); columns carry, top; rows bottom
blocks["SUM"] = add_m.reshape(2, G, G).transpose(2, 0, 1).reshape(G, 2 * G)
mul_only = mul_m[:1100].reshape(G, 10, 10)                       # a, b, c
blocks["MUL"] = mul_only.transpose(2, 0, 1).reshape(10, 110)      # rows c; columns a, b
blocks["ADD"] = mul_m[1100:1320].reshape(2, 10, G).transpose(2, 0, 1).reshape(G, 20)
blocks["ADZ"] = mul_m[1320:1540].reshape(2, 10, G).transpose(2, 0, 1).reshape(G, 20)
blocks["FLS"] = mul_m[1540:1542].reshape(1, 2)
blocks["NXT"] = mul_m[1542:1553].reshape(1, G)
blocks["SUB"] = calc_m[:242].reshape(2, G, G).transpose(2, 0, 1).reshape(G, 2 * G)
est = calc_m[242:642]
cols, k = [], 0
for d in range(5, 10):
    n = (d + 1) * 10
    cols.append(est[k:k + n].reshape(d + 1, 10).T)  # rows: r_lo; columns: r_hi
    k += n
blocks["EST"] = np.concatenate(cols, axis=1)
blocks["DEC"] = calc_m[642:651].reshape(1, 9)
check(sum(b.size for b in blocks.values()) == 2446, "every view drawn once")

cm = LinearSegmentedColormap.from_list("cert", [cmap_exact(x) for x in np.linspace(0, 0.86, 64)])
VMAX = 20.0
cell = 0.64
dx0, dy0 = 103.0, 77.0
layout = [  # (name, column offset in cells, row offset in cells)
    ("MUL", 0, 0),
    ("SUM", 0, 15), ("ADD", 25, 15), ("ADZ", 48, 15), ("SUB", 71, 15),
    ("EST", 0, 34), ("NXT", 46, 34), ("FLS", 62, 34), ("DEC", 71, 34),
]
names = {"MUL": "MUL 1,100", "SUM": "SUM 242", "ADD": "ADD 220", "ADZ": "ADZ 220", "SUB": "SUB 242",
         "EST": "EST 400", "NXT": "NXT 11", "FLS": "FLS 2", "DEC": "DEC 9"}
for name, cx, cy in layout:
    b = blocks[name]
    X, Y = dx0 + cx * cell, dy0 + cy * cell
    cv.imshow(cm(np.clip(b / VMAX, 0, 1)), extent=(X, X + b.shape[1] * cell, Y + b.shape[0] * cell, Y),
              interpolation="nearest", zorder=3, resample=False)
    check(names[name].split()[1].replace(",", "") == str(b.size), f"{name} size label")
    cv.text(X, Y - 0.7, names[name], fontsize=5, color=SOFT, ha="left", va="bottom")
# a white hairline grid, so each view reads as its own square
for name, cx, cy in layout:
    b = blocks[name]
    X, Y = dx0 + cx * cell, dy0 + cy * cell
    for i in range(1, b.shape[1]):
        cv.plot([X + i * cell] * 2, [Y, Y + b.shape[0] * cell], color="white", lw=0.12, zorder=4)
    for j in range(1, b.shape[0]):
        cv.plot([X, X + b.shape[1] * cell], [Y + j * cell] * 2, color="white", lw=0.12, zorder=4)
# the lowest margin
i = int(add_m.argmin())
ci, ti, bi = i // (G * G), (i // G) % G, i % G
check(abs(add_m.min() - 3.016) < 1e-9 and (ci, ti, bi) == (0, 6, 7), "lowest margin: SUM [ ,5,6], 3.016")
rx, ry = dx0 + (0 + ci * G + ti) * cell, dy0 + (15 + bi) * cell
cv.add_patch(Rectangle((rx - 0.25, ry - 0.25), cell + 0.5, cell + 0.5, fc="none", ec=INK, lw=0.6, zorder=6))
ly = dy0 + 28.6 * cell
cv.plot([rx + cell / 2, rx + cell / 2, rx + cell / 2 + 2.0], [ry + cell + 0.25, ly, ly], color=INK, lw=0.35,
        solid_joinstyle="miter")
cv.text(rx + cell / 2 + 2.6, ly, f"lowest margin {add_m.min():.2f}: SUM reading 5 and 6, no carry", fontsize=4.8,
        color=INK, ha="left", va="center")
# the ramp
ry0 = dy0 + 46.5 * cell
grad = cm(np.linspace(0, 1, 200))[None, :, :]
cv.imshow(grad, extent=(dx0 + 44 * cell, dx0 + 74 * cell, ry0 + 1.3, ry0), interpolation="bilinear", zorder=3)
for v in (0, 10, 20):
    xx = dx0 + 44 * cell + v / VMAX * 30 * cell
    cv.plot([xx, xx], [ry0 + 1.3, ry0 + 1.9], color=INK, lw=0.4)
    cv.text(xx, ry0 + 2.2, f"{v}", fontsize=4.8, color=INK, ha="center", va="top")
cv.text(dx0 + 43 * cell, ry0 + 0.65, "margin (logits)", fontsize=5, color=SOFT, ha="right", va="center")
check(int(CERT["kinds"]["add"]["pass"] + CERT["kinds"]["mul"]["pass"] + CERT["kinds"]["calc"]["pass"]) == 2446,
      "2,446 views pass")
cv.text(dx0, dy0 - 5.6, "2,446 of 2,446 views pass on the M4 (WebGPU, fp16)", fontsize=6, color=INK, ha="left",
        va="bottom")

# ---- letters -------------------------------------------------------------------------------------------------------
letter(fig, 2.0, 3.0, "a")
letter(fig, bx - 2.0, 3.0, "b")
letter(fig, 2.0, 67.0, "c")
letter(fig, dx0 - 8.0, 67.0, "d")
save(fig, "fig1")
