"""HabVero: oldalak generálása a szótárból (src/szotar.py) a site/ mappába.
Futtatás: python3 -I src/build.py   (a /home/claude/habvero mappából)
Eszköz-verzió: V (minden css/js/kép URL ?v=V). Domain: SITE (élesítéskor átírni, és a noindex-et levenni, lásd build-jegyzet).
"""
import json, math, re, sys
from pathlib import Path
from html import escape

sys.path.insert(0, str(Path(__file__).resolve().parent))
from szotar import T, MAPS, FB, IG, ASK

ROOT = Path(__file__).resolve().parent.parent / 'site'
SITE = 'https://habvero-sopron.netlify.app'   # [?] éles domain a tulajdonostól
V = 6
NOINDEX = True                                # demó: noindex; élesítéskor False + netlify.toml X-Robots-Tag törlése
LANGS = ['hu', 'de', 'en']


def e(s):
    return escape(s, quote=True)


def hu_nbsp(s):
    """nbsp a névelő után, és a házszám a közterülettel marad (web-motion-lessons)."""
    s = re.sub(r'(^|[\s(„])(a|az|A|Az|s)\s', lambda m: m.group(1) + m.group(2) + ' ', s)
    s = s.replace('utca 2', 'utca 2').replace('9400 Sopron', '9400 Sopron')
    return s


def tx(t, s):
    s = hu_nbsp(s) if t['lang'] == 'hu' else s.replace('utca 2', 'utca 2').replace('9400 Sopron', '9400 Sopron')
    out = e(s)
    # a tulajdonostól érkező hiányzó adat jól látható jelölése
    out = re.sub(r'\[([^\]]+)\]', r'<mark class="todo">[\1]</mark>', out)
    return out


def rosette(R, n=None, rot=-math.pi / 2, cx=0.0, cy=0.0, dec=2):
    """dizajn.md 4.3: habrozetta spirál. rot=-90°: a spirál a tetején kezdődik (ide fut be a vonal)."""
    n = n or max(120, int(R * 12))
    pts = []
    for i in range(n + 1):
        t = i / n
        th = t * 2.5 * 2 * math.pi
        r = R * (1 - 0.8 * t) * (0.82 + 0.18 * math.cos(8 * th))
        pts.append((cx + r * math.cos(th + rot), cy + r * math.sin(th + rot)))
    f = f'{{:.{dec}f}}'
    return 'M' + ' L'.join(f.format(x) + ' ' + f.format(y) for x, y in pts)


def ros_svg(R, cls, pad=1.5):
    s = R + pad
    return (f'<svg class="{cls}" viewBox="{-s:.1f} {-s:.1f} {2*s:.1f} {2*s:.1f}" width="{2*s:.0f}" height="{2*s:.0f}" aria-hidden="true" focusable="false">'
            f'<path d="{rosette(R, n=160, dec=2)}"/></svg>')


def asset(p):
    return f'{p}?v={V}'


def img(slot, widths, w, h, alt, sizes, cls='', lazy=True, extra=''):
    srcset = ', '.join(f'{asset(f"/img/{slot}-{x}.webp")} {x}w' for x in widths)
    return (f'<img{" class=" + chr(34) + cls + chr(34) if cls else ""} src="{asset(f"/img/{slot}-{widths[0]}.webp")}" srcset="{srcset}" sizes="{sizes}" '
            f'width="{w}" height="{h}" alt="{e(alt)}"{" loading=" + chr(34) + "lazy" + chr(34) if lazy else ""} decoding="async"{extra}>')


def dc(inner, ratio, extra_attr='', cap=''):
    """Mélység-kártya váz (dizajn.md 5.): .dc > .dc__card > mat, img, frame, cap. A mozgás a 13-as animátoré."""
    return (f'<div class="dc" data-depth{extra_attr}><div class="dc__card">'
            f'<div class="dc__mat" aria-hidden="true"></div>'
            f'<div class="dc__img slot slot--{ratio}">{inner}</div>'
            f'<div class="dc__frame" aria-hidden="true"><i class="t"></i><i class="r"></i><i class="b"></i><i class="l"></i></div>'
            f'{cap}</div></div>')


