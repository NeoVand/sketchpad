"""Figure 1, redrawn: the mechanism, the guarantee, the result. Two variants of one content:

    python fig1_v2.py a    ->  fig1_v2a: a filmstrip of three consecutive steps; the certificate on each table's axes
    python fig1_v2.py b    ->  fig1_v2b: one sheet with the three windows in turn, the answer written back;
                               the certificate as each table's margins in order, weakest first

a  the sheet: 74,829 x 6,153 on the runtime's own layout (data/sheets.json: sheets.ts runs src/lib/sketchpad with the
   reference tables), the training sprites, the cells the step reads, the digits the model has just written in rose;
   the whole product as its 56 steps, one forward pass each
b  one step at token level: the view's real 32 x 96 pixels (assembleStrip), the vision encoder's 16-px patches merged
   2 x 2 into three image tokens, the prompt MUL [img][img][img] = ? ?, 24 layers (6 full attention, darker), and the
   three answers read at = and the two slots
c  the guarantee: all 2,446 views on the M4 (data/certificate_e7.json = HF 2df87172), shaded by margin; the weakest
   view's real pixels; Theorem 1; the device re-check of the weakest tenth (pad.svelte.ts, SPOT = 0.1)
d  the result: % exact on the registered benchmark's 220 problems (data/baselines.json from paper/baselines/results.json),
   and the longest sums and products
"""
import json
import sys

import numpy as np
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import FancyBboxPatch, PathPatch, Rectangle
from matplotlib.path import Path

from common import (CELL, COBALT, DATA, GREY, INK, MIST, ROSE, ROSE_L, SOFT, TINT, VIOLET, assert_clean, canvas, check,
                    cmap_exact, figure, hex_rgb, load, save, setup, sprites, GLYPHS)

VARIANT = sys.argv[1] if len(sys.argv) > 1 else "a"
setup()
S = load("sheets.json")
M = S["mul"]
H = M["history"]
CERT = load("certificate_e7.json")
BL = load("baselines.json")
REC = json.loads((DATA.parents[1] / "baselines" / "results.json").read_text())

L, SM = 7.0, 6.0         # the type scale: labels, small labels (print pt)
LIGHT_SLAB = "#D9E0EC"

fig = figure(200)
cv = canvas(fig)
R_ = fig.canvas.get_renderer()


def T(x, y, s, size=SM, color=INK, **kw):
    kw.setdefault("ha", "left")
    kw.setdefault("va", "center")
    return cv.text(x, y, s, fontsize=size, color=color, **kw)


def letter(_fig, x, y, s):
    cv.text(x, y, s, fontsize=8, fontweight="bold", color=INK, ha="left", va="top")


def text_w(s, size, **kw):
    t = cv.text(0, 0, s, fontsize=size, **kw)
    w = t.get_window_extent(R_).width / fig.dpi * 25.4
    t.remove()
    return w


# ---- the sheet, drawn as sheet-view.ts draws it (compact: a 6 px gap before a ruled row) ---------------------------
GAP = 6
check(M["product"] == M["expected"] == str(int(M["a"]) * int(M["b"])), "74,829 x 6,153 = 460,422,837")
check(len(H) == M["ticks_total"] == 56, "56 steps")
used = sorted({c for t in H for row in t["sheet"]["glyphs"] for c, g in enumerate(row) if g != " "}
              | {c for row in M["final"]["glyphs"] for c, g in enumerate(row) if g != " "})
C0, C1 = used[0], used[-1] + 1   # columns the run ever writes in; the runtime's spare left column stays off the figure
check((C0, C1) == (1, 11), "columns 1-10 in use")
glyph_rows = np.where((255 - sprites()).max(axis=1) > 40)[0]
INK_H = max(len([r for r in glyph_rows if k * CELL <= r < (k + 1) * CELL]) for k in range(3)) / CELL  # of a cell


def digit_pt(cs_mm):
    """the printed size of a sheet digit: its ink height as the cap height of a font (0.7 em)"""
    return cs_mm * INK_H / 0.7 / 25.4 * 72


def sheet_image(snap, just, color_old=ROSE_L):
    rows = snap["rows"]
    tops, y = [], 0
    for i, r in enumerate(rows):
        if r["rule"] and i > 0:
            y += GAP
        tops.append(y)
        y += CELL
    ncol = C1 - C0
    img = np.zeros((y, ncol * CELL, 4), dtype=np.float32)
    for r, row in enumerate(rows):
        for c in range(C0, C1):
            g = snap["glyphs"][r][c]
            if g == " ":
                continue
            if snap["wrote"][r][c]:
                col = ROSE if (r, c) in just else color_old
            else:
                col = INK
            a = (0.55 if row["dim"] else 1.0)
            gi = GLYPHS.index(g)
            al = (255.0 - sprites()[row["sprite"] * CELL:(row["sprite"] + 1) * CELL, gi * CELL:(gi + 1) * CELL]) / 255
            img[tops[r]:tops[r] + CELL, (c - C0) * CELL:(c - C0 + 1) * CELL, :3] = hex_rgb(col)
            img[tops[r]:tops[r] + CELL, (c - C0) * CELL:(c - C0 + 1) * CELL, 3] = al * a
    return img, tops, y


