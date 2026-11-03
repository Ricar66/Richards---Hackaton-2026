#!/usr/bin/env python3
"""Exporta SVGs Full HD da apresentação RICHARDS para PNG, PPTX e ZIP.
Uso: pip install -r presentation/requirements-pitch.txt && python presentation/render_slides.py
Não altera código, dados ou banco da aplicação.
"""
from pathlib import Path
from io import BytesIO
from zipfile import ZipFile, ZIP_DEFLATED
from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.util import Inches
import cairosvg

ROOT = Path(__file__).resolve().parent
SLIDES = ROOT / "slides"
EXPORT = ROOT / "export"
PNG = EXPORT / "png"
PNG.mkdir(parents=True, exist_ok=True)
WIDTH, HEIGHT = 1920, 1080
prs = Presentation()
prs.slide_width = Inches(13.333333)
prs.slide_height = Inches(7.5)
thumbs = []
items = sorted(SLIDES.glob("*.svg"))

for src in items:
    dst = PNG / f"{src.stem}.png"
    cairosvg.svg2png(url=str(src), write_to=str(dst),
                     output_width=WIDTH, output_height=HEIGHT)
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    slide.shapes.add_picture(str(dst), 0, 0,
                             width=prs.slide_width, height=prs.slide_height)
    thumbs.append(Image.open(dst).convert("RGB").resize((480, 270)))

prs.save(EXPORT / "RICHARDS_Pitch_Hackathon_2026.pptx")
sheet = Image.new("RGB", (1020, 1980), (240, 245, 241))
draw = ImageDraw.Draw(sheet)
for i, thumb in enumerate(thumbs):
    x, y = 20 + (i % 2) * 500, 20 + (i // 2) * 280
    sheet.paste(thumb, (x, y))
    draw.rectangle((x, y, x+479, y+269), outline=(160, 185, 170), width=2)
sheet.save(EXPORT / "RICHARDS_Visao_Geral.jpg", quality=90)

with ZipFile(EXPORT / "RICHARDS_Slides_FullHD.zip", "w", ZIP_DEFLATED) as z:
    for src in items:
        z.write(src, f"SVG_EDITAVEL/{src.name}")
        z.write(PNG / f"{src.stem}.png", f"PNG_1920x1080/{src.stem}.png")
print(f"Exportados {len(items)} slides em {EXPORT}")
