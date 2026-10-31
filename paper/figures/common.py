"""Shared figure machinery: house style (Cobalt and Rose), millimetre layout, sheet drawing from the runtime's sprites,
and the two outputs (static/figures/figN.svg for the web page, paper/figures/out/figN.pdf at 180 mm).

Sheet drawing follows src/lib/sketchpad/sheet-view.ts: each sprite pixel is the ink colour at alpha 255 - grey (so
black ink on white gives back the training pixels), nearest-neighbour, operands in ink, what the model wrote in rose,
scratch rows at 0.45 ink, a 1 px rule in the middle of a 14 px gap before a ruled row, the fovea as a rounded outline.
"""
import json
import os
import pathlib
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.patches import FancyBboxPatch  # noqa: E402
from PIL import Image  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = HERE / "data"
PROGRAM = ROOT / "src" / "lib" / "sketchpad" / "program"
sys.path.insert(0, str(ROOT / "paper" / "figstyle"))
from palette import P, use, cmap_exact, cmap_density, cmap_div  # noqa: E402,F401

PREVIEW = pathlib.Path(os.environ.get(
    "FIG_PREVIEW",
    "/private/tmp/claude-501/-Users-neo-repos-polyformer/c0f48f9a-a2fb-4297-be2d-a48e0a64c3d9/scratchpad/figs"))

C = {k: v for k, v in P.items() if isinstance(v, str) and v.startswith("#")}
INK, SOFT, GREY, MIST, TINT = C["ink"], C["ink_soft"], C["blue_grey"], C["blue_mist"], C["tint"]
ROSE, ROSE_L, COBALT, COBALT_L, VIOLET = C["rose"], C["rose_light"], C["cobalt"], C["cobalt_light"], C["violet"]
MM = 1 / 25.4
WIDTH = 180.0

# sheet-view.ts constants
CELL = 32
RULE_GAP = 14
DIM_INK = 0.45
GLYPHS = " 0123456789"


def setup():
    use()
    matplotlib.rcParams.update({
        "mathtext.fontset": "cm",
        "svg.fonttype": "path",
        "pdf.fonttype": 42,
        "savefig.bbox": "standard",
        "savefig.pad_inches": 0,
        "axes.unicode_minus": True,
        "font.family": "sans-serif",
        "font.sans-serif": ["Helvetica Neue", "Helvetica", "Arial"],
        "svg.hashsalt": "sketchpad",
        "path.simplify": False,
    })


def load(name):
    return json.loads((DATA / name).read_text())


def figure(height_mm, width_mm=WIDTH):
    fig = plt.figure(figsize=(width_mm * MM, height_mm * MM))
    fig._mm = (width_mm, height_mm)
    return fig


def axes(fig, x, y, w, h, **kw):
    """an axes at (x, y) mm from the top-left corner, w x h mm"""
    W, H = fig._mm
    return fig.add_axes([x / W, 1 - (y + h) / H, w / W, h / H], **kw)


def canvas(fig):
    """a full-figure axes in millimetres, y downwards: for schematics, connectors and lettering"""
    W, H = fig._mm
    ax = fig.add_axes([0, 0, 1, 1], zorder=-5)
    ax.set_xlim(0, W)
    ax.set_ylim(H, 0)
    ax.axis("off")
    ax.patch.set_alpha(0)
    return ax


def letter(fig, x, y, s):
    W, H = fig._mm
    fig.text(x / W, 1 - y / H, s, fontsize=8, fontweight="bold", color=INK, va="top", ha="left")


def text(fig, x, y, s, **kw):
    W, H = fig._mm
    kw.setdefault("fontsize", 7)
    kw.setdefault("color", INK)
    return fig.text(x / W, 1 - y / H, s, **kw)


def clean(ax, left=True, bottom=True):
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.spines["left"].set_visible(left)
    ax.spines["bottom"].set_visible(bottom)
    if not left:
        ax.tick_params(left=False, labelleft=False)
    if not bottom:
        ax.tick_params(bottom=False, labelbottom=False)
    ax.tick_params(colors=INK, width=0.5, length=2.5, pad=1.5)
    for s in ax.spines.values():
        s.set_linewidth(0.5)
        s.set_color(INK)


def bare(ax):
    ax.axis("off")
    ax.patch.set_alpha(0)


def check(cond, what):
    """every label checked against the data"""
    if not cond:
        raise AssertionError(what)


def save(fig, name):
    (ROOT / "static" / "figures").mkdir(parents=True, exist_ok=True)
    (HERE / "out").mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    svg = ROOT / "static" / "figures" / f"{name}.svg"
    fig.savefig(svg, format="svg", metadata={"Date": None, "Creator": None})
    # the web copy scales to its column: width and height become a viewBox
    s = svg.read_text()
    import re
    m = re.search(r'<svg[^>]*?width="([\d.]+)pt" height="([\d.]+)pt"', s)
    if m:
        s = s.replace(f'width="{m.group(1)}pt" height="{m.group(2)}pt"',
                      f'width="100%" preserveAspectRatio="xMidYMin meet"', 1)
    svg.write_text(s)
    fig.savefig(HERE / "out" / f"{name}.pdf", format="pdf", metadata={"CreationDate": None, "Creator": None})
    fig.savefig(PREVIEW / f"{name}.png", format="png", dpi=300)
    print("wrote", svg.relative_to(ROOT), (HERE / "out" / f"{name}.pdf").relative_to(ROOT))


