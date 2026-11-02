"""HabVero v2: a nyitó mozaik képei (python3 -I src/mozaik.py).
- img/mozaik-200.webp és mozaik-120.webp: 8x5 négyzetes termékfotó-atlasz (Instagram/termekek, a bolt saját fotói)
- img/hero-bolt-tall-<w>.webp: álló (9:16) kivágás a telefonos, teljes képernyős nyitóképhez
Ugyanaz a színkezelés, mint a kepek.py-ban (grade)."""
import sys, glob
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from kepek import EREDETI, OUT, grade, load, crop_ratio, upscale
from PIL import Image

PICK = [2, 6, 9, 10, 12, 16, 17, 19, 20, 22, 24, 27, 31, 34, 37, 38, 39, 48, 49, 51,
        54, 57, 59, 63, 64, 68, 70, 77, 82, 90, 96, 98, 103, 105, 107, 113, 124, 133, 140, 150]
COLS, ROWS = 8, 5


def main():
    fs = sorted(glob.glob(str(EREDETI / 'Instagram/termekek/*.jpg')))
    tiles = [grade(crop_ratio(load(Path(fs[i]).relative_to(EREDETI)), 1.0, (0.5, 0.5, 0.86))) for i in PICK]
    for s, q in ((200, 74), (120, 72)):
        at = Image.new('RGB', (COLS * s, ROWS * s))
        for k, t in enumerate(tiles):
            at.paste(t.resize((s, s), Image.LANCZOS), ((k % COLS) * s, (k // COLS) * s))
        at.save(OUT / f'mozaik-{s}.webp', quality=q, method=6)
        print('mozaik', s, (OUT / f'mozaik-{s}.webp').stat().st_size // 1024, 'KB')
    src = grade(load('Facebook/bolt/fb_238_2048x1536.jpg'))
    tall = crop_ratio(src, 9 / 16, (0.62, 0.5, 1.0))
    for w in (640, 864):
        upscale(tall, w).save(OUT / f'hero-bolt-tall-{w}.webp', quality=80, method=6)
    print('tall ok', tall.size)


if __name__ == '__main__':
    main()
