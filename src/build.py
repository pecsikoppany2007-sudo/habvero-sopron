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
V = 5
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
<meta name="theme-color" content="#FBF7F2">
<meta name="format-detection" content="telephone=no">
<link rel="icon" href="{asset('/favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="{asset('/apple-touch-icon.png')}">
<link rel="preload" href="/fonts/noto-serif-display-latin-200-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/noto-serif-display-latin-300-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/hanken-grotesk-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/hanken-grotesk-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>{extra}
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

def home(t):
    L = t['lang']
    fbbtn = btn(FB, tx(t, t['cta2']), 'secondary', t['cta2_aria'], True)

    # Kínálat: vízszintes galéria (asztali), telefonon egymás alatt
    panels = []
    for i, name in enumerate(t['rows'], 1):
        slot = ['', 'kinalat-1-kellekek', 'kinalat-2-alapanyagok', 'kinalat-3-dekoracio'][i]
        alts = t['row_alts'][i - 1]
        main_ = img(slot, [400, 640, 960], 960, 1200, alts[0], '(min-width: 1100px) 30vw, 92vw')
        ths = ''.join(f'<figure class="hz__th" data-tile-in>{img(f"kinalat-{i}-{x}", [400, 640], 640, 800, alts[j + 1], "(min-width: 1100px) 11vw, 30vw")}</figure>'
                      for j, x in enumerate('abc'))
        panels.append(f"""        <article class="hz__panel" data-hz-panel>
          <div class="hz__txt">
            <p class="hz__num" aria-hidden="true">0{i}<span>/03</span></p>
            <h3 class="hz__name" data-anim="lines">{tx(t, name)}</h3>
            <p>{tx(t, t['row_txt'][i - 1])}</p>
          </div>
          <figure class="hz__main" data-tile-in><div class="hz__par" data-par>{main_}</div></figure>
          <div class="hz__ths">{ths}</div>
        </article>""")
    panels = '\n'.join(panels)

    # Torták és sütik: 5 kép + záró kártya a 3D gyűrűn
    alk = [('alkotas-1', 680), ('alkotas-2', 852), ('alkotas-3', 680), ('alkotas-4', 852), ('alkotas-5', 680)]
    cards = []
    for i, (slot, h) in enumerate(alk):
        cards.append(f'          <li class="rg__card" style="--i:{i}"><div class="rg__face">'
                     + img(slot, [400, 680], 680, h, t['alk_alts'][i], '(min-width: 1100px) 20vw, 52vw')
                     + '</div></li>')
    cards.append(f"""          <li class="rg__card rg__card--cta" style="--i:5"><div class="rg__face">
            <p>{tx(t, t['alk_p2'])}</p>
            <p class="rg__links"><a class="tl" href="{IG}" target="_blank" rel="noopener" aria-label="{e(t['ig_aria'])}">{e(t['ig_link'])}</a><a class="tl" href="{FB}" target="_blank" rel="noopener" aria-label="{e(t['fb_aria'])}">{e(t['fb_link'])}</a></p>
          </div></li>""")
    cards = '\n'.join(cards)

    days = []
    for i, (d, h) in enumerate(t['days']):
        dow = (i + 1) % 7  # JS getDay(): 0 = vasárnap
        days.append(f'<tr data-day="{dow}"><th scope="row"><i class="hours__sq" aria-hidden="true"></i>{e(d)}<span class="hours__today" hidden>{e(t["today"])}</span></th><td>{e(h)}</td></tr>')
    days = ''.join(days)

    mark = ''.join(f'<span class="mk__l" style="--i:{i}">{c}</span>' for i, c in enumerate('HabVero'))
    brands = ['Callebaut', 'Decora', 'Silikomart', 'Fractal Colors', 'Cake Masters']
    bset = ''.join(f'<li>{b}</li><li class="mq__sq" aria-hidden="true"></li>' for b in brands)
    secs = ['top', 'bolt', 'kinalat', 'alkotasok', 'kartya', 'latogatas']
    sx = ''.join(f'<li><a href="#{s}" tabindex="-1" data-sx="{s}"><i></i><span>{e(n)}</span></a></li>' for s, n in zip(secs, t['idx']))
    ring_h = ''.join(f'<span class="rg__w rg__w--{k + 1}" aria-hidden="true">{e(w)}</span>' for k, w in enumerate(t['ring_words']))

    body = f"""
<body class="pg pg--home">
{header(t, 'home', True)}
<nav class="sx" aria-hidden="true"><ol role="list">{sx}</ol></nav>
<p class="edge" aria-hidden="true"><span>{e(t['edge_place'])}</span><span class="edge__sq"></span><span data-clock>--:--:--</span><span class="edge__sq"></span><span data-open><span data-open-text></span></span></p>
<main id="main" class="main">

  <section id="top" class="hero" data-section="top" aria-labelledby="h-top">
    <div class="hero__stage" data-hero-stage>
      <figure class="hero__photo" data-hero-photo>
        <picture>
          <source media="(orientation: portrait) and (max-width: 1099px)" srcset="{asset('/img/hero-bolt-tall-640.webp')} 640w, {asset('/img/hero-bolt-tall-864.webp')} 864w" sizes="100vw">
          <img src="{asset('/img/hero-bolt-wide-1400.webp')}" srcset="{asset('/img/hero-bolt-wide-800.webp')} 800w, {asset('/img/hero-bolt-wide-1400.webp')} 1400w, {asset('/img/hero-bolt-wide-2048.webp')} 2048w" sizes="100vw" width="2048" height="1152" alt="{e(t['hero_alt'])}" decoding="async" fetchpriority="high" data-hero-img>
        </picture>
      </figure>
      <div class="mz" aria-hidden="true" data-mosaic></div>
      <div class="hero__shade" aria-hidden="true"></div>
    </div>
    <div class="hero__body">
      <div class="hero__row wrap">
        <h1 id="h-top" class="hero__h1" data-anim="lines">{tx(t, t['h1'])}</h1>
        <div class="hero__info">
          <p class="hero__lede" data-anim="fade">{tx(t, t['lede'])}</p>
          <p class="hero__addr" data-anim="fade">{tx(t, t['addr_line'])}<br><span class="open open--hero" data-open hidden><i class="open__sq" aria-hidden="true"></i><span data-open-text></span></span></p>
          <p class="sr">{tx(t, t['hours_short'])}</p>
          <div class="cta" data-anim="fade">
            {btn(MAPS, tx(t, t['cta1']), 'primary', t['cta1'] + ' (' + t['newtab'] + ')', True)}
            <div class="cta__ask">{fbbtn}</div>
          </div>
        </div>
      </div>
      <p class="hero__mark" aria-hidden="true"><span class="mk">{mark}</span></p>
    </div>
    <p class="hero__count" aria-hidden="true"><span data-count>000</span><span class="hero__count-l">{e(t['loading'])}</span></p>
  </section>

  <section class="mq" aria-label="{e(t['brands_label'])}" data-marquee>
    <div class="mq__track" data-mq-track><ul class="mq__set" role="list">{bset}</ul><ul class="mq__set" role="list" aria-hidden="true">{bset}</ul></div>
  </section>

  <section id="bolt" class="sec st" data-section="bolt" data-flow aria-label="{e(t['idx'][1])}">
    <div class="flow-dim" aria-hidden="true"></div>
    <div class="wrap st__in">
      <p class="st__p" data-words>{tx(t, t['stmt'])}</p>
      <figure class="st__pic st__pic--a" data-par-y="-0.12">{img('kinalat-1-b', [400, 640], 640, 800, t['row_alts'][0][2], '(min-width: 1100px) 16vw, 40vw')}</figure>
      <figure class="st__pic st__pic--b" data-par-y="0.1">{img('kinalat-2-a', [400, 640], 640, 800, t['row_alts'][1][1], '(min-width: 1100px) 13vw, 34vw')}</figure>
    </div>
  </section>

  <section id="kinalat" class="sec hz" data-section="kinalat" data-hz aria-labelledby="h-kinalat">
    <div class="hz__pin" data-hz-pin>
      <div class="hz__track" data-hz-track>
        <header class="hz__head">
          <h2 id="h-kinalat" class="h2 hz__h2" data-anim="lines">{tx(t, t['h2_kinalat'])}</h2>
          <p>{tx(t, t['kin_p2'])}</p>
          <div class="cta">{fbbtn}</div>
        </header>
{panels}
      </div>
      <div class="hz__bar" aria-hidden="true"><i data-hz-bar></i></div>
    </div>
  </section>

  <section id="alkotasok" class="sec rg" data-section="alkotasok" data-ring aria-labelledby="h-alkotasok">
    <div class="rg__pin" data-ring-pin>
      <h2 id="h-alkotasok" class="rg__h"><span class="sr">{e(t['h2_alkotasok'])}</span>{ring_h}</h2>
      <div class="rg__view" data-ring-view>
        <ul class="rg__ring" role="list" data-ring-el>
{cards}
        </ul>
      </div>
      <p class="rg__intro wrap">{tx(t, t['alk_p1'])}</p>
    </div>
  </section>

  <section id="kartya" class="sec kt" data-section="kartya" aria-labelledby="h-kartya">
    <div class="kt__band" data-kt>
      <div class="kt__tiles" aria-hidden="true" data-kt-tiles></div>
      <div class="wrap kt__in">
        <div class="kt__txt">
          <h2 id="h-kartya" class="h2" data-anim="lines">{tx(t, t['h2_kartya'])}</h2>
          <p>{tx(t, t['kar_p1'])}</p>
          <p>{tx(t, t['kar_p2'])}</p>
          <p><a class="tl" href="{IG}" target="_blank" rel="noopener" aria-label="{e(t['ig_aria'])}">{e(t['ig_link'])}</a></p>
        </div>
        <figure class="kt__img" data-tilt><div class="kt__card">{img('kartya-polc', [560, 840], 840, 560, t['kar_alt'], '(min-width: 1100px) 40vw, 92vw')}</div></figure>
      </div>
    </div>
  </section>

  <section id="latogatas" class="sec visit" data-section="latogatas" data-flow aria-labelledby="h-latogatas">
    <div class="flow-dim" aria-hidden="true"></div>
    <div class="wrap visit__in">
      <div class="visit__txt">
        <h2 id="h-latogatas" class="h2" data-anim="lines">{tx(t, t['h2_latogatas'])}</h2>
        <address class="nap"><span class="nap__name">{e(t['nap_name'])}</span><br>{tx(t, t['nap_addr'])}</address>
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
      <figure class="visit__img" data-pix>{img('latogatas-bolt', [800, 1400, 2048], 2048, 1152, t['visit_alt'], '(min-width: 1100px) 50vw, 92vw')}<canvas class="visit__cv" aria-hidden="true"></canvas></figure>
    </div>
  </section>

</main>
{footer(t, 'home')}
{i18n_json(t)}
</body>
</html>
"""
    pre = (f'\n<link rel="preload" as="image" href="{asset("/img/hero-bolt-tall-640.webp")}" imagesrcset="{asset("/img/hero-bolt-tall-640.webp")} 640w, {asset("/img/hero-bolt-tall-864.webp")} 864w" '
           f'imagesizes="100vw" media="(orientation: portrait) and (max-width: 1099px)" fetchpriority="high">'
           f'\n<link rel="preload" as="image" href="{asset("/img/mozaik-200.webp")}" media="(min-width: 700px)">'
           f'\n<link rel="preload" as="image" href="{asset("/img/mozaik-120.webp")}" media="(max-width: 699px)">'
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
