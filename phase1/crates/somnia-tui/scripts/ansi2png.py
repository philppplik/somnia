#!/usr/bin/env python3
"""Render a .ansi capture to PNG. Block characters are drawn as rectangles so
the wordmark is pixel-accurate; everything else uses DejaVu Sans Mono."""
import re, sys
from PIL import Image, ImageDraw, ImageFont
src, dst, theme = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else "dark")
BG = (0x0F, 0x11, 0x15) if theme == "dark" else (0xF8, 0xF9, 0xFB)
DEF = (0xE6, 0xE8, 0xEE) if theme == "dark" else (0x1A, 0x1D, 0x24)
CW, CH = 10, 20
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 16)
bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 16)
lines = open(src, encoding="utf-8").read().split("\n")
while lines and lines[-1] == "": lines.pop()
cells = []
tok = re.compile(r"\x1b\[([0-9;]*)m")
for ln in lines:
    row, fg, rev, b, pos = [], DEF, False, False, 0
    while pos < len(ln):
        m = tok.match(ln, pos)
        if m:
            p = m.group(1).split(";") if m.group(1) else ["0"]
            if p[0] == "0": fg, rev, b = DEF, False, False
            elif p[0] == "39": fg = DEF
            elif p[0] == "1": b = True
            elif p[0] == "7": rev = True
            elif p[0] == "38" and p[1] == "2": fg = tuple(int(x) for x in p[2:5])
            elif p[0] == "38" and p[1] == "5":
                n = int(p[2]); n -= 16
                fg = tuple(int(v * 255 / 5) for v in (n // 36, (n // 6) % 6, n % 6))
            pos = m.end(); continue
        row.append((ln[pos], fg, rev, b)); pos += 1
    cells.append(row)
W = max(len(r) for r in cells); H = len(cells)
img = Image.new("RGB", (W * CW + 20, H * CH + 20), BG)
d = ImageDraw.Draw(img)
for y, row in enumerate(cells):
    for x, (c, fg, rev, b) in enumerate(row):
        X, Y = 10 + x * CW, 10 + y * CH
        if rev: d.rectangle([X, Y, X + CW - 1, Y + CH - 1], fill=fg); fg = BG
        if c == "█": d.rectangle([X, Y, X + CW, Y + CH], fill=fg)
        elif c == "▀": d.rectangle([X, Y, X + CW, Y + CH // 2], fill=fg)
        elif c == "▄": d.rectangle([X, Y + CH // 2, X + CW, Y + CH], fill=fg)
        elif c != " ": d.text((X, Y), c, font=bold if b else font, fill=fg)
img.save(dst)
