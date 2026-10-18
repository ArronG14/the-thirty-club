"""
Prepare the entrance's scanned PBR textures (offline asset tool).

Sources are CC0 1K JPGs from Poly Haven (https://polyhaven.com), downloaded
manually into a folder outside the repository:

  sapele_veneer, black_walnut_veneer_01, marble_01, granite_tile_03
  (diff / rough / nor_gl as available)

Usage (requires Pillow):
  python3 -I tools/prepare-textures.py <download-dir>

Writes graded, resized WebP files into
src/features/entrance/scene/assets/. Only these outputs are committed.
"""

import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

OUT = Path(__file__).resolve().parent.parent / "src/features/entrance/scene/assets"


def load(src: Path, name: str) -> Image.Image:
    return Image.open(src / f"{name}_1k.jpg")


def save(img: Image.Image, name: str, size: int, quality: int) -> None:
    img = img.resize((size, size), Image.LANCZOS)
    img.save(OUT / f"{name}.webp", "WEBP", quality=quality, method=6)


def grade(img: Image.Image, brightness: float, contrast: float, saturation: float, tint=(1.0, 1.0, 1.0)) -> Image.Image:
    img = ImageEnhance.Brightness(img.convert("RGB")).enhance(brightness)
    img = ImageEnhance.Contrast(img).enhance(contrast)
    img = ImageEnhance.Color(img).enhance(saturation)
    r, g, b = img.split()
    r = r.point(lambda v: min(255, int(v * tint[0])))
    g = g.point(lambda v: min(255, int(v * tint[1])))
    b = b.point(lambda v: min(255, int(v * tint[2])))
    return Image.merge("RGB", (r, g, b))


def main(src: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # Sapele: ribbon-figured African mahogany. Deepened towards oxblood.
    save(grade(load(src, "sapele_veneer_diff"), 0.46, 1.18, 0.82, (1.02, 0.8, 0.74)), "mahogany_diff", 1024, 82)
    save(load(src, "sapele_veneer_rough").convert("L"), "mahogany_rough", 512, 80)
    save(load(src, "sapele_veneer_nor_gl").convert("RGB"), "mahogany_nor", 512, 88)

    # Black walnut: architrave and recess panelling.
    # Rotated so the figure runs vertically on standing mouldings.
    turn = Image.Transpose.ROTATE_90
    save(grade(load(src, "black_walnut_veneer_01_diff").transpose(turn), 0.5, 1.15, 1.1, (1.14, 0.98, 0.84)), "walnut_diff", 512, 80)
    save(load(src, "black_walnut_veneer_01_rough").transpose(turn).convert("L"), "walnut_rough", 512, 80)
    # A rotated tangent-space normal map needs its X/Y channels rotated too.
    nr, ng, nb = load(src, "black_walnut_veneer_01_nor_gl").convert("RGB").transpose(turn).split()
    save(Image.merge("RGB", (ImageOps.invert(ng), nr, nb)), "walnut_nor", 512, 88)

    # Marble 01 inverted into a black marble with warm ivory veining.
    marble = ImageOps.invert(load(src, "marble_01_diff").convert("RGB"))
    marble = ImageOps.autocontrast(marble, cutoff=1)
    save(grade(marble, 0.42, 1.55, 0.2, (1.06, 1.0, 0.9)), "marble_diff", 1024, 82)
    save(load(src, "marble_01_rough").convert("L"), "marble_rough", 512, 80)

    # Granite blocks darkened into a near-black honed facade stone.
    save(grade(load(src, "granite_tile_03_diff"), 0.32, 1.2, 0.35, (1.04, 0.98, 0.92)), "stone_diff", 1024, 78)
    save(load(src, "granite_tile_03_rough").convert("L"), "stone_rough", 512, 80)
    save(load(src, "granite_tile_03_nor_gl").convert("RGB"), "stone_nor", 512, 88)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]))
