"""Figure 4. Algebra as written.

a  the textbook derivation of x^3 - 6x^2 + 11x - 6 = (x - 1)(x - 2)(x - 3), line by line as the program writes it
   (data/algebra.json, from algebra.ts: the program run on the sheet calculator with the reference tables). Every rose
   number is a value the sheet computed; beside the line where it first appears, the sheet it was computed on (the
   runtime's own layout and the training sprites), threaded to the line.
b  refusals under planted faults (src/lib/sketchpad/program/round3-{path}-{mode}.json): wrong roots offered, and one
   corrupted arithmetic call; light and strong checks give the same counts
c  seconds per work order, textbook against evaluation, from the M4 cost model (0.065 s a pass + 0.037 s a view; the
   same round-3 files). Times measured on the M4 for these orders are not yet recorded.
"""
import json
import re

import numpy as np
from matplotlib.path import Path
from matplotlib.patches import PathPatch

from common import (CELL, COBALT, COBALT_L, GREY, INK, MIST, PROGRAM, ROSE, ROSE_L, SOFT, TINT, VIOLET, axes, canvas,
                    check, clean, draw_sheet, figure, letter, load, save, setup)

setup()
A = load("algebra.json")
check(A["source"] == "factor x^3-6x^2+11x-6" and A["path"] == "textbook", "the factoring, textbook path")

fig = figure(116)
cv = canvas(fig)
R = fig.canvas.get_renderer()
SIZE = 7.0
_w = {}


def width(s, size, family="cm"):
    """width in mm of a text (mathtext if it is $...$)"""
    key = (s, size, family)
    if key not in _w:
        kw = {"fontsize": size}
        if family == "dejavu":
            kw["family"] = "DejaVu Sans"
        t = cv.text(0, 0, s, **kw)
        bb = t.get_window_extent(R)
        t.remove()
        _w[key] = bb.width / fig.dpi * 25.4
    return _w[key]


# ---- a TeX subset, as the program writes it ------------------------------------------------------------------------
def group(s, i):
    """the {...} group starting at s[i] == '{': (content, index after)"""
    assert s[i] == "{", s[i:]
    depth = 0
    for j in range(i, len(s)):
        depth += s[j] == "{"
        depth -= s[j] == "}"
        if depth == 0:
            return s[i + 1:j], j + 1
    raise ValueError(s)


def tokens(s):
    out, i, buf = [], 0, ""

    def flush():
        nonlocal buf
        if buf:
            out.append(("m", buf))
            buf = ""

    while i < len(s):
        if s.startswith(r"\htmlId", i):
            ident, i = group(s, i + 7)
            val, i = group(s, i)
            flush()
            out.append(("num", ident, val))
        elif s.startswith(r"\text", i):
            t, i = group(s, i + 5)
            flush()
            out.append(("text", t))
        elif s.startswith(r"\frac", i):
            a, i = group(s, i + 5)
            b, i = group(s, i)
            flush()
            out.append(("frac", tokens(a), tokens(b)))
        elif s.startswith(r"\sqrt", i):
            a, i = group(s, i + 5)
            flush()
            out.append(("sqrt", tokens(a)))
        elif s.startswith(r"\left(", i):
            buf += "("
            i += 6
        elif s.startswith(r"\right)", i):
            buf += ")"
            i += 7
        elif s.startswith(r"\quad", i):
            flush()
            out.append(("space", 3.0))
            i += 5
        elif s.startswith(r"\;", i):
            flush()
            out.append(("space", 0.9))
            i += 2
        elif s.startswith(r"\checkmark", i):
            flush()
            out.append(("check",))
            i += 10
        elif s[i] == "^":
            a, i = group(s, i + 1)
            if buf and "htmlId" not in a:
                buf += "^{" + a + "}"
            else:
                flush()
                out.append(("sup", a))
        else:
            buf += s[i]
            i += 1
    flush()
    return out


REL, BIN = ("=",), ("+", "-", r"\cdot")


def chunk_tex(m):
    return "$" + m.strip() + "$"


