#!/usr/bin/env python3
"""Generate ZaiMem's GitHub social preview banner (1280x640)."""
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1280, 640
OUT = "/home/z/my-project/scripts/shot-social-preview.png"

img = Image.new("RGB", (W, H), (8, 8, 12))

# ambient glows (violet / emerald / fuchsia), heavily blurred
glow = Image.new("RGB", (W, H), (8, 8, 12))
gd = ImageDraw.Draw(glow)
gd.ellipse([60, -240, 700, 300], fill=(58, 26, 118))    # violet top-left
gd.ellipse([840, 330, 1400, 780], fill=(8, 66, 52))     # emerald bottom-right
gd.ellipse([520, 380, 1000, 740], fill=(78, 22, 78))    # fuchsia bottom-center
glow = glow.filter(ImageFilter.GaussianBlur(150))
img = Image.blend(img, glow, 0.72)
d = ImageDraw.Draw(img)

BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def fit(text, path, size, max_w):
    f = ImageFont.truetype(path, size)
    while d.textlength(text, font=f) > max_w and size > 12:
        size -= 2
        f = ImageFont.truetype(path, size)
    return f


f_title = fit("ZaiMem", BOLD, 150, 700)
f_tag = fit("Session memory & context enhancer for chat.z.ai", REG, 40, 1080)
f_feat = fit("MCP · Vector Memory · Token Saver · Smart Skills · GitHub Cloud DB", BOLD, 30, 1100)
f_small = ImageFont.truetype(REG, 26)

# accent bar
d.rounded_rectangle([90, 158, 392, 168], 5, fill=(139, 92, 246))

d.text((90, 196), "ZaiMem", font=f_title, fill=(250, 250, 252))
d.text((90, 392), "Session memory & context enhancer for chat.z.ai", font=f_tag, fill=(168, 168, 178))
d.text((90, 476), "MCP · Vector Memory · Token Saver · Smart Skills · GitHub Cloud DB", font=f_feat, fill=(196, 181, 253))
d.text((90, 566), "github.com/romangalaxys10-spec/zaimem", font=f_small, fill=(113, 113, 122))

img.save(OUT)
print("saved:", OUT)