def draw_frame(snap, x0, y0, cs, window=(), just=(), labels=False, windows_numbered=None):
    s = cs / CELL
    img, tops, Hpx = sheet_image(snap, set(just))
    W = (C1 - C0) * cs
    pad = 0.9
    paper = FancyBboxPatch((x0 - pad, y0 - pad), W + 2 * pad, Hpx * s + 2 * pad,
                           boxstyle="round,pad=0,rounding_size=0.8", fc=TINT, ec="none", zorder=1)
    paper._text_ok = False
    cv.add_patch(paper)
    cv.imshow(img, extent=(x0, x0 + W, y0 + Hpx * s, y0), interpolation="nearest", zorder=2, resample=False)
    for i, r in enumerate(snap["rows"]):
        if r["rule"] and i > 0:
            yy = y0 + (tops[i] - GAP / 2) * s
            cv.plot([x0 - 0.5, x0 + W + 0.5], [yy, yy], color=MIST, lw=0.45, zorder=2, solid_capstyle="butt")
        if labels:
            T(x0 - pad - 1.2, y0 + (tops[i] + CELL / 2) * s, r["label"], SM, GREY if r["dim"] else SOFT, ha="right")
    boxes = []
    for (r, c) in window:
        bx, by = x0 + (c - C0) * cs, y0 + tops[r] * s
        cv.add_patch(FancyBboxPatch((bx + 0.12, by + 0.12), cs - 0.24, cs - 0.24,
                                    boxstyle=f"round,pad=0,rounding_size={cs * 0.14}", fc="none", ec=INK, lw=0.6,
                                    zorder=4))
        boxes.append((bx, by, cs))
    return {"x0": x0, "y0": y0, "W": W, "H": Hpx * s, "tops": [t * s for t in tops], "boxes": boxes, "pad": pad}


def window_of(t):
    return [(f["r"], f["c"]) for f in H[t]["sheet"]["fovea"] if f]


def just_of(t):
    """the cells the previous step wrote"""
    return [(st["r"], st["c"]) for st in H[t - 1]["stamps"]] if t > 0 else []


# ---- the run as a ribbon of its 56 steps ---------------------------------------------------------------------------
OPL = {"MUL": "M", "ADD": "A", "ADZ": "Z", "FLS": "F", "NXT": "N"}


def ribbon(x0, y0, w, marks):
    n = len(H)
    cw = w / n
    for k, t in enumerate(H):
        on = k in marks
        p = Rectangle((x0 + k * cw + 0.08, y0), cw - 0.16, 2.6, fc="#E9EDF4" if not on else "white",
                      ec=INK if on else "none", lw=0.5, zorder=2)
        p._text_ok = True
        cv.add_patch(p)
        T(x0 + (k + 0.5) * cw, y0 + 1.32, OPL[t["op"]], SM, INK if on else SOFT, ha="center", family="monospace")
    # the passes, one per digit of the multiplier
    passes = {}
    for k, t in enumerate(H):
        passes.setdefault(t["pass"], []).append(k)
    bdig = M["b"][::-1]
    for j, ks in passes.items():
        xa, xb = x0 + ks[0] * cw + 0.3, x0 + (ks[-1] + 1) * cw - 0.3
        cv.plot([xa, xb], [y0 + 3.5, y0 + 3.5], color=MIST, lw=0.5, solid_capstyle="butt")
        T((xa + xb) / 2, y0 + 5.0, f"× {bdig[j]}", SM, GREY, ha="center")
    check([len(v) for v in passes.values()] == [14, 14, 14, 14], "four passes of 14 steps")
    return cw