def items(toks, size):
    """(kind, payload, width, pre-gap) for each token, with the operator spacing a split chunk loses"""
    res = []
    for k, t in enumerate(toks):
        kind = t[0]
        if kind == "m":
            m = t[1]
            if not m.strip():
                res.append(("gap", None, 0.45, 0))
                continue
            st = m.strip()
            ops = ("=", "+", "-", r"\cdot")
            tex = st
            operand_before = res and (res[-1][0] in ("num", "sup", "frac", "sqrt")
                                      or (res[-1][0] == "m" and re.search(r"[\w)}]$", res[-1][1])))
            if operand_before and st.startswith(ops):
                tex = "{}" + tex
            if k + 1 < len(toks) and st.endswith(ops):
                tex = tex + "{}"
            res.append(("m", tex, width(chunk_tex(tex), size), 0.0))
        elif kind == "num":
            res.append(("num", t, width("$" + t[2] + "$", size), 0))
        elif kind == "text":
            res.append(("text", t[1], width(t[1], size * 0.86, "sans"), 0))
        elif kind == "space":
            res.append(("gap", None, t[1], 0))
        elif kind == "check":
            res.append(("check", None, width("✓", size, "dejavu") + 0.6, 0.6))
        elif kind == "sup":
            res.append(("sup", t[1], width("${}^{" + t[1] + "}$", size), 0))
        elif kind == "frac":
            wn = measure(t[1], size * 0.92)
            wd = measure(t[2], size * 0.92)
            res.append(("frac", t, max(wn, wd) + 0.8, 0.3))
        elif kind == "sqrt":
            res.append(("sqrt", t, measure(t[1], size) + 2.3, 0.2))
    return res


def measure(toks, size):
    return sum(w + pre for _, _, w, pre in items(toks, size))


NUMS = []  # (call, x, y): where each rose number sits


def draw(toks, x, y, size, color=INK):
    for kind, p, w, pre in items(toks, size):
        x += pre
        if kind == "m":
            cv.text(x, y, chunk_tex(p), fontsize=size, color=color, ha="left", va="baseline")
        elif kind == "num":
            cv.text(x, y, "$" + p[2] + "$", fontsize=size, color=ROSE, ha="left", va="baseline")
            NUMS.append((p, x, y, w))
        elif kind == "text":
            cv.text(x, y, p, fontsize=size * 0.86, color=SOFT, ha="left", va="baseline")
        elif kind == "check":
            cv.text(x + 0.6, y, "✓", fontsize=size, color=INK, ha="left", va="baseline", family="DejaVu Sans")
        elif kind == "sup":
            cv.text(x, y, "${}^{" + p + "}$", fontsize=size, color=color, ha="left", va="baseline")
        elif kind == "frac":
            s2 = size * 0.92
            wn, wd = measure(p[1], s2), measure(p[2], s2)
            axis = y - 0.62
            cv.plot([x + 0.2, x + w - 0.2], [axis, axis], color=INK, lw=0.45, solid_capstyle="butt")
            draw(p[1], x + (w - wn) / 2, axis - 0.75, s2)
            draw(p[2], x + (w - wd) / 2, axis + 2.55, s2)
        elif kind == "sqrt":
            h = 2.75
            verts = [(x, y - 1.05), (x + 0.45, y - 1.35), (x + 1.05, y + 0.45), (x + 1.75, y - h),
                     (x + w - 0.1, y - h)]
            cv.add_patch(PathPatch(Path(verts), fc="none", ec=INK, lw=0.5, joinstyle="miter", capstyle="butt"))
            draw(p[1], x + 2.0, y, size)
        x += w
    return x