def empty_slot(ratio, label):
    return (f'<div class="dc" data-depth data-empty><div class="dc__card">'
            f'<div class="dc__mat" aria-hidden="true"></div>'
            f'<div class="dc__img slot slot--{ratio} slot--empty" aria-hidden="true">{ros_svg(12, "slot__ros")}'
            f'<span class="slot__lbl">{e(label)}</span></div>'
            f'<div class="dc__frame" aria-hidden="true"><i class="t"></i><i class="r"></i><i class="b"></i><i class="l"></i></div>'
            f'</div></div>')


def btn(href, label, kind='primary', aria=None, ext=False, small=False, attrs=''):
    a = f' aria-label="{e(aria)}"' if aria else ''
    x = ' target="_blank" rel="noopener"' if ext else ''
    cls = f'btn btn--{kind}' + (' btn--sm' if small else '')
    return f'<a class="{cls}" href="{href}"{a}{x} data-magnet{attrs}><span class="btn__t">{label}</span></a>'


# ---------------------------------------------------------------- közös részek

def alt_links(page):
    """page: 'home' | 'legal' | 'privacy'"""
    out = []
    for l in LANGS:
        out.append(f'<link rel="alternate" hreflang="{l}" href="{SITE}{T[l][page]}">')
    out.append(f'<link rel="alternate" hreflang="x-default" href="{SITE}{T["hu"][page]}">')
    return '\n'.join(out)


GATE = """<script>
/* Kapuzás (dizajn.md 12.): .rich / .touch / .still a <html>-en, első festés előtt. Gyökér-jelzők előtaggal (web-motion-lessons). */
(function(d,w){var h=d.documentElement;h.classList.remove('no-js');
function q(s){return !!(w.matchMedia&&w.matchMedia(s).matches)}
var rm=q('(prefers-reduced-motion: reduce)'),sd=!!(navigator.connection&&navigator.connection.saveData),fine=q('(hover: hover) and (pointer: fine)'),gl=false,soft=false;
try{var c=d.createElement('canvas'),g=c.getContext('webgl2')||c.getContext('webgl');if(g){gl=true;var x=g.getExtension('WEBGL_debug_renderer_info');soft=/swiftshader|llvmpipe|software/i.test(x?String(g.getParameter(x.UNMASKED_RENDERER_WEBGL)):'');var lc=g.getExtension('WEBGL_lose_context');lc&&lc.loseContext()}}catch(err){}
var m=(rm||sd||!gl||(soft&&!fine))?'still':((fine&&!soft)?'rich':'touch');h.classList.add(m);if(soft)h.classList.add('is-gpu-soft');
if(m!=='still'&&!location.hash){h.classList.add('intro-on');w.__hvIntroFallback=setTimeout(function(){if(!h.classList.contains('intro-started')){h.classList.remove('intro-on');h.classList.add('no-intro')}},3500)}else{h.classList.add('no-intro')}
})(document,window);
</script>"""


def head(t, title, desc, page, canonical, jsonld=None, extra=''):
    og_loc_alt = ''.join(f'<meta property="og:locale:alternate" content="{T[l]["locale"]}">' for l in LANGS if l != t['lang'])
    ld = f'\n<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False, separators=(",", ":"))}</script>' if jsonld else ''
    return f"""<!doctype html>
<html lang="{t['lang']}" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
{'<meta name="robots" content="noindex, nofollow">' if NOINDEX else ''}
<link rel="canonical" href="{SITE}{canonical}">
{alt_links(page) if page else ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="HabVero Cukrász Kellékek">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{SITE}{canonical}">
<meta property="og:image" content="{SITE}/img/og-image.jpg?v={V}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{e(t['og_alt'])}">
<meta property="og:locale" content="{t['locale']}">{og_loc_alt}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#FFF6EE">
<meta name="format-detection" content="telephone=no">
<link rel="icon" href="{asset('/favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="{asset('/apple-touch-icon.png')}">
<link rel="preload" href="/fonts/fredoka-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/fredoka-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin>{extra}
{GATE}
<link rel="stylesheet" href="{asset('/css/tokens.css')}">
<link rel="stylesheet" href="{asset('/css/style.css')}">
<style>.still .ft{{position:relative}}</style>
<script type="module" src="{asset('/js/main.js')}"></script>{ld}
</head>"""