# ---- one step at token level ---------------------------------------------------------------------------------------
def draw_step(x0, y_top, x1, strip_left=True):
    t = H[32]
    check(t["view"] == ["8", "1", "0"] and t["answer"] == ["8", "0", "A"] and t["op"] == "MUL", "step 33: MUL 8, 1, 0")
    strip = np.asarray(M["strip"], dtype=float)
    check(strip.shape == (96, 32), "the 32 x 96 view")
    tokens = ["MUL", "img", "img", "img", "=", "?", "?"]
    bw, pitch = 6.4, 7.6
    tx0 = x1 - (6 * pitch + bw)
    xs = [tx0 + i * pitch + bw / 2 for i in range(7)]
    y_ans_lab, y_ans = y_top + 1.4, y_top + 5.2
    s_top, n_l, s_h, s_gap = y_top + 8.6, 24, 0.66, 0.26
    s_bot = s_top + n_l * (s_h + s_gap) - s_gap
    ty0 = s_bot + 1.6
    th = 3.6
    full = {3, 7, 11, 15, 19, 23}  # Qwen3.5: every fourth layer is full attention, the rest Gated DeltaNet
    for i, x in enumerate(xs):
        for l in range(n_l):
            yy = s_bot - (l + 1) * s_h - l * s_gap
            cv.add_patch(Rectangle((x - bw / 2, yy), bw, s_h, fc=SOFT if l in full else LIGHT_SLAB, ec="none",
                                   zorder=2))
        img = tokens[i] == "img"
        cv.add_patch(FancyBboxPatch((x - bw / 2, ty0), bw, th, boxstyle="round,pad=0,rounding_size=0.6",
                                    fc=TINT if img else "white", ec=INK, lw=0.5, zorder=3))
        T(x, ty0 + th / 2, tokens[i], SM, INK, ha="center", family="monospace" if not img else None,
          style="italic" if img else "normal")
    for i, (g, what) in zip((4, 5, 6), zip(t["answer"], ["digit", "carry", "next step"])):
        cv.plot([xs[i], xs[i]], [s_top - 0.5, y_ans + 1.9], color=ROSE, lw=0.7, zorder=2)
        T(xs[i], y_ans, g, 8.0, ROSE, ha="center", family="monospace", fontweight="bold")
        T(xs[i], y_ans_lab, what, SM, SOFT, ha="center")
    # what the stack is
    T(tx0 - 1.6, (s_top + s_bot) / 2 - 3.6, "24 layers", L, INK, ha="right")
    T(tx0 - 1.6, (s_top + s_bot) / 2 - 0.5, "the 6 dark ones:", SM, SOFT, ha="right")
    T(tx0 - 1.6, (s_top + s_bot) / 2 + 2.4, "full attention", SM, SOFT, ha="right")
    # the view and the encoder, under the prompt's left end
    sw, sh = 3.3, 9.9
    sx = x0
    sy = ty0 + th - sh
    cv.imshow(np.repeat(strip[..., None] / 255.0, 3, axis=2), extent=(sx, sx + sw, sy + sh, sy),
              interpolation="nearest", zorder=3, resample=False)
    for k in range(3):
        cv.add_patch(Rectangle((sx, sy + k * sh / 3), sw, sh / 3, fc="none", ec=MIST, lw=0.4, zorder=4))
    gx = sx + sw + 2.4
    ps = sw / 2
    for k in range(6):
        for c in range(2):
            cv.add_patch(Rectangle((gx + c * ps, sy + k * ps), ps, ps, fc="white", ec=GREY, lw=0.3, zorder=3))
    for k in range(3):
        cv.add_patch(FancyBboxPatch((gx, sy + 2 * k * ps), 2 * ps, 2 * ps, boxstyle="round,pad=0,rounding_size=0.35",
                                    fc="none", ec=INK, lw=0.55, zorder=4))
        yk = sy + (2 * k + 1) * ps
        cv.plot([sx + sw + 0.3, gx - 0.3], [yk, yk], color=SOFT, lw=0.4, zorder=2)
    # nested elbows, no crossings: the top group turns down farthest right and runs in the lane nearest the prompt
    gr = gx + 2 * ps
    for k in range(3):
        yk = sy + (2 * k + 1) * ps
        xd = gr + 1.2 + (2 - k) * 1.5
        lane = ty0 + th + 1.0 + 0.8 * k
        xe = xs[1 + k]
        r = 0.5
        verts = [(gr + 0.3, yk), (xd - r, yk), (xd, yk), (xd, yk + r), (xd, lane - r), (xd, lane), (xd + r, lane),
                 (xe - r, lane), (xe, lane), (xe, lane - r), (xe, ty0 + th)]
        codes = [Path.MOVETO, Path.LINETO, Path.CURVE3, Path.CURVE3, Path.LINETO, Path.CURVE3, Path.CURVE3,
                 Path.LINETO, Path.CURVE3, Path.CURVE3, Path.LINETO]
        cv.add_patch(PathPatch(Path(verts, codes), fc="none", ec=SOFT, lw=0.45, zorder=2))
    cap_y = ty0 + th + 4.6
    T(sx, cap_y, "the view, 32 × 96 px: three cells", SM, SOFT, va="top")
    T(sx, cap_y + 2.9, "the vision encoder: 16 px patches, merged 2 × 2", SM, SOFT, va="top")
    T(sx, cap_y + 5.8, "into three image tokens", SM, SOFT, va="top")
    T(tx0 + 0.0, y_top - 2.6, "one step: one forward pass of Qwen3.5-0.8B", L, INK, va="center")
    return {"strip": (sx, sy, sw, sh), "bottom": cap_y + 8.4, "xs": xs, "ty0": ty0, "y_ans": y_ans}


# =====================================================================================================================
# row 1: the mechanism
# =====================================================================================================================
TICKS = [30, 31, 32]
check([H[t]["op"] for t in TICKS] == ["MUL", "ADD", "MUL"], "steps 31-33: MUL, ADD, MUL")
for t in TICKS:
    for (r, c) in just_of(t):
        check(H[t]["sheet"]["wrote"][r][c] == 1, f"step {t + 1}: the rose digits were written by the model")
