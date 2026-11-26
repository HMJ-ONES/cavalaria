#!/usr/bin/env python3
"""Process Henrique's piece artwork (white-outline + solid-black JPEGs) into
transparent PNGs for Cavalaria, and embed them as data URIs in index.html.

Why data URIs: the GitHub push path used for this repo (MCP push_files) is
text-only and corrupts binary files, so the PNG bytes live inside index.html
as base64 text. The artwork sources are stored the same way, as base64 text.

Usage: python3 tools/process_pieces.py
Inputs (Henrique's uploads, base64 text so they survive the text-only push):
  tools/src-white.jpg.b64  outline version  -> white pieces
  tools/src-black.jpg.b64  solid black version -> black pieces
Outputs:
  piece-white.png, piece-black.png  (transparent, square, 256px; regenerated)
  index.html  (PIECE_W / PIECE_B data-URI constants replaced in place)
"""
import base64
import io
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT_SIZE = 256  # pieces render at ~35-70px on the board; 256px is plenty even on retina


def to_transparent(im: Image.Image) -> Image.Image:
    """Turn the outer white background transparent, keeping enclosed white
    (the outline piece's fill, the solid piece's pawn/horse gap) opaque."""
    rgba = im.convert("RGBA")
    draw = ImageDraw.Draw(rgba)
    # Flood-fill the connected near-white background from the corners.
    for seed in [(0, 0), (rgba.width - 1, 0), (0, rgba.height - 1),
                 (rgba.width - 1, rgba.height - 1)]:
        ImageDraw.floodfill(rgba, seed, (0, 0, 0, 0), thresh=30)
    # Trim the light-grey JPEG fringe: opaque pixels touching transparency
    # whose luminance is still near-white go transparent too.
    px = rgba.load()
    w, h = rgba.size
    fringe = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if (r + g + b) / 3 > 210:
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        fringe.append((x, y))
                        break
    for x, y in fringe:
        px[x, y] = (0, 0, 0, 0)
    # Soften the cut edge by one pixel.
    r, g, b, a = rgba.split()
    rgba = Image.merge("RGBA", (r, g, b, a.filter(ImageFilter.GaussianBlur(0.7))))
    return rgba


def square(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    if bbox is None:
        raise ValueError("image is fully transparent")
    im = im.crop(bbox)
    canvas = Image.new("RGBA", (OUT_SIZE, OUT_SIZE), (0, 0, 0, 0))
    scale = min(OUT_SIZE / im.width, OUT_SIZE / im.height)
    nw, nh = max(1, round(im.width * scale)), max(1, round(im.height * scale))
    im = im.resize((nw, nh), Image.LANCZOS)
    canvas.paste(im, ((OUT_SIZE - nw) // 2, (OUT_SIZE - nh) // 2))
    return canvas


def main() -> int:
    for name, src in (("white", "tools/src-white.jpg.b64"),
                      ("black", "tools/src-black.jpg.b64")):
        src_path = ROOT / src
        if not src_path.exists():
            print(f"missing {src_path}", file=sys.stderr)
            return 1
        raw = base64.b64decode(src_path.read_text())
        png = square(to_transparent(Image.open(io.BytesIO(raw))))
        out = ROOT / f"piece-{name}.png"
        png.save(out, optimize=True)
        print(f"{out.name}: {out.stat().st_size} bytes")

    html_path = ROOT / "index.html"
    html = html_path.read_text()
    for name in ("white", "black"):
        b64 = base64.b64encode((ROOT / f"piece-{name}.png").read_bytes()).decode()
        uri = f"data:image/png;base64,{b64}"
        const = "PIECE_W" if name == "white" else "PIECE_B"
        html, n = re.subn(
            rf"const {const}=\"data:image/png;base64,[^\"]*\";",
            f'const {const}="{uri}";', html)
        if n != 1:
            print(f"expected exactly one {const} line in index.html, found {n}",
                  file=sys.stderr)
            return 1
        print(f"{const}: {len(uri)} chars embedded")
    html_path.write_text(html)
    print("index.html updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
