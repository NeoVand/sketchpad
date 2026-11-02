"""Shared figure machinery: house style (Cobalt and Rose), millimetre layout, sheet drawing from the runtime's sprites,
and the two outputs (static/figures/figN.svg for the web page, paper/figures/out/figN.pdf at 180 mm).

Sheet drawing follows src/lib/sketchpad/sheet-view.ts: each sprite pixel is the ink colour at alpha 255 - grey (so
black ink on white gives back the training pixels), nearest-neighbour, operands in ink, what the model wrote in rose,
scratch rows at 0.45 ink, a 1 px rule in the middle of a 14 px gap before a ruled row, the fovea as a rounded outline.
"""
import json
import os
import tempfile
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

PREVIEW = pathlib.Path(os.environ.get("FIG_PREVIEW", os.path.join(tempfile.gettempdir(), "sketchpad-figs")))

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


# ---- layout checks --------------------------------------------------------------------------------------------------
def _segments(artist, fig):
    """line segments (display px) of a Line2D or a patch's outline"""
    import matplotlib.lines as mlines
    import matplotlib.patches as mpatches
    if isinstance(artist, mlines.Line2D):
        if not artist.get_visible() or artist.get_linestyle() in ("None", " ", "") or artist.get_linewidth() == 0:
            return []
        xy = artist.get_transform().transform(np.column_stack(artist.get_data()))
        return list(zip(xy[:-1], xy[1:]))
    if isinstance(artist, mpatches.Patch):
        if not artist.get_visible():
            return []
        ec = artist.get_edgecolor()
        has_edge = artist.get_linewidth() > 0 and ec is not None and ec[3] > 0
        has_fill = artist.get_fill() and artist.get_facecolor()[3] > 0
        if not (has_edge or has_fill):
            return []
        segs = []
        for poly in artist.get_path().to_polygons(transform=artist.get_transform(), closed_only=False):
            segs += list(zip(poly[:-1], poly[1:]))
        return segs
    return []


def _seg_hits_box(p, q, b):
    """does segment pq touch box b = (x0, y0, x1, y1)?"""
    x0, y0, x1, y1 = b
    if max(p[0], q[0]) < x0 or min(p[0], q[0]) > x1 or max(p[1], q[1]) < y0 or min(p[1], q[1]) > y1:
        return False
    inside = lambda r: x0 <= r[0] <= x1 and y0 <= r[1] <= y1
    if inside(p) or inside(q):
        return True
    d = (q[0] - p[0], q[1] - p[1])
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    side = [d[0] * (c[1] - p[1]) - d[1] * (c[0] - p[0]) for c in corners]
    return min(side) <= 0 <= max(side)


def assert_clean(fig, pad_mm=0.1, allow=()):
    """no text touches another text, a line, a patch edge or a filled patch, or an image; allow: pairs of text
    strings (or a single string) exempt from the check"""
    fig.canvas.draw()
    R = fig.canvas.get_renderer()
    px = pad_mm / 25.4 * fig.dpi
    texts = []
    for t in fig.findobj(matplotlib.text.Text):
        if not t.get_visible() or not t.get_text().strip() or t.get_alpha() == 0:
            continue
        bb = t.get_window_extent(R)
        if bb.width == 0:
            continue
        texts.append((t, (bb.x0 - px, bb.y0 - px, bb.x1 + px, bb.y1 + px)))
    problems = []
    fw_, fh_ = fig.bbox.width, fig.bbox.height
    edge = 0.8 / 25.4 * fig.dpi
    for t, b in texts:
        if b[0] < edge or b[1] < edge or b[2] > fw_ - edge or b[3] > fh_ - edge:
            problems.append(f"text {t.get_text()!r} touches the figure's edge")
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            a, b = texts[i][1], texts[j][1]
            if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                pair = (texts[i][0].get_text(), texts[j][0].get_text())
                if pair in allow or pair[::-1] in allow:
                    continue
                problems.append(f"text {pair[0]!r} touches text {pair[1]!r}")
    import matplotlib.lines as mlines
    import matplotlib.patches as mpatches
    import matplotlib.image as mimage
    shapes = [a for a in fig.findobj(lambda a: isinstance(a, (mlines.Line2D, mpatches.Patch)))
              if a.get_visible() and a is not fig.patch and not (a.axes is not None and a is a.axes.patch)]
    for t, b in texts:
        if t.get_text() in allow:
            continue
        for s in shapes:
            if getattr(s, "_text_ok", False):
                continue
            for p, q in _segments(s, fig):
                if _seg_hits_box(p, q, b):
                    problems.append(f"text {t.get_text()!r} touches a {type(s).__name__}")
                    break
        for im in fig.findobj(mimage.AxesImage):
            e = im.get_window_extent(R)
            if b[0] < e.x1 and e.x0 < b[2] and b[1] < e.y1 and e.y0 < b[3]:
                problems.append(f"text {t.get_text()!r} touches an image")
    if problems:
        raise AssertionError("layout:\n  " + "\n  ".join(sorted(set(problems))))
