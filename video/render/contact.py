"""Tiles PNG stills into one contact sheet: python contact.py out.jpg cols still1.png still2.png ... (labels: file names)."""

import sys

from PIL import Image, ImageDraw

out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
W, H = 640, 360
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * W + (cols + 1) * 8, rows * (H + 26) + 8), "#e8ebf2")
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB").resize((W, H), Image.LANCZOS)
    x, y = 8 + (i % cols) * (W + 8), 8 + (i // cols) * (H + 26)
    sheet.paste(im, (x, y))
    d.text((x + 4, y + H + 4), f.split("/")[-1], fill="#1f2a44")
sheet.save(out, quality=88)