def draw_array(tex, x, y, size):
    m = re.match(r"\\begin\{array\}\{([^}]*)\}(.*)\\end\{array\}$", tex)
    spec, body = m.group(1), m.group(2)
    ncol = spec.count("r")
    rows = body.split(r"\\")
    colw, pitch = 6.0, 3.9
    yy = y
    ends = []
    for k, row in enumerate(rows):
        hline = row.startswith(r"\hline")
        row = row.replace(r"\hline", "")
        if hline:
            cv.plot([x + colw + 0.6, x + ncol * colw + 0.4], [yy - 3.1, yy - 3.1], color=INK, lw=0.45)
        cells = row.split("&")
        check(len(cells) == ncol, "array row width")
        for c, cell in enumerate(cells):
            toks = tokens(cell.strip())
            if not toks:
                continue
            w = measure(toks, size)
            right = x + (c + 1) * colw - (0.9 if c == 0 else 0)
            draw(toks, right - w, yy, size)
        ends.append(yy)
        yy += pitch
    cv.plot([x + colw + 0.3, x + colw + 0.3], [y - 3.0, yy - pitch + 1.0], color=INK, lw=0.45)
    return x + ncol * colw, y, yy - pitch


# ---- a: the derivation and its sheets ------------------------------------------------------------------------------
lines = A["lines"]
check(len(lines) == 15, "fifteen lines")
tex_result = lines[-1]["tex"]
check(re.sub(r"\\htmlId\{[^}]*\}\{([^}]*)\}", r"\1", tex_result)
      == r"x^{3} - 6x^{2} + 11x - 6 = \left(x - 1\right)\left(x - 2\right)\left(x - 3\right)", "the factorisation")
for l in lines:
    for n in l["numbers"]:
        tr = A["trace"][n["call"]]["result"]
        v = tr if isinstance(tr, str) else tr[n["field"]]
        check(int(v) == int(n["value"]) and abs(int(n["displayed"])) == abs(int(v)), f"number {n['id']} from its call")

X0, Y = 22.0, 13.0
line_y, line_end, line_box = [], [], []
seen = set()
for i, l in enumerate(lines):
    tex = l["tex"]
    if tex.startswith(r"\begin{array}"):
        Y += 0.6
        end, top, bottom = draw_array(tex, X0, Y, SIZE)
        line_y.append((Y + bottom) / 2 - 1.0)
        line_end.append(end)
        line_box.append((top - 3.2, bottom + 1.2))
        Y = bottom + 5.1
    else:
        toks = tokens(tex)
        tall = any(t[0] == "frac" for t in toks)
        if tall:
            Y += 1.3
        end = draw(toks, X0, Y, SIZE)
        line_y.append(Y - 1.0)
        line_end.append(end)
        line_box.append((Y - 3.4, Y + 1.2))
        Y += 4.9 + (2.0 if tall else 0)
    cv.text(X0 - 3.0, line_y[-1] + 0.2, l["kind"], fontsize=4.8, color=GREY, ha="right", va="center")
print("derivation ends at", Y)

# receipts: for each line, the calls whose numbers appear there first, each drawn as its own sheet
CS = 0.98 / CELL  # mm per sheet pixel: a cell is 0.98 mm
placed = []


def fmt(op, a):
    a = [int(v) for v in a]
    neg = lambda v: f"−{-v}" if v < 0 else f"{v}"
    if op == "add":
        return f"{neg(a[0])} + {neg(a[1])}" if a[1] >= 0 else f"{neg(a[0])} − {-a[1]}"
    if op == "sub":
        return f"{neg(a[0])} − {neg(a[1])}"
    if op == "mul":
        return f"{neg(a[0])} × {neg(a[1])}"
    if op == "divmod":
        return f"{a[0]} ÷ {a[1]}"
    return f"√{a[0]}"


from common import row_tops

RX0 = 80.0
GAPY, LAB = 1.2, 2.3
groups = []
for i, l in enumerate(lines):
    new = []
    for n in l["numbers"]:
        if n["call"] not in seen and n["call"] not in new:
            new.append(n["call"])
    seen |= set(new)
    if not new:
        continue
    sheets = []
    for c in new:
        rc = A["receipts"][str(c)]
        snap = rc["sheets"][0]["snap"]
        _, H = row_tops(snap["rows"])
        sheets.append((rc, snap, snap["cols"] * CELL * CS, H * CS))
    groups.append((i, sheets, max(h for *_, h in sheets) + LAB))