Y1 = 7.0
if VARIANT == "a":
    cs = 2.75
    check(digit_pt(cs) <= 9.0, f"sheet digits {digit_pt(cs):.1f} pt")
    fx0, fgap = 14.5, 2.2
    fw = (C1 - C0) * cs
    T(fx0 - 0.9, Y1 - 3.0, f"{int(M['a']):,} × {int(M['b']):,} on the sheet: three consecutive steps", L, INK)
    frames = []
    for i, t in enumerate(TICKS):
        x0 = fx0 + i * (fw + 2 * 0.9 + fgap)
        g = draw_frame(H[t]["sheet"], x0, Y1 + 1.0, cs, window=window_of(t), just=just_of(t), labels=(i == 0))
        frames.append(g)
        T(x0 + fw / 2, Y1 + 1.0 + g["H"] + 3.0, f"step {t + 1}: {H[t]['op']}", SM, INK, ha="center")
    fb = Y1 + 1.0 + frames[0]["H"]
    ry = fb + 7.5
    rx0 = fx0 - 0.9
    rw = frames[-1]["x0"] + fw + 0.9 - rx0
    cw = ribbon(rx0, ry, rw, set(TICKS))
    for g, t in zip(frames, TICKS):
        xm = g["x0"] + fw / 2
        xr = rx0 + (t + 0.5) * cw
        cv.plot([xm, xm, xr], [fb + 4.8, ry - 1.4, ry - 0.5], color=GREY, lw=0.35, zorder=1)
    T(rx0, ry + 8.8, "the whole product: 56 steps, one forward pass each, four passes of the multiplier's digits",
      SM, SOFT, va="center")
    T(rx0, ry + 11.7, "M multiply   A add   Z add the last carry   F flush   N next digit", SM, GREY, va="center")
    T(rx0, ry + 15.4, "Between steps the model keeps nothing: the sheet is its only memory.", L, INK, va="center")
    st = draw_step(110.0, Y1 + 1.0, 176.0)
    # step 33's caption to its view
    sx, sy, sw, sh = st["strip"]
    cx3 = frames[-1]["x0"] + fw / 2 + text_w(f"step 33: {H[32]['op']}", SM) / 2 + 0.6
    cy3 = Y1 + 1.0 + frames[-1]["H"] + 3.0
    cv.plot([cx3, sx - 2.4, sx - 2.4, sx - 0.4], [cy3, cy3, sy + 0.6, sy + 0.6], color=INK, lw=0.4, zorder=1,
            solid_joinstyle="round")
    ROW1_END = max(st["bottom"], ry + 17.0)