# ---- the sheet ------------------------------------------------------------------------------------------------------

_SPRITES = None


def sprites():
    """static/sketchpad/sprites.png as grey levels, 96 x 352 (rows: strip positions 0-2; columns: ' 0123456789')"""
    global _SPRITES
    if _SPRITES is None:
        _SPRITES = np.asarray(Image.open(ROOT / "static" / "sketchpad" / "sprites.png").convert("L"), dtype=np.float32)
    return _SPRITES


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


def glyph_alpha(g, sprite_row):
    """a glyph as the ink sheet holds it: alpha = (255 - grey) / 255"""
    gi = GLYPHS.index(g)
    s = sprites()[sprite_row * CELL:(sprite_row + 1) * CELL, gi * CELL:(gi + 1) * CELL]
    return (255.0 - s) / 255.0


def row_tops(rows, cell=CELL, gap=RULE_GAP):
    ys, y = [], 0
    for i, r in enumerate(rows):
        if r["rule"] and i > 0:
            y += gap
        ys.append(y)
        y += cell
    return ys, y


def sheet_rgba(snap, ink=INK, wrote=ROSE, extra=None, cols=None):
    """the sheet's glyphs as an RGBA image (transparent paper), 32 px per cell. extra: {(r, c): (glyph, colour, alpha)}"""
    rows = snap["rows"]
    ncol = snap["cols"] if cols is None else cols
    ys, H = row_tops(rows)
    img = np.zeros((H, ncol * CELL, 4), dtype=np.float32)
    for r, row in enumerate(rows):
        for c in range(ncol):
            g = snap["glyphs"][r][c]
            col, a = None, 1.0
            if extra and (r, c) in extra:
                g, col, a = extra[(r, c)]
            if g == " " or g not in GLYPHS:
                continue
            if col is None:
                col = wrote if snap["wrote"][r][c] else ink
            a *= DIM_INK if row["dim"] else 1.0
            al = glyph_alpha(g, row["sprite"]) * a
            y0, x0 = ys[r], c * CELL
            img[y0:y0 + CELL, x0:x0 + CELL, :3] = hex_rgb(col)
            img[y0:y0 + CELL, x0:x0 + CELL, 3] = al
    return img, ys, H


def draw_sheet(ax, snap, x0=0.0, y0=0.0, scale=1.0, labels=True, label_size=5.5, extra=None, paper=True,
               fovea=True, fovea_color=INK, cols=None, pad=10, label_gap=6, rule_color=MIST, zorder=1):
    """draw a sheet into ax, whose data units are sheet pixels (y downwards); returns geometry"""
    img, ys, H = sheet_rgba(snap, extra=extra, cols=cols)
    ncol = snap["cols"] if cols is None else cols
    Wpx = ncol * CELL
    s = scale
    if paper:
        ax.add_patch(FancyBboxPatch((x0 - pad * s, y0 - pad * s), Wpx * s + 2 * pad * s, H * s + 2 * pad * s,
                                    boxstyle=f"round,pad=0,rounding_size={6 * s}", fc=TINT, ec="none",
                                    zorder=zorder))
    ax.imshow(img, extent=(x0, x0 + Wpx * s, y0 + H * s, y0), interpolation="nearest", zorder=zorder + 1,
              resample=False)
    for i, r in enumerate(snap["rows"]):
        if r["rule"] and i > 0:
            yy = y0 + (ys[i] - RULE_GAP / 2) * s
            ax.plot([x0 - 4 * s, x0 + Wpx * s + 4 * s], [yy, yy], color=rule_color, lw=0.6, zorder=zorder + 1,
                    solid_capstyle="butt")
        if labels:
            ax.text(x0 - (pad + label_gap) * s, y0 + (ys[i] + CELL / 2) * s, r["label"], ha="right", va="center",
                    fontsize=label_size, color=GREY if r["dim"] else SOFT)
    for p in snap.get("points", []):
        ax.add_patch(matplotlib.patches.Circle((x0 + (p["c"] + 1) * CELL * s, y0 + (ys[p["r"]] + CELL * 0.8) * s),
                                               max(1.4, CELL * 0.065) * s, fc=INK, ec="none", zorder=zorder + 2))
    if fovea:
        for f in snap["fovea"]:
            if f is None:
                continue
            fovea_box(ax, x0 + f["c"] * CELL * s, y0 + ys[f["r"]] * s, CELL * s, color=fovea_color, zorder=zorder + 3)
    return {"ys": ys, "H": H, "W": Wpx, "x0": x0, "y0": y0, "s": s}


def fovea_box(ax, x, y, size, color=INK, lw=0.9, zorder=5, inset=1.25 / 32):
    i = size * inset
    ax.add_patch(FancyBboxPatch((x + i, y + i), size - 2 * i, size - 2 * i,
                                boxstyle=f"round,pad=0,rounding_size={size * 4 / 32}", fc="none", ec=color, lw=lw,
                                zorder=zorder))


def strip_image(strip, color=INK):
    """a 96 x 32 strip of grey levels (the model's input) as RGBA in ink: the training pixels, black on white"""
    g = np.asarray(strip, dtype=np.float32)
    rgba = np.ones((g.shape[0], g.shape[1], 4), dtype=np.float32)
    rgba[..., :3] = g[..., None] / 255.0
    return rgba