# stack the groups top to bottom in two columns, each group where it lands nearest its own line
COLS = [RX0, RX0 + 20.5]
floors = [8.0, 8.0]
place = []
for i, sheets, gh in groups:
    want = line_y[i] - gh / 2 + LAB / 2
    gw = sum(w for _, _, w, _ in sheets) + 2.0 * (len(sheets) - 1)
    options = []
    for k, fl in enumerate(floors):
        if k == 0 and gw > 17.5 and False:
            continue
        options.append((max(want, fl) - want, k))
    _, k = min(options)
    t = max(want, floors[k])
    floors[k] = t + gh + GAPY
    place.append((COLS[k], t))
check(max(floors) < 120, "the sheets fit beside the derivation")
for (i, sheets, gh), (x0r, top) in zip(groups, place):
    x = x0r
    for rc, snap, w, h in sheets:
        y = top + LAB
        draw_sheet(cv, snap, x0=x, y0=y, scale=CS, labels=False, fovea=False, pad=4, zorder=4)
        cv.text(x + w / 2, y - 4 * CS - 0.3, fmt(rc["op"], rc["operands"]), fontsize=4.2, color=SOFT, ha="center",
                va="bottom")
        x += w + 2.0
    # one thread from the line's end to its sheets
    x1, y1 = line_end[i] + 1.0, line_y[i]
    x2, y2 = x0r - 4 * CS - 0.3, top + LAB + (gh - LAB) / 2
    verts = [(x1, y1), ((x1 + x2) / 2, y1), ((x1 + x2) / 2, y2), (x2, y2)]
    cv.add_patch(PathPatch(Path(verts, [Path.MOVETO, Path.CURVE4, Path.CURVE4, Path.CURVE4]), fc="none",
                           ec=ROSE, lw=0.45, alpha=0.8, zorder=2))
check(seen == {int(k) for k in A["receipts"]}, "every computed number's call has its sheet")
cv.text(X0, 6.0, "factor  $x^3-6x^2+11x-6$", fontsize=7, color=INK, ha="left", va="baseline")
cv.text(RX0, 6.0, "the sheet behind each new number", fontsize=5.5, color=ROSE, ha="left", va="baseline")
letter(fig, 1.0, 3.0, "a")

# ---- b: refusals ---------------------------------------------------------------------------------------------------
R3 = {(p, m): json.loads((PROGRAM / f"round3-{p}-{m}.json").read_text()) for p in ("textbook", "evaluation")
      for m in ("light", "strong")}
for p in ("textbook", "evaluation"):
    check(R3[(p, "light")]["refusal"]["wrongRoots"] == R3[(p, "strong")]["refusal"]["wrongRoots"]
          and {k: v for k, v in R3[(p, "light")]["refusal"]["evaluationFaults"].items() if k != "details"}
          == {k: v for k, v in R3[(p, "strong")]["refusal"]["evaluationFaults"].items() if k != "details"},
          f"{p}: light and strong refuse the same")
ax = axes(fig, 140.0, 10.0, 37.0, 26.0)
clean(ax, left=False)
rowsb = [("wrong roots offered", "wrongRoots"), ("one call's arithmetic\ncorrupted", "evaluationFaults")]
for r, (lab, key) in enumerate(rowsb):
    for p, col, dy in (("textbook", ROSE, -0.13), ("evaluation", COBALT, 0.13)):
        d = R3[(p, "light")]["refusal"][key]
        share = d["caught"] / d["attempts"]
        ax.plot([0.5, share], [r + dy, r + dy], color=col, lw=0.6, alpha=0.5)
        ax.scatter([share], [r + dy], s=10, color=col, lw=0, zorder=3)
        ax.text(share + 0.012, r + dy, f"{d['caught']}/{d['attempts']}", fontsize=4.8, color=col, ha="left",
                va="center")
        if key == "evaluationFaults":
            check(d["missesWithWrongAnswer"] == 0, f"{p}: no missed fault changed the answer")
    ax.text(0.49, r, lab, fontsize=5, color=INK, ha="right", va="center", linespacing=1.05)
