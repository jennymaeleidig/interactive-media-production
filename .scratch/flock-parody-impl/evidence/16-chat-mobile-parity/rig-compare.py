"""Composite two viewport screenshots side by side (left = live, right = ours)
with a thin divider, for the ticket-16 evidence. No scaling of either side.
Usage: python3 compare.py <left.png> <right.png> <out.png> [labelL] [labelR]
"""
from PIL import Image, ImageDraw
import sys

left = Image.open(sys.argv[1]).convert('RGB')
right = Image.open(sys.argv[2]).convert('RGB')
out = sys.argv[3]
h = max(left.height, right.height)
gap = 3
canvas = Image.new('RGB', (left.width + gap + right.width, h), (255, 0, 0))
canvas.paste(left, (0, 0))
canvas.paste(right, (left.width + gap, 0))
canvas.save(out)
print(f"{out}: {left.size} | {right.size} -> {canvas.size}")
