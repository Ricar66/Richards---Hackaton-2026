#!/usr/bin/env python3
"""Gera o QR público em SVG, SEM token. Dependência só da máquina de edição: pip install qrcode."""
from pathlib import Path
import argparse
import qrcode

def main():
    parser = argparse.ArgumentParser(description="Gera o QR oficial para a plateia RICHARDS")
    parser.add_argument("--url", required=True, help="URL pública completa, terminando em /plateia")
    parser.add_argument("--output", default="public/qr-plateia.svg")
    args = parser.parse_args()
    if not args.url.startswith(("https://", "http://")) or not args.url.endswith("/plateia"):
        parser.error("Use a URL pública completa http(s)://.../plateia, sem usuário, senha ou token")
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q, border=4)
    qr.add_data(args.url)
    qr.make(fit=True)
    matrix = qr.get_matrix()
    squares = []
    for y, row in enumerate(matrix):
        x = 0
        while x < len(row):
            if not row[x]:
                x += 1
                continue
            start = x
            while x < len(row) and row[x]:
                x += 1
            squares.append("M%d %dh%dv1H%dz" % (start, y, x - start, start))
    side = len(matrix)
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="592" height="592" viewBox="0 0 %d %d" shape-rendering="crispEdges"><rect width="%d" height="%d" fill="#fff"/><path d="%s" fill="#071217"/></svg>\n' % (side, side, side, side, "".join(squares))
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(svg, encoding="utf-8")
    print("QR gerado:", path, "| URL:", args.url, "| módulos:", side)

if __name__ == "__main__":
    main()
