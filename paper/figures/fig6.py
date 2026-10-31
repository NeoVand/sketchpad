"""Figure 6. Inside the model.

a  the logit lens (final norm and output head applied to each layer's state at the place that writes the first answer
   token): the share of views whose top guess is already the final answer, per table and layer, all 1,795 views of the
   E7 adder and multiplier tables (data/atlas_arithmetic-e7.json; inside_atlas.py)
b  the state that writes the answer, on the page's 3D map (data/inside_e7.json = HF 2df87172 arithmetic/inside.json):
   every view of the add table and of the multiplier's MUL step, coloured by the answer it writes
c  the push: adding the class-mean difference at the answer place, at each layer, and the share of steps whose answer
   moves to the target (data/steer.json: the E5 union adapter, layer sweep; data/steer_digit.json: E7 at layer 20, the
   page's push, 79/80 and 80/80)
"""
import numpy as np
from matplotlib.colors import LinearSegmentedColormap

from common import (COBALT, GREY, INK, MIST, ROSE, ROSE_L, SOFT, TINT, VIOLET, axes, canvas, check, clean, figure,
                    letter, load, save, setup, cmap_exact)

setup()
ATLAS = load("atlas_arithmetic-e7.json")
INSIDE = load("inside_e7.json")
STEER = load("steer.json")
STEER7 = load("steer_digit.json")

fig = figure(64)
cv = canvas(fig)
FULL = [4, 8, 12, 16, 20, 24]  # states after a full-attention layer (0-based layers 3, 7, ..., 23)

# ---- a: the logit lens --------------------------------------------------------------------------------------------
rows = ATLAS["rows"]
check(len(rows) == 1795 and ATLAS["layers"] == 24, "1,795 views, 24 layers")
tables = ["SUM", "MUL", "ADD", "ADZ", "FLS", "NXT"]
share = np.zeros((len(tables), 25))
med = {}
for i, t in enumerate(tables):
    rs = [r for r in rows if r["op"] == t]
    for l in range(25):
        share[i, l] = np.mean([r["top_by_layer"][l] == r["ans"][0] for r in rs])
    med[t] = float(np.median([r["decides_at"] for r in rs]))
    check(share[i, 24] == 1.0, f"{t}: the last layer's top guess is the answer")
check(med["SUM"] == 19 and med["MUL"] == 20 and med["ADD"] == 18, "median decision layers 19, 20, 18")
ax = axes(fig, 13.0, 12.0, 46.0, 30.0)
cm = LinearSegmentedColormap.from_list("lens", [cmap_exact(x) for x in np.linspace(0, 0.8, 64)])
ax.imshow(share, cmap=cm, vmin=0, vmax=1, aspect="auto", interpolation="nearest", extent=(-0.5, 24.5, 5.5, -0.5))
for i in range(1, len(tables)):
    ax.axhline(i - 0.5, color="white", lw=0.8)
for i, t in enumerate(tables):
    if t not in ("NXT", "FLS"):
        ax.plot([med[t]], [i], marker="|", ms=5, mew=0.9, color=INK)
ax.set_yticks(range(len(tables)))
ax.set_yticklabels(tables, fontsize=5.2)
ax.set_xticks([0, 4, 8, 12, 16, 20, 24])
ax.set_xlabel("layer", labelpad=1.5)
for s in ax.spines.values():
    s.set_visible(False)
ax.tick_params(length=0, pad=1.5)
for l in FULL:
    ax.plot([l], [-0.85], marker="v", ms=2.4, color=SOFT, clip_on=False, lw=0)
ax.set_ylim(5.5, -0.5)
ax.text(-0.5, -1.5, "▾ after a full-attention layer;  | median layer where the answer leads for good", fontsize=4.6,
        color=SOFT, ha="left", va="bottom") if False else None
cv.text(13.0, 7.6, "after a full-attention layer", fontsize=4.6, color=SOFT, ha="left", va="center")
cv.plot([11.3], [7.6], marker="v", ms=2.4, color=SOFT)
# the ramp
rx, ry = 13.0, 49.0
grad = cm(np.linspace(0, 1, 100))[None, :, :]
cv.imshow(grad, extent=(rx + 20, rx + 40, ry + 1.2, ry), interpolation="bilinear")
cv.text(rx + 19, ry + 0.6, "share whose top guess is the answer", fontsize=4.6, color=SOFT, ha="right", va="center")
cv.text(rx + 20, ry + 1.6, "0", fontsize=4.6, color=INK, ha="center", va="top")
cv.text(rx + 40, ry + 1.6, "1", fontsize=4.6, color=INK, ha="center", va="top")
cv.text(rx, ry + 5.0, "| median layer at which the answer leads for good", fontsize=4.6, color=SOFT, ha="left",
        va="center")
