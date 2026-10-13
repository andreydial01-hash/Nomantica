"""Convierte el diseño de la miniatura (PDF de 1 página, proporción 1.91:1) en og-image.jpg de 1200x630.

Uso, desde la raíz del repo:
    python _og/pdf-a-jpg.py                       # usa _og/og-nomantica.pdf
    python _og/pdf-a-jpg.py "ruta/al/nuevo.pdf"

Requiere PyMuPDF:  pip install pymupdf
"""
import sys
from pathlib import Path

import pymupdf

RAIZ = Path(__file__).resolve().parent.parent
origen = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "_og" / "og-nomantica.pdf"
destino = RAIZ / "og-image.jpg"

pagina = pymupdf.open(origen)[0]
ancho, alto = pagina.rect.width, pagina.rect.height
if abs(ancho / alto - 1200 / 630) > 0.01:
    sys.exit(f"La página mide {ancho:.0f}x{alto:.0f} pt: no tiene proporción 1200x630 (1.905). Ajusta el diseño.")

escala = 1200 / ancho
pix = pagina.get_pixmap(matrix=pymupdf.Matrix(escala, escala), alpha=False)
pix.save(destino, jpg_quality=90)
print(f"{destino.name}: {pix.width}x{pix.height} px, {destino.stat().st_size // 1024} KB")