def header(t, page, on_home):
    pre = '' if on_home else t['home']
    langs = []
    for l, name in (('hu', 'Magyar'), ('de', 'Deutsch'), ('en', 'English')):
        cur = ' aria-current="true"' if l == t['lang'] else ''
        langs.append(f'<li><a href="{T[l][page]}" hreflang="{l}" lang="{l}" title="{name}" aria-label="{l.upper()}, {name}"{cur}>{l.upper()}</a></li>')
    return f"""<a class="skip" href="#main">{tx(t, t['skip'])}</a>
<header class="hd" data-hd>
  <div class="hd__in">
    <a class="hd__brand" href="{t['home']}" aria-label="{e(t['home_label'])}"><span class="hd__mark">HabVero</span><span class="hd__sub">{e(t['brand_sub'])}</span></a>
    <nav class="hd__nav" id="menu" aria-label="{e(t['menu_label'])}" data-menu>
      <ul class="hd__menu" role="list">
        <li><a href="{pre}#kinalat" data-menu-link>{tx(t, t['m1'])}</a></li>
        <li><a href="{pre}#alkotasok" data-menu-link>{tx(t, t['m2'])}</a></li>
        <li><a href="{pre}#latogatas" data-menu-link>{tx(t, t['m3'])}</a></li>
      </ul>
      <ul class="lang" role="list" aria-label="{e(t['lang_label'])}">{''.join(langs)}</ul>
      <p class="open open--menu" data-open hidden><i class="open__sq" aria-hidden="true"></i><span data-open-text></span></p>
    </nav>
    <p class="open open--hd" data-open hidden><i class="open__sq" aria-hidden="true"></i><span data-open-text></span></p>
    {btn(MAPS, e(t['route']), 'primary', t['route_aria'], True, True, ' data-hd-cta')}
    <button class="hd__toggle" type="button" aria-expanded="false" aria-controls="menu" data-menu-toggle><span data-menu-l="open">{e(t['menu_open'])}</span><span data-menu-l="close" hidden>{e(t['menu_close'])}</span></button>
  </div>
</header>"""


def footer(t, page):
    langs = ' '.join(
        f'<li><a href="{T[l][page]}" hreflang="{l}" lang="{l}"{" aria-current=" + chr(34) + "true" + chr(34) if l == t["lang"] else ""}>{n}</a></li>'
        for l, n in (('hu', 'Magyar'), ('de', 'Deutsch'), ('en', 'English')))
    hours = '<br>'.join(tx(t, h) for h in t['ft_hours'])
    return f"""<footer class="ft" data-curtain>
  <div class="ft__in wrap">
    <div class="ft__cols">
      <div class="ft__col ft__col--brand">
        <img class="ft__logo" src="{asset('/img/logo-kor-192.webp')}" srcset="{asset('/img/logo-kor-96.webp')} 96w, {asset('/img/logo-kor-192.webp')} 192w" sizes="96px" width="96" height="96" alt="HabVero Cukrász Kellékek" loading="lazy" decoding="async">
        <p>{tx(t, t['ft_tag'])}</p>
      </div>
      <div class="ft__col">
        <p>{tx(t, t['ft_addr'])}</p>
        <p>{hours}</p>
      </div>
      <div class="ft__col">
        <ul class="ft__links" role="list">
          <li><a class="tl" href="{FB}" target="_blank" rel="noopener" aria-label="{e(t['fb_aria'])}">Facebook</a></li>
          <li><a class="tl" href="{IG}" target="_blank" rel="noopener" aria-label="{e(t['ig_aria'])}">Instagram</a></li>
          <li><a class="tl" href="{t['legal']}">{e(t['legal_name'])}</a></li>
          <li><a class="tl" href="{t['privacy']}">{e(t['privacy_name'])}</a></li>
        </ul>
      </div>
    </div>
    <div class="ft__bar">
      <p>{e(t['copy'])}</p>
      <ul class="lang lang--full" role="list" aria-label="{e(t['lang_label'])}">{langs}</ul>
    </div>
  </div>
  <p class="ft__mark" aria-hidden="true">{"".join(f'<span style="--i:{i}">{c}</span>' for i, c in enumerate("HabVero"))}</p>
</footer>"""