else:
    # before -> one forward pass -> after, on one line; the whole run as a ribbon underneath
    cs = 3.2
    check(digit_pt(cs) <= 9.0, f"sheet digits {digit_pt(cs):.1f} pt")
    t3 = TICKS[-1]
    fw = (C1 - C0) * cs
    fx0, fy0 = 14.5, Y1 + 3.0
    T(fx0 - 0.9, Y1 - 2.4, f"{int(M['a']):,} × {int(M['b']):,}: one step of 56", L, INK)
    gb = draw_frame(H[t3]["sheet"], fx0, fy0, cs, window=window_of(t3), just=just_of(t3), labels=True)
    T(fx0 + fw / 2, fy0 + gb["H"] + 3.2, f"before step {t3 + 1}: the window reads 8, 1, 0", SM, INK, ha="center")
    # the step, flowing left to right
    t = H[t3]
    check(t["view"] == ["8", "1", "0"] and t["answer"] == ["8", "0", "A"], "step 33 reads 8, 1, 0 and writes 8, 0, A")
    strip = np.asarray(M["strip"], dtype=float)
    sx, sw, sh = fx0 + fw + 9.0, 3.3, 9.9
    tokens = ["MUL", "img", "img", "img", "=", "?", "?"]
    tp, tbh, tbw = 3.25, 2.8, 7.0
    ty_top = fy0 - 0.4
    tys = [ty_top + i * tp + tbh / 2 for i in range(7)]
    sy = tys[1] - tbh / 2 - 0.0
    cv.imshow(np.repeat(strip[..., None] / 255.0, 3, axis=2), extent=(sx, sx + sw, sy + sh, sy),
              interpolation="nearest", zorder=3, resample=False)
    for k in range(3):
        cv.add_patch(Rectangle((sx, sy + k * sh / 3), sw, sh / 3, fc="none", ec=MIST, lw=0.4, zorder=4))
    gx, ps = sx + sw + 2.2, sw / 2
    for k in range(6):
        for c in range(2):
            cv.add_patch(Rectangle((gx + c * ps, sy + k * ps), ps, ps, fc="white", ec=GREY, lw=0.3, zorder=3))
    tx = gx + 2 * ps + 5.0
    for k in range(3):
        cv.add_patch(FancyBboxPatch((gx, sy + 2 * k * ps), 2 * ps, 2 * ps, boxstyle="round,pad=0,rounding_size=0.35",
                                    fc="none", ec=INK, lw=0.55, zorder=4))
        yk = sy + (2 * k + 1) * ps
        cv.plot([sx + sw + 0.3, gx - 0.3], [yk, yk], color=SOFT, lw=0.4, zorder=2)
        cv.plot([gx + 2 * ps + 0.3, tx - 0.3], [yk, tys[1 + k]], color=SOFT, lw=0.45, zorder=2)
    for i, (lab, yy) in enumerate(zip(tokens, tys)):
        img_ = lab == "img"
        cv.add_patch(FancyBboxPatch((tx, yy - tbh / 2), tbw, tbh, boxstyle="round,pad=0,rounding_size=0.5",
                                    fc=TINT if img_ else "white", ec=INK, lw=0.5, zorder=3))
        T(tx + tbw / 2, yy, lab, SM, INK, ha="center", family=None if img_ else "monospace",
          style="italic" if img_ else "normal")
    # 24 layers as thin vertical slabs across every token's row
    lx0, lsw, lgap = tx + tbw + 1.6, 0.62, 0.36
    full = {3, 7, 11, 15, 19, 23}
    for l in range(24):
        xx = lx0 + l * (lsw + lgap)
        cv.add_patch(Rectangle((xx, ty_top - 0.4), lsw, 7 * tp - (tp - tbh) + 0.8,
                               fc=SOFT if l in full else LIGHT_SLAB, ec="none", zorder=2))
    lx1 = lx0 + 24 * (lsw + lgap) - lgap
    T((lx0 + lx1) / 2, ty_top - 2.4, "24 layers, 6 with full attention (dark)", SM, SOFT, ha="center")
    ax0 = lx1 + 2.0
    for i, (g, what) in zip((4, 5, 6), zip(t["answer"], ["digit", "carry", "next step"])):
        cv.plot([lx1 + 0.3, ax0 - 0.3], [tys[i], tys[i]], color=ROSE, lw=0.7, zorder=2)
        T(ax0, tys[i], g, 8.0, ROSE, family="monospace", fontweight="bold")
        T(ax0 + 3.0, tys[i], what, SM, SOFT)
    T(sx, tys[-1] + 3.6, "one forward pass of Qwen3.5-0.8B: the view (32 × 96 px) in 16 px patches,", SM, SOFT)
    T(sx, tys[-1] + 6.5, "merged 2 × 2 into three image tokens; the answers are read at = and the two slots", SM,
      SOFT)
    # the window to its view, from the carry cell (nothing to its right on that row)
    bx, by, bc = max(gb["boxes"], key=lambda b: b[1])
    check(all(g_ == " " for g_ in H[t3]["sheet"]["glyphs"][2][C0:][int(round((bx - fx0) / cs)) + 1:]),
          "the carry row is empty right of the window")
    xe_ = fx0 + fw + 1.6
    cv.plot([bx + bc + 0.1, xe_, sx - 0.4], [by + bc / 2, by + bc / 2, sy + sh / 6], color=INK, lw=0.4, zorder=5,
            solid_joinstyle="round")
    # after: the runtime stamps the answers and moves the window
    nxt = t3 + 1
    ax_ = 178.0 - fw
    ga = draw_frame(H[nxt]["sheet"], ax_, fy0, cs, window=window_of(nxt), just=just_of(nxt), labels=False)
    T(ax_ + fw / 2, fy0 + ga["H"] + 3.2, f"after: the window on step {nxt + 1}", SM, INK, ha="center")
    # one thread: the answers are stamped into the sheet
    stamped = [(st["r"], st["c"]) for st in H[t3]["stamps"]]
    check(stamped == just_of(nxt), "the after sheet shows step 33's stamps in rose")
    pr = [rc for rc in stamped if rc[0] == 4][0]
    ye = fy0 + ga["tops"][4] + cs / 2
    x_from = ax0 + 3.0 + text_w("carry", SM) + 1.0
    ym = (tys[4] + tys[5]) / 2
    cv.plot([x_from, x_from + 1.2, x_from + 1.2, ax_ - 2.2, ax_ - 1.2], [tys[4], tys[4], ye, ye, ye], color=ROSE,
            lw=0.5, zorder=5, solid_joinstyle="round")
    cv.plot([x_from, x_from + 1.2], [tys[5], tys[5]], color=ROSE, lw=0.5, zorder=5)
    cv.plot([x_from + 1.2, x_from + 1.2], [tys[5], ye], color=ROSE, lw=0.5, zorder=5)
    T((x_from + ax_ - 2.2) / 2, ye - 1.9, "stamped by the runtime", SM, ROSE, ha="center")
    fb = fy0 + gb["H"] + 5.0
    ry = max(fb, tys[-1] + 8.5) + 3.2
    rx0 = fx0 - 0.9
    rw = 178.0 - rx0
    cw = ribbon(rx0, ry, rw, set(TICKS[-1:]))
    T(rx0, ry + 8.8, "the whole product: 56 steps, one forward pass each, four passes of the multiplier's digits;"
      "  M multiply   A add   Z add the last carry   F flush   N next digit", SM, SOFT)
    T(rx0, ry + 12.5, "Between steps the model keeps nothing: the sheet is its only memory.", L, INK)
    ROW1_END = ry + 14.5