check(share[tables.index("NXT")].min() == 1.0, "NXT's first token is decided from the start")
cv.text(rx, ry + 8.0, "NXT's first token is always the unused “–”", fontsize=4.6, color=SOFT, ha="left",
        va="center")
letter(fig, 1.0, 3.0, "a")

# ---- b: the state that writes the answer --------------------------------------------------------------------------
ramp = LinearSegmentedColormap.from_list("value", [COBALT, VIOLET, ROSE])


def value(lab):
    if lab == "H":
        return None
    return int(lab) if lab.isdigit() else 10 + "abcdefghij".index(lab)


def cloud(x, y, w, h, fam, title, nval, elev, azim):
    F = INSIDE["families"][fam]
    P = np.asarray(F["cloud"], dtype=float)
    labs = F["cloudLabels"]
    check(len(P) == len(labs) == {"SUM": 242, "MUL": 1100}[fam], f"{fam} cloud size")
    a = axes(fig, x, y, w, h, projection="3d")
    a.set_proj_type("ortho")
    # look along the cloud's thinnest direction, so the screen shows its two widest
    Q = P - P.mean(0)
    _, _, Vt = np.linalg.svd(Q, full_matrices=False)
    v = Vt[2] * np.sign(Vt[2][2] if Vt[2][2] != 0 else 1)
    el = np.degrees(np.arcsin(np.clip(v[2], -1, 1)))
    az = np.degrees(np.arctan2(v[1], v[0]))
    a.view_init(elev=el + elev, azim=az + azim)
    for axis in (a.xaxis, a.yaxis, a.zaxis):
        axis.set_pane_color((1, 1, 1, 0))
        axis.line.set_color((1, 1, 1, 0))
    a.grid(False)
    a.set_axis_off()
    a.set_facecolor("none")
    a.patch.set_alpha(0)
    vals = [value(l) for l in labs]
    from matplotlib.colors import to_rgba
    col = np.array([to_rgba(INK) if v is None else ramp(v / (nval - 1)) for v in vals])
    a.scatter(P[:, 0], P[:, 1], P[:, 2], s=1.4, c=col, lw=0, alpha=0.85, depthshade=False)
    cen = {k: np.asarray(v, float) for k, v in F["labels"].items()}
    # the class centres in order of value, threaded
    order = sorted([k for k in cen if value(k) is not None], key=value)
    C = np.array([cen[k] for k in order])
    mid = P.mean(0)
    for k in cen:
        v = value(k)
        name = "H" if v is None else str(v)
        d = cen[k] - mid
        d = d / (np.linalg.norm(d) + 1e-9)
        p = cen[k] + d * 0.09 * np.ptp(P, axis=0).max()
        a.text(p[0], p[1], p[2], name, fontsize=4.4, color=INK if v is None else ramp(v / (nval - 1)),
               ha="center", va="center")
    lo, hi = P.min(0), P.max(0)
    c, r = (lo + hi) / 2, (hi - lo).max() / 2
    a.set_xlim(c[0] - r, c[0] + r)
    a.set_ylim(c[1] - r, c[1] + r)
    a.set_zlim(c[2] - r, c[2] + r)
    a.set_box_aspect((1, 1, 1))
    sep = F["separation"]
    keys = list(cen)
    M = np.array([cen[k] for k in keys])
    near = np.mean([keys[int(np.argmin(((M - p) ** 2).sum(1)))] == l for p, l in zip(P, labs)])
    check(abs(near - sep) < 6e-4, f"{fam}: the nearest centre is the answer for {sep:.1%}")
    return a, sep, P, vals


def screen_mm(a, P):
    """where 3D points land on the page, in mm from the top-left"""
    from mpl_toolkits.mplot3d import proj3d
    fig.canvas.draw()
    x2, y2, _ = proj3d.proj_transform(P[:, 0], P[:, 1], P[:, 2], a.get_proj())
    d = a.transData.transform(np.c_[x2, y2])
    W, H = fig._mm
    return d[:, 0] / fig.dpi * 25.4, H - d[:, 1] / fig.dpi * 25.4