def i18n_json(t):
    keys = ['open_now_17', 'open_now_12', 'closed_today', 'closed_tomorrow', 'closed_monday', 'menu_open', 'menu_close']
    return f'<script type="application/json" id="i18n">{json.dumps({k: t[k] for k in keys}, ensure_ascii=False)}</script>'


def store_ld(t):
    return {
        '@context': 'https://schema.org',
        '@graph': [
            {'@type': 'Store', '@id': f'{SITE}/#bolt', 'name': 'HabVero Cukrász Kellékek',
             'description': t['store_desc'], 'url': f'{SITE}{t["home"]}',
             'image': f'{SITE}/img/og-image.jpg', 'logo': f'{SITE}/img/logo-kor-192.webp',
             'address': {'@type': 'PostalAddress', 'streetAddress': 'Torna utca 2.', 'addressLocality': 'Sopron',
                         'postalCode': '9400', 'addressCountry': 'HU'},
             'openingHoursSpecification': [
                 {'@type': 'OpeningHoursSpecification', 'dayOfWeek': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], 'opens': '09:00', 'closes': '17:00'},
                 {'@type': 'OpeningHoursSpecification', 'dayOfWeek': 'Saturday', 'opens': '09:00', 'closes': '12:00'}],
             'sameAs': [IG]},
            {'@type': 'WebSite', '@id': f'{SITE}/#web', 'name': 'HabVero Cukrász Kellékek', 'url': f'{SITE}/',
             'inLanguage': ['hu', 'de', 'en']},
            {'@type': 'WebPage', '@id': f'{SITE}{t["home"]}#oldal', 'url': f'{SITE}{t["home"]}', 'name': t['title'],
             'inLanguage': t['lang'], 'isPartOf': {'@id': f'{SITE}/#web'}, 'about': {'@id': f'{SITE}/#bolt'}},
        ]}


# ---------------------------------------------------------------- főoldal

def sticker(n, cls, w, h, extra=''):
    return f'<img class="stk {cls}" src="{asset(f"/img/matrica-{n}.webp")}" width="{w}" height="{h}" alt="" decoding="async" loading="lazy"{extra}>'