letter(fig, 1.0, 2.0, "a")
if VARIANT == "a":
    letter(fig, 104.0, 2.0, "b")

# =====================================================================================================================
# row 2: the guarantee
# =====================================================================================================================
kinds = CERT["kinds"]
check(sum(k["rows"] for k in kinds.values()) == 2446 and all(k["rows"] == k["pass"] for k in kinds.values()),
      "2,446 of 2,446 views pass")
add_m, mul_m, calc_m = (np.array(kinds[k]["margins"]) for k in ("add", "mul", "calc"))
G = 11
tables = {"SUM": add_m, "MUL": mul_m[:1100], "ADD": mul_m[1100:1320], "ADZ": mul_m[1320:1540],
          "FLS": mul_m[1540:1542], "NXT": mul_m[1542:1553], "SUB": calc_m[:242], "EST": calc_m[242:642],
          "DEC": calc_m[642:651]}
cm = LinearSegmentedColormap.from_list("cert", [cmap_exact(x) for x in np.linspace(0, 0.86, 64)])
VMAX = 20.0
wi = int(add_m.argmin())
check(abs(add_m.min() - 3.016) < 1e-9 and wi == 73, "the weakest view: SUM row 73, margin 3.016")
check(S["weak"]["cells"] == [" ", "5", "6"] and S["weak"]["answer"] == ["b"], "SUM [ ,5,6] writes b (1, carry 1)")
Y2 = ROW1_END + 7.0
letter(fig, 1.0, Y2 - 3.0, "c")
T(16.0 - 0.9, Y2, "the guarantee: every view the runs can read, checked once", L, INK)

if VARIANT == "a":
    cell = 0.6
    mx0, my0 = 16.0, Y2 + 5.0
    blocks = {
        "SUM": add_m.reshape(2, G, G).transpose(2, 0, 1).reshape(G, 2 * G),
        "MUL": mul_m[:1100].reshape(G, 10, 10).transpose(2, 0, 1).reshape(10, 110),
        "ADD": mul_m[1100:1320].reshape(2, 10, G).transpose(2, 0, 1).reshape(G, 20),
        "ADZ": mul_m[1320:1540].reshape(2, 10, G).transpose(2, 0, 1).reshape(G, 20),
        "SUB": calc_m[:242].reshape(2, G, G).transpose(2, 0, 1).reshape(G, 2 * G),
        "EST": np.concatenate([calc_m[242:642][sum((d + 1) * 10 for d in range(5, dd)):
                                               sum((d + 1) * 10 for d in range(5, dd + 1))].reshape(dd + 1, 10).T
                               for dd in range(5, 10)], axis=1),
        "NXT": mul_m[1542:1553].reshape(1, G), "FLS": mul_m[1540:1542].reshape(1, 2),
        "DEC": calc_m[642:651].reshape(1, 9),
    }
    check(sum(b.size for b in blocks.values()) == 2446, "every view drawn once")
    lay = {"MUL": (0, 0), "SUM": (0, 1), "ADD": (25, 1), "ADZ": (48, 1), "SUB": (71, 1), "EST": (96, 1)}
    rowy = {0: my0, 1: my0 + 10 * cell + 4.2}
    pos = {}
    for name, (cx, r) in lay.items():
        b = blocks[name]
        X, Y = mx0 + cx * cell, rowy[r]
        cv.imshow(cm(np.clip(b / VMAX, 0, 1)), extent=(X, X + b.shape[1] * cell, Y + b.shape[0] * cell, Y),
                  interpolation="nearest", zorder=3, resample=False)
        T(X, Y - 1.5, f"{name} {b.size:,}", SM, SOFT)
        pos[name] = (X, Y)
    # the three one-row tables, stacked beside MUL
    sx0 = mx0 + 110 * cell + 9.5
    for k, name in enumerate(("NXT", "DEC", "FLS")):
        b = blocks[name]
        Y = my0 + 0.2 + k * 2.95
        cv.imshow(cm(np.clip(b / VMAX, 0, 1)), extent=(sx0, sx0 + b.shape[1] * cell, Y + cell, Y),
                  interpolation="nearest", zorder=3, resample=False)
        T(sx0 - 1.0, Y + cell / 2, f"{name} {b.size}", SM, SOFT, ha="right")
    for name, (X, Y) in pos.items():
        b = blocks[name]
        for i in range(1, b.shape[1]):
            cv.plot([X + i * cell] * 2, [Y, Y + b.shape[0] * cell], color="white", lw=0.1, zorder=4)
        for j in range(1, b.shape[0]):
            cv.plot([X, X + b.shape[1] * cell], [Y + j * cell] * 2, color="white", lw=0.1, zorder=4)
    ci, ti, bi = wi // (G * G), (wi // G) % G, wi % G
    wx, wy = pos["SUM"][0] + (ci * G + ti) * cell, pos["SUM"][1] + bi * cell
    MOS_RIGHT = mx0 + 136 * cell
    MOS_BOTTOM = rowy[1] + 11 * cell
