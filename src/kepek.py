"""HabVero: képek előállítása a site/img/ mappába (dizajn.md 5. színkezelés + fix arányú slotok).

Futtatás:  python3 -I src/kepek.py  (a /home/claude/habvero mappából)
Bemenet:   /mnt/project-files/habvero/munka/kepek/eredeti/  (valódi bolti fotók, Instagram/ és Facebook/)
           (a régi képernyőkép-kivágások a kepek/raw/ mappában maradtak, már nem használja a script)
Kimenet:   site/img/<slot>-<szélesség>.webp  (+ og-image.jpg, logo-kor-*.webp, apple-touch-icon.png, grain.png)

KÉPCSERE: a SLOTS sorában a forrás (EREDETI-hez képest) és a kivágás (fx, fy, zoom) átírva, újrafuttatás.
  fx, fy = a kivágás közepe az eredeti kép szélességének/magasságának törtrészében (0..1),
  zoom   = 1: az aránynak megfelelő legnagyobb kivágás, 0.7: 70 %-os (közelebbi) kivágás.
A slot neve, aránya és a kimeneti fájlnevek nem változnak, így a HTML-hez nem kell nyúlni (csak a ?v= számot emeld).
Forrásfájlok: lásd P/kutatas/fotok.md és P/terv/kepek.md.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
import numpy as np, colorsys, random

EREDETI = Path('/mnt/project-files/habvero/munka/kepek/eredeti')
OUT = Path(__file__).resolve().parent.parent / 'site' / 'img'
OUT.mkdir(parents=True, exist_ok=True)

# slot, forrás, arány (w/h), kivágás (fx, fy, zoom), kimeneti szélességek, WebP minőség
IT = 'Instagram/termekek/datum-nelkul_'
SLOTS = [
    # hero (1. kör): FB bolt, a szoba az ajtó felől; 16:9 az asztali nagy fotónak, 4:5 a telefonnak (a forrás 2048 px: nincs felskálázás)
    ('hero-bolt-wide',        'Facebook/bolt/fb_238_2048x1536.jpg',            16/9, (0.5, 0.5, 1.0),  [800, 1400, 2048],       80),
    ('hero-bolt-wide-phone',  'Facebook/bolt/fb_238_2048x1536.jpg',            4/5,  (0.60, 0.5, 1.0), [640, 960, 1229],        80),
    # a régi hero-slotok (változatlan név, az új közös színkezeléssel)
    ('hero-bolt',             'Facebook/bolt/fb_238_2048x1536.jpg',            4/3,  (0.5, 0.5, 1.0),  [640, 1000, 1400, 2000], 80),
    ('hero-bolt-16x9',        'Facebook/bolt/fb_238_2048x1536.jpg',            16/9, (0.5, 0.56, 1.0), [1400, 2000],            80),
    # Látogatás: a pult és a pénztár, 3072x4096 eredeti (16:9 kivágás, a felskálázás nem kell)
    ('latogatas-bolt',        'Instagram/bolt/datum-nelkul_Dc3VppkDk0t.jpg',   16/9, (0.5, 0.45, 1.0), [800, 1400, 2048],       80),
    # kártya-sáv: IG bolt, törzsvásárlói kártya a kézben, mögötte a bolt
    ('kartya-polc',           'Instagram/bolt/datum-nelkul_De87NjZu3P1.jpg',   3/2,  (0.5, 0.62, 1.0), [560, 840],        82),
    # Kínálat 4:5: soronként a főkép + 3 extra (a, b, c)
    ('kinalat-1-kellekek',    IT+'C3ACbxps-zk.jpg', 4/5, (0.5, 0.5, 1.0),   [400, 640, 960], 82),
    ('kinalat-1-a',           IT+'Cs3tD8BsCsm.jpg', 4/5, (0.5, 0.5, 1.0),   [400, 640, 960], 82),
    ('kinalat-1-b',           IT+'CvE30ovMjEN.jpg', 4/5, (0.5, 0.5, 1.0),   [400, 640, 960], 82),
    ('kinalat-1-c',           IT+'CxH4yGGsKd2.jpg', 4/5, (0.5, 0.5, 1.0),   [400, 640, 960], 82),
    ('kinalat-2-alapanyagok', IT+'Cornb7Bsnu9.jpg', 4/5, (0.5, 0.5, 1.0),   [400, 640, 960], 82),
    ('kinalat-2-a',           IT+'C7gU0vqsOqb.jpg', 4/5, (0.5, 0.5, 1.0),   [400, 640, 960], 82),
    ('kinalat-2-b',           'Facebook/bolt/fb_212_2048x1536.jpg', 4/5, (0.35, 0.7, 0.8), [400, 640, 960], 82),
    ('kinalat-2-c',           IT+'Cl3Y7gCspF8.jpg', 4/5, (0.5, 0.5, 1.0),   [400, 640, 960], 82),
    ('kinalat-3-dekoracio',   'Facebook/cukorfigurak/fb_267_2048x1536.jpg', 4/5, (0.5, 0.55, 1.0), [400, 640, 960], 82),
    ('kinalat-3-a',           'Facebook/cukorfigurak/fb_207_2048x1536.jpg', 4/5, (0.5, 0.55, 1.0), [400, 640, 960], 82),
    ('kinalat-3-b',           'Instagram/cukorfigurak/datum-nelkul_Cp4uZl1M1bJ.jpg', 4/5, (0.45, 0.5, 1.0), [400, 640, 864], 82),
    ('kinalat-3-c',           IT+'CtMLwO_u_Yp.jpg', 4/5, (0.5, 0.5, 1.0),   [400, 640, 960], 82),
    # Alkotások: 1:1, 4:5, 1:1, 4:5, 1:1
    ('alkotas-1',             'Instagram/sutemenyek/datum-nelkul_C3Uq1QdM8xp.jpg', 1,   (0.5, 0.5, 1.0),  [400, 680], 82),
    ('alkotas-2',             'Instagram/sutemenyek/datum-nelkul_DdIz6h0u4uQ.jpg', 4/5, (0.5, 0.5, 1.0),  [400, 680], 82),
    ('alkotas-3',             'Instagram/sutemenyek/datum-nelkul_Cphu2g6suB1.jpg', 1,   (0.5, 0.5, 1.0),  [400, 680], 82),
    ('alkotas-4',             'Instagram/sutemenyek/datum-nelkul_DLUJGphM28E.jpg', 4/5, (0.5, 0.5, 1.0),  [400, 680], 82),
    ('alkotas-5',             'Instagram/sutemenyek/datum-nelkul_DfEjkIMuvf9.jpg', 1,   (0.5, 0.5, 1.0),  [400, 680], 82),
]
LOGO_SRC = 'Facebook/logo/fb_234_1500x1500.jpg'
OG_SRC, OG_CROP = 'Facebook/bolt/fb_238_2048x1536.jpg', (0.62, 0.5, 1.0)   # 4:5 kivágás, polcok + asztal


def grade(im: Image.Image) -> Image.Image:
    """Egy közös "ház-look" minden fotóra (dizajn.md 5. + fix 1. kör, 2026-10-30):
    1. fehéregyensúly: a világos (92. percentilis) felületek a --paper (#FBF7F2) felé, 80 %-ban, egységesen
    2. expozíció: a 96. percentilis fényesség ~0,93-ra (korlátozva 0,88..1,22), így a lapos vakus fotók is egy fényszinten ülnek
    3. tónusgörbe: emelt fekete (0,06) + enyhe S a közepeken (matt, nem lapos)
    4. meleg krém: közép/fény R +1,5 %, B -3 %; árnyék +2 % R, -2 % B
    5. telítettség 0,90x, a piros-rózsaszín (hue 340-20) 0,96x; nincs szemcse, nincs vignetta"""
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255.0
    lum = a.mean(axis=2)
    bright = a[lum >= np.percentile(lum, 92)]
    target = np.array([0xFB, 0xF7, 0xF2]) / 255.0
    ref = np.clip(bright.mean(axis=0), 0.2, 0.999)
    g = np.clip(np.log(target) / np.log(ref), 0.7, 1.4)
    g = 1 + (g - 1) * 0.8
    a = np.power(np.clip(a, 1e-4, 1), g)
    lum = a.mean(axis=2)
    gain = np.clip(0.93 / max(float(np.percentile(lum, 96)), 0.2), 0.88, 1.22)
    a = np.clip(a * gain, 0, 1)
    a = 0.06 + 0.92 * a                                         # emelt fekete, a fehér ~0,98
    a = a + 0.10 * (a - 0.5) * (1 - np.abs(2 * a - 1)) * 1.0     # enyhe S-görbe (közepeken)
    a = np.clip(a, 0, 1)
    warm = np.array([1.015, 1.0, 0.97], dtype=np.float32)
    a = a * (1 + (warm - 1) * (0.4 + 0.6 * a.mean(axis=2, keepdims=True)))
    hsv = np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).convert('HSV')).astype(np.float32)
    h = hsv[..., 0] / 255.0 * 360
    red = (h >= 340) | (h <= 20)
    hsv[..., 1] *= np.where(red, 0.96, 0.90)
    a = np.asarray(Image.fromarray(np.clip(hsv, 0, 255).astype(np.uint8), 'HSV').convert('RGB')).astype(np.float32) / 255.0
    dark = (a.mean(axis=2) < 0.30)[..., None]
    a = np.where(dark, a + np.array([0.02, 0, -0.02]), a)
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))


def load(rel):
    return ImageOps.exif_transpose(Image.open(EREDETI / rel)).convert('RGB')


def crop_ratio(im, ratio, focus=(0.5, 0.5, 1.0)):
    """Az aránynak megfelelő kivágás: közép (fx, fy) az eredeti törtrészében, zoom <= 1 a legnagyobb kivágás törtrésze."""
    fx, fy, z = focus
    W, H = im.size
    if W / H > ratio:
        ch = H; cw = H * ratio
    else:
        cw = W; ch = W / ratio
    cw, ch = cw * z, ch * z
    x0 = min(max(fx * W - cw / 2, 0), W - cw); y0 = min(max(fy * H - ch / 2, 0), H - ch)
    return im.crop((round(x0), round(y0), round(x0 + cw), round(y0 + ch)))


def upscale(im, w):
    """Lanczos + enyhe élesítés. (A muapi felskálázás a fotós feladata; itt csak a slotba illesztés.)"""
    h = round(w * im.size[1] / im.size[0])
    out = im.resize((w, h), Image.LANCZOS)
    if w > im.size[0]:
        out = out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    return out


def main():
    sizes = {}
    for slot, src, ratio, focus, widths, q in SLOTS:
        im = grade(crop_ratio(load(src), ratio, focus))
        for w in widths:
            if w > im.size[0] * 1.02:
                print('kihagyva (felskálázás kellene):', slot, w, '>', im.size[0]); continue
            o = upscale(im, w)
            f = OUT / f'{slot}-{w}.webp'
            o.save(f, 'WEBP', quality=q, method=6)
            sizes[f'{slot}-{w}'] = (o.size, f.stat().st_size // 1024)
    # logó: kör kivágás átlátszó háttérrel (lábléc 96 px, 2x)
    lg = load(LOGO_SRC)
    w, h = lg.size; d = min(w, h) - 8; x0 = (w - d) // 2; y0 = (h - d) // 2
    lg = lg.crop((x0, y0, x0 + d, y0 + d)).resize((384, 384), Image.LANCZOS)
    m = Image.new('L', (384 * 4, 384 * 4), 0); ImageDraw.Draw(m).ellipse((6, 6, 384 * 4 - 6, 384 * 4 - 6), fill=255)
    m = m.resize((384, 384), Image.LANCZOS)
    for s in (192, 96):
        x = lg.resize((s, s), Image.LANCZOS); x.putalpha(m.resize((s, s), Image.LANCZOS))
        x.save(OUT / f'logo-kor-{s}.webp', 'WEBP', quality=90, method=6)
    ati = lg.resize((180, 180), Image.LANCZOS)
    ati.save(OUT.parent / 'apple-touch-icon.png', optimize=True)
    # szemcse: 128 px, 8 szint
    rnd = np.random.default_rng(7).integers(0, 8, (128, 128)) * 36
    Image.fromarray(rnd.astype(np.uint8), 'L').convert('RGB').save(OUT / 'grain.png', optimize=True, bits=3)
    og(OUT)
    for k, v in sizes.items():
        print(k, v)


def og(out):
    """1200x630 OG kép: polcfotó jobbra, krém mező balra a szómárkával és a címmel (nyelvfüggetlen)."""
    W, H = 1200, 630
    c = Image.new('RGB', (W, H), (0xFB, 0xF7, 0xF2))
    ph = grade(crop_ratio(load(OG_SRC), 4 / 5, OG_CROP))
    ph = ph.resize((504, 630), Image.LANCZOS)
    c.paste(ph, (W - 504, 0))
    d = ImageDraw.Draw(c)
    ink = (0x3E, 0x35, 0x32); line = (0x5A, 0x46, 0x40)
    f1 = ImageFont.truetype(str(FONTDIR / 'noto-200.ttf'), 132)
    f2 = ImageFont.truetype(str(FONTDIR / 'hanken-500.ttf'), 22)
    f3 = ImageFont.truetype(str(FONTDIR / 'hanken-400.ttf'), 28)
    d.text((72, 170), 'HabVero', font=f1, fill=ink)
    d.text((78, 340), 'C U K R Á S Z   K E L L É K E K', font=f2, fill=ink)
    d.line((78, 398, 600, 398), fill=line, width=1)
    d.text((78, 424), 'Sopron, Torna utca 2.', font=f3, fill=ink)
    d.rectangle((W - 504 + 18, 18, W - 18, H - 18), outline=(0xFB, 0xF7, 0xF2), width=1)
    c.save(out / 'og-image.jpg', 'JPEG', quality=86, optimize=True, progressive=True)


FONTDIR = Path(__file__).resolve().parent / 'ttf'

if __name__ == '__main__':
    main()