def home(t):
    L = t['lang']
    fbbtn = btn(FB, tx(t, t['cta2']), 'secondary', t['cta2_aria'], True)
    S = {'giraffe': (326, 574), 'jar': (283, 574), 'letters': (584, 354), 'rings': (584, 494), 'swirl': (584, 420), 'teddy': (418, 574), 'bottles': (486, 574)}
    st = lambda n, cls, d='': sticker(n, cls, *S[n], f' data-depth="{d}"' if d else '')

    # Kínálat: három egymásra csúszó, döntött kártya, mindegyiken egy kiugró matrica
    cards = []
    for i, name in enumerate(t['rows'], 1):
        slot = ['', 'kinalat-1-kellekek', 'kinalat-2-alapanyagok', 'kinalat-3-dekoracio'][i]
        alts = t['row_alts'][i - 1]
        main_ = img(slot, [400, 640, 960], 960, 1200, alts[0], '(min-width: 1100px) 26vw, 80vw')
        ths = ''.join(f'<figure class="kc__th">{img(f"kinalat-{i}-{x}", [400, 640], 640, 800, alts[j + 1], "(min-width: 1100px) 9vw, 26vw")}</figure>'
                      for j, x in enumerate('abc'))
        sk = ['', 'rings', 'bottles', 'teddy'][i]
        cards.append(f"""        <li class="kc kc--{i}" data-kc>
          <article class="kc__in">
            <div class="kc__txt">
              <p class="kc__num" aria-hidden="true">{i}</p>
              <h3 class="kc__name" data-pop>{tx(t, name)}</h3>
              <p>{tx(t, t['row_txt'][i - 1])}</p>
              <div class="kc__ths">{ths}</div>
            </div>
            <figure class="kc__main">{main_}</figure>
            {st(sk, 'kc__stk')}
          </article>
        </li>""")
    cards = '\n'.join(cards)

    # Torták és sütik: szétszórt polaroidok + cetli
    alk = [('alkotas-1', 680), ('alkotas-2', 852), ('alkotas-3', 680), ('alkotas-4', 852), ('alkotas-5', 680)]
    pols = ''.join(f'<li class="pol" style="--i:{i}" data-pol><figure class="pol__in">{img(slot, [400, 680], 680, h, t["alk_alts"][i], "(min-width: 1100px) 19vw, 46vw")}</figure></li>'
                   for i, (slot, h) in enumerate(alk))
    pols += f"""<li class="pol pol--note" style="--i:5" data-pol><div class="pol__note"><p>{tx(t, t['alk_p2'])}</p>
            <p class="pol__links"><a class="tl" href="{IG}" target="_blank" rel="noopener" aria-label="{e(t['ig_aria'])}">{e(t['ig_link'])}</a><a class="tl" href="{FB}" target="_blank" rel="noopener" aria-label="{e(t['fb_aria'])}">{e(t['fb_link'])}</a></p></div></li>"""

    days = []
    for i, (d, h) in enumerate(t['days']):
        dow = (i + 1) % 7
        days.append(f'<tr data-day="{dow}"><th scope="row">{e(d)}<span class="hours__today" hidden>{e(t["today"])}</span></th><td>{e(h)}</td></tr>')
    days = ''.join(days)

    mark = ''.join(f'<span class="ch" style="--i:{i}">{c}</span>' for i, c in enumerate('HabVero'))
    brands = ['Callebaut', 'Decora', 'Silikomart', 'Fractal Colors', 'Cake Masters']
    bset = ''.join(f'<li>{b}</li><li class="tp__dot" aria-hidden="true">✿</li>' for b in brands)
    pills = ''.join(f'<li class="pill pill--{k % 5}" data-pill>{e(p)}</li>' for k, p in enumerate(t['pills']))
    fields = ''.join(f'<li class="lc__f" style="--i:{k}"><i class="lc__st" aria-hidden="true"></i></li>' for k in range(10))
    drip = '<svg class="drip" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 0H1440V40C1410 40 1404 58 1396 78C1388 98 1366 98 1360 78C1352 52 1340 40 1300 40C1240 40 1236 96 1210 104C1184 112 1174 70 1168 52C1160 40 1140 40 1100 40C1050 40 1046 62 1040 70C1032 82 1014 82 1008 66C1000 46 990 40 930 40C880 40 872 76 866 100C858 128 830 128 824 100C818 68 806 40 760 40C700 40 694 58 688 66C680 78 664 78 658 62C650 44 640 40 590 40C540 40 532 84 526 108C518 136 488 136 482 106C476 74 466 40 420 40C370 40 364 56 358 64C350 74 334 72 330 58C324 42 310 40 260 40C214 40 206 70 200 86C192 108 168 108 162 84C156 60 146 40 100 40C60 40 54 52 48 60C40 70 26 70 22 56C18 44 10 40 0 40Z"/></svg>'

    body = f"""
<body class="pg pg--home">
{header(t, 'home', True)}
<div class="curtain" aria-hidden="true" data-curtain-intro><div class="curtain__in"><p class="curtain__mk">{mark}</p></div>{drip}</div>
<main id="main" class="main">

  <section id="top" class="hero" data-section="top" aria-labelledby="h-top">
    <canvas class="sprinkles" aria-hidden="true" data-sprinkles></canvas>
    <div class="wrap hero__in">
      <div class="hero__copy">
        <h1 id="h-top" class="hero__h1" data-pop>{tx(t, t['h1'])}</h1>
        <p class="hero__lede" data-rise>{tx(t, t['lede'])}</p>
        <p class="hero__addr" data-rise>{tx(t, t['addr_line'])}</p>
        <div class="cta" data-rise>
          {btn(MAPS, tx(t, t['cta1']), 'primary', t['cta1'] + ' (' + t['newtab'] + ')', True)}
          <div class="cta__ask">{fbbtn}</div>
        </div>
      </div>
      <div class="hero__vis" data-hero-vis>
        <figure class="arch" data-rise>
          <picture>
            <source media="(orientation: portrait) and (max-width: 1099px)" srcset="{asset('/img/hero-bolt-wide-phone-640.webp')} 640w, {asset('/img/hero-bolt-wide-phone-960.webp')} 960w" sizes="80vw">
            <img src="{asset('/img/hero-bolt-wide-phone-960.webp')}" srcset="{asset('/img/hero-bolt-wide-phone-640.webp')} 640w, {asset('/img/hero-bolt-wide-phone-960.webp')} 960w, {asset('/img/hero-bolt-wide-phone-1229.webp')} 1229w" sizes="(min-width: 1100px) 38vw, 80vw" width="1229" height="1536" alt="{e(t['hero_alt'])}" decoding="async" fetchpriority="high">
          </picture>
        </figure>
        <div class="badge" data-open-badge><svg viewBox="0 0 200 200" aria-hidden="true" focusable="false"><defs><path id="bp" d="M100 100m-74 0a74 74 0 1 1 148 0a74 74 0 1 1-148 0"/></defs><text><textPath href="#bp" data-open-ring>HabVero · Sopron · Torna utca 2. · HabVero · Sopron · Torna utca 2. ·</textPath></text></svg><span class="badge__c"><span class="open open--badge" data-open hidden><span data-open-text></span></span></span></div>
        {st('giraffe', 'hs hs--1', '0.9')}{st('jar', 'hs hs--2', '0.5')}{st('letters', 'hs hs--3', '1.2')}{st('swirl', 'hs hs--4', '0.7')}
      </div>
    </div>
  </section>

  <section class="tp" aria-label="{e(t['brands_label'])}" data-tapes>
    <div class="tp__band tp__band--a"><div class="tp__track" data-tape="1"><ul class="tp__set" role="list">{bset}</ul><ul class="tp__set" role="list" aria-hidden="true">{bset}</ul></div></div>
    <div class="tp__band tp__band--b" aria-hidden="true"><div class="tp__track" data-tape="-1"><ul class="tp__set" role="list">{bset}</ul><ul class="tp__set" role="list">{bset}</ul></div></div>
  </section>

  <section id="bolt" class="sec polc" data-section="bolt" aria-labelledby="h-polc">
    <div class="wrap polc__in">
      <div class="polc__head">
        <h2 id="h-polc" class="h2 big" data-pop>{tx(t, t['h2_polc'])}</h2>
        <p data-rise>{tx(t, t['stmt'])}</p>
      </div>
      <div class="jar" data-jar><ul class="jar__pills" role="list">{pills}</ul></div>
    </div>
  </section>

  <section id="kinalat" class="sec kin" data-section="kinalat" aria-labelledby="h-kinalat">
    <div class="wrap kin__head">
      <h2 id="h-kinalat" class="h2 big" data-pop>{tx(t, t['h2_kinalat'])}</h2>
      <p data-rise>{tx(t, t['kin_p2'])}</p>
      <div class="cta" data-rise>{fbbtn}</div>
    </div>
    <ol class="kin__stack wrap" role="list">
{cards}
    </ol>
  </section>

  <section id="alkotasok" class="sec tbl" data-section="alkotasok" aria-labelledby="h-alkotasok">
    <div class="wrap tbl__head">
      <h2 id="h-alkotasok" class="h2 big" data-pop>{tx(t, t['h2_alkotasok'])}</h2>
      <p data-rise>{tx(t, t['alk_p1'])}</p>
    </div>
    <div class="wrap"><ul class="tbl__pile" role="list" data-pile>{pols}</ul></div>
  </section>

  <section id="kartya" class="sec lc" data-section="kartya" aria-labelledby="h-kartya">
    <div class="wrap lc__in">
      <div class="lc__txt">
        <h2 id="h-kartya" class="h2 big" data-pop>{tx(t, t['h2_kartya'])}</h2>
        <p data-rise>{tx(t, t['kar_p1'])}</p>
        <p data-rise>{tx(t, t['kar_p2'])}</p>
        <p data-rise><a class="tl" href="{IG}" target="_blank" rel="noopener" aria-label="{e(t['ig_aria'])}">{e(t['ig_link'])}</a></p>
      </div>
      <div class="lc__vis">
        <div class="lcard" data-lcard aria-hidden="true">
          <p class="lcard__brand">HabVero</p><p class="lcard__sub">{e(t['h2_kartya'])} · {e(t['card_fields'])}</p>
          <ol class="lcard__f" role="list">{fields}</ol>
        </div>
        <figure class="lc__photo">{img('kartya-polc', [560, 840], 840, 560, t['kar_alt'], '(min-width: 1100px) 22vw, 60vw')}</figure>
      </div>
    </div>
  </section>

  <section id="latogatas" class="sec visit" data-section="latogatas" aria-labelledby="h-latogatas">
    <div class="wrap">
      <div class="visit__card">
        <div class="visit__txt">
          <h2 id="h-latogatas" class="h2 big" data-pop>{tx(t, t['h2_latogatas'])}</h2>
          <address class="nap" data-rise><span class="nap__name">{e(t['nap_name'])}</span><br>{tx(t, t['nap_addr'])}</address>
          <table class="hours" data-hours>
            <caption class="sr">{e(t['hours_caption'])}</caption>
            <thead class="sr"><tr><th scope="col">{e(t['day_col'])}</th><th scope="col">{e(t['open_col'])}</th></tr></thead>
            <tbody>{days}</tbody>
          </table>
          <div class="cta">
            {btn(MAPS, tx(t, t['maps_open']), 'primary', t['maps_open'] + ' (' + t['newtab'] + ')', True)}
            <div class="cta__ask">{fbbtn}</div>
          </div>
        </div>
        <figure class="visit__img arch arch--b">{img('latogatas-bolt', [800, 1400], 2048, 1152, t['visit_alt'], '(min-width: 1100px) 40vw, 86vw')}</figure>
        {st('teddy', 'visit__stk', '0.6')}
      </div>
    </div>
  </section>

</main>
{footer(t, 'home')}
{i18n_json(t)}
</body>
</html>
"""
    pre = (f'\n<link rel="preload" href="/fonts/cherry-bomb-one-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>'
           f'\n<link rel="stylesheet" href="{asset("/css/home.css")}">')
    return head(t, t['title'], t['desc'], 'home', t['home'], store_ld(t), pre) + body