else:
    # each table's views in order of margin, weakest first: one band per table
    mx0, my0, bw_, bh, bp = 30.0, Y2 + 7.5, 70.0, 1.9, 2.75
    order_t = ["MUL", "SUM", "ADD", "ADZ", "SUB", "EST", "NXT", "DEC", "FLS"]
    for k, name in enumerate(order_t):
        v = np.sort(tables[name])
        Y = my0 + k * bp
        cv.imshow(cm(np.clip(v / VMAX, 0, 1))[None, :, :], extent=(mx0, mx0 + bw_, Y + bh, Y), aspect="auto",
                  interpolation="nearest", zorder=3, resample=False)
        T(mx0 - 1.2, Y + bh / 2, f"{name} {len(v):,}", SM, SOFT, ha="right")
        T(mx0 + bw_ + 1.2, Y + bh / 2, f"{v.min():.2f}", SM, ROSE if name == "SUM" else INK)
    T(mx0 + bw_ + 1.2, my0 - 2.4, "lowest", SM, SOFT)
    T(mx0, my0 - 2.4, "each table's views in order of margin, weakest first", SM, SOFT)
    wx, wy, cell = mx0 - 0.0, my0 + 1 * bp, 0.0
    MOS_RIGHT = mx0 + bw_ + 9.0
    MOS_BOTTOM = my0 + len(order_t) * bp

# the weakest view, in its real pixels, and the ramp
cx = max(MOS_RIGHT + 8.0, 112.0)
sw, sh = 4.2, 12.6
sy0 = Y2 + 4.5
cv.imshow(np.repeat(np.asarray(S["weak"]["strip"], float)[..., None] / 255.0, 3, axis=2),
          extent=(cx, cx + sw, sy0 + sh, sy0), interpolation="nearest", zorder=3, resample=False)
for k in range(3):
    cv.add_patch(Rectangle((cx, sy0 + k * sh / 3), sw, sh / 3, fc="none", ec=MIST, lw=0.4, zorder=4))
if VARIANT == "a":
    cv.add_patch(Rectangle((wx - 0.2, wy - 0.2), cell + 0.4, cell + 0.4, fc="none", ec=INK, lw=0.55, zorder=6))
    yl = MOS_BOTTOM + 2.0
    cv.plot([wx + cell / 2, wx + cell / 2, cx - 2.0, cx - 0.4], [wy + cell + 0.2, yl, yl, sy0 + sh / 2], color=INK,
            lw=0.4, zorder=2)
else:
    cv.plot([MOS_RIGHT - 9.0 + 7.0, cx - 0.4], [wy + 1.0, sy0 + sh / 2], color=INK, lw=0.4, zorder=2)
tx = cx + sw + 2.2
T(tx, sy0 + 0.8, "the weakest of the 2,446 views", SM, INK, va="center")
T(tx, sy0 + 3.7, "SUM reads 5 and 6, no carry in;", SM, SOFT)
T(tx, sy0 + 6.6, "it writes b: 1, carry 1", SM, SOFT)
T(tx, sy0 + 9.8, f"margin {add_m.min():.2f} logits", L, ROSE)
# ramp
rx, ryy = tx, sy0 + 13.2
grad = cm(np.linspace(0, 1, 200))[None, :, :]
cv.imshow(grad, extent=(rx, rx + 24.0, ryy + 1.2, ryy), interpolation="bilinear", zorder=3)
for v in (0, 10, 20):
    xx = rx + v / VMAX * 24.0
    cv.plot([xx, xx], [ryy + 1.2, ryy + 1.8], color=INK, lw=0.4)
    T(xx, ryy + 3.3, f"{v}", SM, INK, ha="center")
T(rx + 26.0, ryy + 0.6, "margin", SM, SOFT)
Y2b = max(MOS_BOTTOM, ryy + 4.5) + 4.6
T(16.0 - 0.9, Y2b, r"exact on all 2,446 views  $\Rightarrow$  exact on every run of every length  (Theorem 1)",
  L, INK)
T(16.0 - 0.9, Y2b + 3.6, "2,446 of 2,446 pass on the M4 (WebGPU, fp16); every new GPU checks the weakest tenth "
  "again before it runs", SM, SOFT)
ROW2_END = Y2b + 5.0