a1, sep_sum, P1, v1 = cloud(63.0, 12.0, 42.0, 40.0, "SUM", "", 20, 0, 0)
a2, sep_mul, P2, v2 = cloud(104.0, 12.0, 38.0, 40.0, "MUL", "", 10, 0, 0)
check(abs(sep_sum - 0.955) < 1e-9 and abs(sep_mul - 0.985) < 1e-9, "nearest-centre shares 95.5% and 98.5%")
cv.text(70.0, 8.0, "add table: the sum it writes, 0 to 19", fontsize=5.5, color=INK, ha="left", va="center")
cv.text(108.0, 8.0, "multiplier: the digit it writes", fontsize=5.5, color=INK, ha="left", va="center")
cv.text(70.0, 53.0, f"nearest centre is the answer\nfor {sep_sum:.1%} of views".replace(".5%", ".5%"),
        fontsize=4.8, color=SOFT, ha="left", va="top", linespacing=1.1)
cv.text(108.0, 53.0, f"nearest centre is the answer\nfor {sep_mul:.1%} of views", fontsize=4.8, color=SOFT,
        ha="left", va="top", linespacing=1.1)
# the carry splits the add table's states: sums 0-9 on one side, 10-19 on the other
xs, ys = screen_mm(a1, P1)
v1a = np.array([-1 if v is None else v for v in v1])
lo_, hi_ = (v1a >= 0) & (v1a <= 9), v1a >= 10
check(xs[lo_].min() > xs[hi_].max() or xs[hi_].min() > xs[lo_].max(), "sums with and without a carry apart")
for m_, lab in ((lo_, "0 to 9:\nno carry"), (hi_, "10 to 19:\na carry")):
    cv.text(np.median(xs[m_]), ys[m_].min() - 2.4, lab.replace("\n", " "), fontsize=4.8, color=SOFT,
            ha="center", va="bottom")
letter(fig, 62.0, 3.0, "b")

# ---- c: the push ---------------------------------------------------------------------------------------------------
ax = axes(fig, 150.0, 12.0, 27.0, 34.0)
clean(ax)
L = [4, 8, 12, 14, 16, 18, 20, 22]
s_sum = [STEER[f"SUM@{l}"] for l in L]
s_mul = [STEER[f"MUL@{l}"] for l in L]
check(abs(STEER["SUM@20"] - 75 / 80) < 1e-9 and max(s_mul) == 23 / 80, "E5: SUM 75/80 at 20, MUL at most 23/80")
check(abs(STEER7["SUM@20"] - 79 / 80) < 1e-9 and STEER7["MUL@20"] == 1.0, "E7 at layer 20: 79/80 and 80/80")
ax.axvline(19.5, color=VIOLET, lw=0.6, ls=(0, (1, 1.5)), zorder=0)
ax.plot(L, s_sum, color=ROSE_L, lw=0.9, marker="o", ms=1.8, zorder=2)
ax.plot(L, s_mul, color=ROSE_L, lw=0.9, ls=(0, (3, 1.5)), marker="o", ms=1.8, zorder=2)
ax.scatter([20, 20], [STEER7["SUM@20"], STEER7["MUL@20"]], s=12, color=ROSE, lw=0, zorder=4)
ax.set_xlim(3, 23)
ax.set_ylim(-0.03, 1.05)
ax.set_xticks([4, 12, 20])
ax.set_yticks([0, 0.5, 1])
ax.set_yticklabels(["0", "0.5", "1"])
ax.set_xlabel("layer of the push", labelpad=1.5)
ax.set_ylabel("share of steps moved", labelpad=1.5)
ax.text(13.0, 0.62, "E5 add", fontsize=4.8, color=ROSE_L, ha="center", va="center")
ax.text(13.0, 0.24, "E5 multiply", fontsize=4.8, color=ROSE_L, ha="center", va="center")
ax.text(19.0, 0.97, "E7", fontsize=5, color=ROSE, ha="right", va="center")
ax.text(19.3, 0.40, "layer 19:\nfull\nattention", fontsize=4.4, color=VIOLET, ha="right", va="center",
        linespacing=1.0)
letter(fig, 141.0, 3.0, "c")

save(fig, "fig6")