# ---------------------------------------------------------------- jogi oldalak, 404

def legal_page(t, kind):
    if kind == 'legal':
        rows = ''.join(f'<div class="kv"><dt>{tx(t, k)}</dt><dd>{tx(t, v) if v else tx(t, t["todo"])}</dd></div>' for k, v in t['imp_rows'])
        main = f"""<h1 class="h2">{tx(t, t['imp_h1'])}</h1>
      <p>{tx(t, t['imp_intro'])}</p>
      <dl class="kvs">{rows}</dl>
      <h2 class="h3">{e(t['imp_host'])}</h2>
      <dl class="kvs">
        <div class="kv"><dt>Netlify, Inc.</dt><dd>101 2nd Street, San Francisco, CA 94105, USA<br><a class="tl" href="mailto:privacy@netlify.com">privacy@netlify.com</a> · <a class="tl" href="https://www.netlify.com" target="_blank" rel="noopener">netlify.com</a></dd></div>
      </dl>"""
        title, desc = t['imp_title'], t['imp_h1'] + ', HabVero Cukrász Kellékek, 9400 Sopron, Torna utca 2.'
    else:
        secs = ''.join(f'<h2 class="h3">{tx(t, h)}</h2>' + ''.join(f'<p>{tx(t, p)}</p>' for p in ps) for h, ps in t['priv_sections'])
        main = f"""<h1 class="h2">{e(t['priv_h1'])}</h1>
      {secs}
      <p class="legal__valid">{tx(t, t['priv_valid'])}</p>"""
        title, desc = t['priv_title'], t['priv_h1'] + ', HabVero Cukrász Kellékek, 9400 Sopron, Torna utca 2.'
    ld = {'@context': 'https://schema.org', '@type': 'WebPage', 'name': title, 'url': f'{SITE}{t[kind]}', 'inLanguage': t['lang'],
          'isPartOf': {'@id': f'{SITE}/#web'}, 'about': {'@id': f'{SITE}/#bolt'}}
    return head(t, title, desc, kind, t[kind], ld) + f"""
<body class="pg pg--legal">
{header(t, kind, False)}
<main id="main" class="main">
  <article class="sec legal">
    <div class="wrap legal__in">
      {main}
    </div>
  </article>
</main>
{footer(t, kind)}
{i18n_json(t)}
</body>
</html>
"""