check(R3[("textbook", "light")]["refusal"]["evaluationFaults"]["caught"] == 185
      and R3[("evaluation", "light")]["refusal"]["evaluationFaults"]["caught"] == 173, "185 and 173 of 200")
ax.set_xlim(0.5, 1.08)
ax.set_ylim(1.6, -0.75)
ax.set_xticks([0.6, 0.8, 1.0])
ax.set_xticklabels(["60%", "80%", "100%"])
ax.set_xlabel("refused", labelpad=1.5)
ax.text(1.0, -0.62, "textbook", fontsize=5, color=ROSE, ha="right", va="center")
ax.text(1.0, -0.38, "evaluation", fontsize=5, color=COBALT, ha="right", va="center")
ax.text(0.5, 1.48, "every missed fault left the answer right", fontsize=4.8, color=SOFT, ha="left", va="center")
letter(fig, 118.0, 3.0, "b")

# ---- c: seconds per work order -------------------------------------------------------------------------------------
names = {
    "123456 * 654321": "6 × 6-digit product", "solve 3(x-2)+5=2x+14": "3(x−2)+5 = 2x+14",
    "solve 7x+13=2026-4x": "7x+13 = 2026−4x", "solve 2x+3y=7,x-y=1": "2 × 2 system",
    "expand (x+2)^5": "expand (x+2)⁵", "expand (2x-3)^4": "expand (2x−3)⁴", "expand (x+1)^10": "expand (x+1)¹⁰",
    "solve (2x-3)(x+5)=x^2+1-16": "bracketed quadratic", "solve x^2-x-6=0": "x² − x − 6 = 0",
    "solve 2x+3y-z=1, x-y+2z=3, 3x+y+z=8": "3 × 3 system", "factor x^3-6x^2+11x-6": "factor x³−6x²+11x−6",
}
tb = {d["source"]: d for d in R3[("textbook", "light")]["demos"]}
ev = {d["source"]: d for d in R3[("evaluation", "light")]["demos"]}
check(set(tb) == set(ev) == set(names), "eleven work orders")
for d in list(tb.values()) + list(ev.values()):
    check(abs(d["seconds"] - (0.037 * d["rows"] + 0.065 * d["calls"])) < 1e-6, "seconds = cost model")
order = sorted(names, key=lambda s: tb[s]["seconds"])
ax = axes(fig, 140.0, 52.0, 37.0, 54.0)
clean(ax, left=False)
for k, s in enumerate(order):
    a, b = tb[s]["seconds"], ev[s]["seconds"]
    ax.plot([a, b], [k, k], color=MIST, lw=0.7, zorder=1)
    ax.scatter([b], [k], s=8, color=COBALT, lw=0, zorder=3)
    ax.scatter([a], [k], s=8, color=ROSE, lw=0, zorder=4)
    ax.text(1.55, k, names[s], fontsize=4.8, color=INK, ha="right", va="center")
ax.set_xscale("log")
ax.set_xlim(1.6, 200)
ax.set_ylim(len(order) - 0.4, -1.4)
ax.set_xticks([2, 12, 50, 150])
ax.set_xticklabels(["2", "12", "50", "150"])
ax.minorticks_off()
ax.axvline(12, color=VIOLET, lw=0.6, ls=(0, (1, 1.5)), zorder=0)
ax.set_xlabel("seconds on the M4 (cost model)", labelpad=1.5)
both = sum(1 for s in names if tb[s]["seconds"] < 12 and ev[s]["seconds"] < 12)
tb_under = sum(1 for s in names if tb[s]["seconds"] < 12)
check(both == 6 and tb_under == 6, "six of eleven under 12 s")
ax.text(12.6, -0.95, "12 s", fontsize=4.8, color=VIOLET, ha="left", va="center")
ax.text(190, -0.95, "textbook", fontsize=5, color=ROSE, ha="right", va="center")
ax.text(190, 0.15, "evaluation", fontsize=5, color=COBALT, ha="right", va="center")
letter(fig, 118.0, 45.0, "c")

save(fig, "fig4")
