"""Contact sheets: the inspiration images (with their ids), and the finished figures at 1440 px.

    python paper/figures/contact.py inspiration OUT.jpg
    python paper/figures/contact.py figures OUT_DIR      (one 1440 px image per figure, rendered from the SVGs, and
                                                          one sheet of all of them)
"""
import pathlib
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FONT = "/System/Library/Fonts/Helvetica.ttc"


def label(img, text):
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, 18)
    d.rectangle([0, 0, img.width, 28], fill=(255, 255, 255))
    d.text((8, 4), text, fill=(31, 42, 68), font=f)
    return img


def inspiration(out):
    files = sorted((HERE / "inspiration").glob("*.jpg"))
    W, cols = 600, 3
    tiles = []
    for f in files:
        im = Image.open(f).convert("RGB")
        im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
        canvas = Image.new("RGB", (W, im.height + 30), "white")
        canvas.paste(im, (0, 30))
        tiles.append(label(canvas, f.stem))
    h = max(t.height for t in tiles)
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * W + (cols + 1) * 10, rows * h + (rows + 1) * 10), "white")
    for i, t in enumerate(tiles):
        sheet.paste(t, (10 + (i % cols) * (W + 10), 10 + (i // cols) * (h + 10)))
    sheet.save(out, quality=88)
    print(out, sheet.size)


def figures(out_dir):
    out_dir = pathlib.Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    pngs = []
    figs = ROOT / "static" / "figures"
    for svg in sorted(figs.glob("fig*.svg")) + sorted(figs.glob("ed*.svg")):
        png = out_dir / (svg.stem + "_1440.png")
        subprocess.run(["rsvg-convert", "-w", "1440", "-b", "white", "-o", str(png), str(svg)], check=True)
        pngs.append(png)
    tiles = [label(Image.open(p).convert("RGB"), p.stem.replace("_1440", "")) for p in pngs]
    W = 1440
    sheet = Image.new("RGB", (W + 40, sum(t.height + 40 for t in tiles) + 20), "white")
    y = 20
    for t in tiles:
        sheet.paste(t, (20, y))
        y += t.height + 40
    sheet.save(out_dir / "contact_1440.png")
    print(out_dir / "contact_1440.png", sheet.size)


if __name__ == "__main__":
    {"inspiration": inspiration, "figures": figures}[sys.argv[1]](sys.argv[2])