def page404(t):
    return head(t, t['nf_title'], t['nf_p'], None, t['p404']) + f"""
<body class="pg pg--404">
{header(t, 'home', False)}
<main id="main" class="main">
  <section class="sec nf">
    <div class="wrap nf__in">
      {ros_svg(32, 'nf__ros')}
      <h1 class="h2">{tx(t, t['nf_h1'])}</h1>
      <p>{tx(t, t['nf_p'])}</p>
      <div class="cta">{btn(t['home'], tx(t, t['nf_btn']), 'primary')}</div>
    </div>
  </section>
</main>
{footer(t, 'home')}
{i18n_json(t)}
</body>
</html>
"""


def write(rel, html):
    p = ROOT / rel.lstrip('/')
    if rel.endswith('/'):
        p = p / 'index.html'
    p.parent.mkdir(parents=True, exist_ok=True)
    html = re.sub(r'\n{3,}', '\n\n', html).replace('\n\n<', '\n<')
    p.write_text(html, encoding='utf-8')
    return p


def sitemap():
    urls = []
    for page in ('home', 'legal', 'privacy'):
        for l in LANGS:
            alts = ''.join(f'<xhtml:link rel="alternate" hreflang="{x}" href="{SITE}{T[x][page]}"/>' for x in LANGS)
            alts += f'<xhtml:link rel="alternate" hreflang="x-default" href="{SITE}{T["hu"][page]}"/>'
            urls.append(f'<url><loc>{SITE}{T[l][page]}</loc><lastmod>2026-10-30</lastmod>{alts}</url>')
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
            'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + '\n'.join(urls) + '\n</urlset>\n')


def main():
    for l in LANGS:
        t = T[l]
        write(t['home'], home(t))
        write(t['legal'], legal_page(t, 'legal'))
        write(t['privacy'], legal_page(t, 'privacy'))
        write(t['p404'], page404(t))
    (ROOT / 'sitemap.xml').write_text(sitemap(), encoding='utf-8')
    (ROOT / 'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n', encoding='utf-8')
    fav = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-36 -36 72 72"><rect x="-36" y="-36" width="72" height="72" fill="#FBF7F2"/>'
           f'<path d="{rosette(30, n=220, dec=1)}" fill="none" stroke="#5A4640" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>')
    (ROOT / 'favicon.svg').write_text(fav, encoding='utf-8')
    print('ok')


if __name__ == '__main__':
    main()
