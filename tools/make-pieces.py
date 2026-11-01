#!/usr/bin/env python3
"""Make the piece images img/{white,black}_{king,bishop,rook}.png
from the chess symbols U+265A, U+265D, U+265C of a font.
  black piece: border = white, fill = black
  white piece: border = white, fill = white
  outside and the inner lines of the white piece: transparent
usage: python3 tools/make-pieces.py [font.ttf] [output size in px]
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

FONT = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SIZE = int(sys.argv[2]) if len(sys.argv) > 2 else 64   # output size [px]
SCALE = 8                  # render at SIZE*SCALE and shrink for anti-aliasing
BORDER = 0.04              # border width / image size
MARGIN = 0.02              # margin / image size
PIECES = [("king", "♚"), ("bishop", "♝"), ("rook", "♜")]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "img")

big = SIZE * SCALE
font = ImageFont.truetype(FONT, big)
b = max(1, round(BORDER * big))
disk = np.hypot(*np.mgrid[-b:b + 1, -b:b + 1]) <= b

# shape (filled glyph) and outline (shape + border) of each piece
shapes = {}
for name, ch in PIECES:
    img = Image.new("L", (big * 2, big * 2), 0)
    ImageDraw.Draw(img).text((big // 2, big // 2), ch, font=font, fill=255)
    fill = np.array(img) >= 128                       # glyph without its inner lines
    outline = ndimage.binary_dilation(fill, structure=disk)
    silhouette = ndimage.binary_fill_holes(fill)
    ring = outline & ~silhouette                      # border outside the glyph
    shapes[name] = (fill, outline, ring)

# common scale: the tallest / widest outline fits in the image
boxes = {n: ndimage.find_objects(o.astype(int))[0] for n, (f, o, r) in shapes.items()}
hmax = max(s[0].stop - s[0].start for s in boxes.values())
wmax = max(s[1].stop - s[1].start for s in boxes.values())
inner = round(big * (1 - 2 * MARGIN))
k = inner / max(hmax, wmax)

os.makedirs(OUT, exist_ok=True)
for name, (fill, outline, ring) in shapes.items():
    sy, sx = boxes[name]
    for color in ("white", "black"):
        rgba = np.zeros(fill.shape + (4,), np.uint8)
        if color == "black":
            rgba[outline] = (255, 255, 255, 255)   # border (also on the inner lines)
            rgba[fill] = (0, 0, 0, 255)            # fill
        else:
            rgba[ring | fill] = (255, 255, 255, 255)  # border and fill
        piece = Image.fromarray(rgba[sy, sx], "RGBA")
        w = round((sx.stop - sx.start) * k)
        h = round((sy.stop - sy.start) * k)
        piece = piece.resize((w, h), Image.LANCZOS)
        canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        m = round(big * MARGIN)
        canvas.paste(piece, ((big - w) // 2, big - m - h))   # centered, on the bottom line
        canvas = canvas.resize((SIZE, SIZE), Image.LANCZOS)
        path = os.path.join(OUT, f"{color}_{name}.png")
        canvas.save(path, optimize=True)
        print(path)