# =====================================================================================================================
# row 3: the result
# =====================================================================================================================
Y3 = ROW2_END + 7.0
letter(fig, 1.0, Y3 - 3.0, "d")
by_name = {s_["name"]: s_ for s_ in BL["systems"]}
for s_ in BL["systems"]:
    sh_ = s_["shown"]
    if sh_ is None:
        continue
    rs = [r for r in REC if r["system"] == sh_["system"] and r.get("mode") == sh_["mode"]]
    check(sh_["n"] == len(rs) and sh_["exact"] == sum(bool(r["exact"]) for r in rs), f"{s_['name']}: total")
    for key in BL["hard"]:
        fam, n = key[:3], int(key[3:])
        c = [r for r in rs if r["family"] == fam and r["n"] == n]
        check(sh_["cells"][key] == [sum(bool(r["exact"]) for r in c), len(c)], f"{s_['name']}: {key}")
check(by_name["Sketchpad"]["shown"]["exact"] == by_name["Sketchpad"]["shown"]["n"] == 220, "Sketchpad 220/220")
others = [s_ for s_ in BL["systems"] if s_["name"] != "Sketchpad" and s_["shown"]]
strongest = max(others, key=lambda s_: s_["shown"]["exact"] / s_["shown"]["n"])["name"]


def pct(k, n):
    v = 100 * k / n
    return f"{v:.0f}" if abs(v - round(v)) < 1e-9 else f"{v:.1f}"


nx, bx0, bw = 16.0 - 0.9, 58.0, 62.0
hcols = [(138.0, "+ 1,000 digits", "add1000"), (160.0, "× 20 digits", "mul20")]
hw = 13.0
T(bx0, Y3, "exact on all 220 problems (%)", L, INK)
T(hcols[0][0], Y3, "the longest sums and products (%)", L, INK)
for x_, lab_, _ in hcols:
    T(x_, Y3 + 3.2, lab_, SM, SOFT)
GROUPS = [("ours", None), ("frontier", "frontier models"), ("open", "open models"), ("qwen", "Qwen3.5")]
pitch, y = 3.5, Y3 + 7.4
partial = False
first_y = y
for gname, glabel in GROUPS:
    members = [s_ for s_ in BL["systems"] if s_["group"] == gname]
    members.sort(key=lambda s_: -(s_["shown"]["exact"] / s_["shown"]["n"]) if s_["shown"] else 1)
    if glabel:
        y += 0.9
        T(nx, y, glabel, SM, GREY, style="italic")
        y += 3.3
    for s_ in members:
        sh_ = s_["shown"]
        ours = s_["name"] == "Sketchpad"
        col = ROSE if ours else (COBALT if s_["name"] == strongest else GREY)
        T(nx, y, s_["name"], L, INK, fontweight="bold" if ours else "normal")
        setting = "Qwen3.5-0.8B on the sheet" if ours else (sh_["setting"] if sh_ else "")
        if setting:
            T(nx + text_w(s_["name"], L, fontweight="bold" if ours else "normal") + 1.4, y + 0.1, setting, SM, GREY)
        if sh_ is None:
            T(bx0 + 1.0, y, "running", SM, MIST, style="italic")
            y += pitch
            continue
        k, n = sh_["exact"], sh_["n"]
        Lb = bw * k / n
        cv.add_patch(Rectangle((bx0, y - 1.1), Lb, 2.2, fc=col, ec="none", zorder=3))
        partial |= n != 220
        lab = pct(k, n) + ("" if n == 220 else "*")
        T(bx0 + Lb + 1.0, y, lab, SM if not ours else L, col, fontweight="bold" if ours else "normal")
        if ours:
            T(bx0 + Lb + 1.0 + text_w(lab, L, fontweight="bold") + 1.4, y, "certified", SM, ROSE)
        for x_, _, key in hcols:
            kk, nn = sh_["cells"][key]
            cv.add_patch(Rectangle((x_, y - 0.9), hw, 1.8, fc="#EEF1F6", ec="none", zorder=2))
            if kk:
                cv.add_patch(Rectangle((x_, y - 0.9), hw * kk / nn, 1.8, fc=col, ec="none", zorder=3))
            T(x_ + hw + 1.0, y, pct(kk, nn), SM, col if kk else GREY)
        y += pitch
cv.plot([bx0, bx0], [first_y - 1.8, y - pitch + 1.8], color=INK, lw=0.4, zorder=4)
if partial:
    T(nx, y + 0.4, "* so far 10 problems per length (110 of 220); the remaining runs are in progress", SM, GREY)
    y += 2.4
# the page ends where the ink ends
Hf = round(y + 2.5, 1)
fig.set_size_inches(180 / 25.4, Hf / 25.4)
fig._mm = (180.0, Hf)
cv.set_ylim(Hf, 0)
print(f"figure height {Hf} mm")

assert_clean(fig, allow=())
save(fig, f"fig1_v2{VARIANT}")
