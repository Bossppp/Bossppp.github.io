# bosspee.com

Personal site of Peerawit (Boss) Seemamahawong. Plain HTML, CSS and JavaScript,
served by GitHub Pages straight from this branch. There is no framework and no
build step, and the site sets no cookies and loads nothing from third parties.

[![Tests](https://github.com/Bossppp/Bossppp.github.io/actions/workflows/test.yml/badge.svg)](https://github.com/Bossppp/Bossppp.github.io/actions/workflows/test.yml)

## Run it

```sh
npm start        # python3 -m http.server 8080, then open http://localhost:8080
npm test         # node --test, no install needed
```

The JavaScript is loaded as ES modules, so the page has to be served over HTTP.
Opening `index.html` from the file system shows the content without the
interactive parts.

## How it is put together

```
index.html            all content, readable without JavaScript
styles.css            one stylesheet, organised in cascade layers
404.html              served by GitHub Pages for any missing URL
js/
  main.js             entry point, starts each feature on its own
  theme-init.js       applies a saved theme before first paint
  theme.js            light/dark toggle
  nav.js              highlights the section being read
  timeline.js         month-by-month degree timeline
  lightbox.js         image viewer in a native <dialog>
  copy.js             copy-to-clipboard buttons
  dom.js              element builder that only ever writes text
  lab/
    network.js        the homelab described as data
    hostname.js       input validation
    resolver.js       decides what happens to a request (pure)
    doh.js            DNS-over-HTTPS client
    tracer.js         turns a trace into DOM
tests/                node:test suites for the pure modules
cv/                   the CV as a web page, and the PDF printed from it
scripts/render.mjs    prints the CV to PDF and renders the social image
```

A few decisions worth knowing about:

- **HTML first.** Every section is ordinary markup. JavaScript only enhances
  it: the timeline is drawn from the `<time>` elements already on the page,
  and project thumbnails are plain links that the image viewer upgrades.
- **Logic is kept away from the DOM.** `resolver.js`, `hostname.js`,
  `timeline.js` and the response parser in `doh.js` are pure functions, which
  is why they can be tested with nothing but Node.
- **One colour declaration per token.** Themes use `light-dark()`, with a
  light-only fallback for browsers that lack it.
- **A strict Content-Security-Policy.** Scripts, styles, fonts and images come
  from this origin only. The single allowed outside connection is the DNS
  lookup described below.

## The request tracer

The Homelab project includes a small model of my home network. You pick where
the device is (home Wi-Fi, away on Tailscale, or away with no VPN), type a
hostname, and see hop by hop what would answer it:

| Name | At home or on the VPN | Away, no VPN |
| --- | --- | --- |
| A service under the internal domain | Pi-hole answers with the proxy, the proxy terminates TLS and passes it on | Does not exist (split-horizon DNS) |
| Any other name under the internal domain | Reaches the proxy, which has no host for it | Does not exist |
| A blocklisted name | Pi-hole answers `0.0.0.0` | Resolves normally, nothing filters it |
| Anything else | Forwarded to a public resolver | Looked up directly |

The domain and addresses in `js/lab/network.js` are examples. Names that get
forwarded are resolved for real through Cloudflare's DNS-over-HTTPS JSON API,
so the last hops show a live answer. If that request fails, the trace says so
instead of inventing one.

Each run owns an `AbortController`. Starting a new trace aborts the previous
one, including its timers and its DNS request, so a slow answer can never
overwrite a newer result.

## Editing content

Everything visible is in `index.html`. Two things are derived from it:

- **Degree timeline.** Add a `data-timeline-period="Label"` attribute to an
  experience entry and it appears on the strip, using the entry's two
  `<time datetime="YYYY-MM">` elements as start and end.
- **Image viewer.** Any link inside an element with `data-gallery` opens in
  the viewer. Several links in one gallery can be paged through.

Project images live in `assets/img/` as WebP, in two sizes: `name-sm.webp`
(720 px wide, used as the thumbnail) and `name.webp` (up to 1600 px).

## The CV

`cv/index.html` is the source. The PDF next to it is that page printed to A4.

```sh
npm install --no-save playwright && npx playwright install chromium   # once

npm run build:cv                                         # the public copy
npm run build:cv -- --phone "08x-xxx-xxxx" --out ~/cv.pdf   # a copy with a phone number
npm run build:og                                         # assets/og.jpg
```

The public copy has no phone number, and the script refuses to write one into
the repository. It also fails if the CV grows past one page.

## Credits

Typefaces are self-hosted under the SIL Open Font License:
[Bai Jamjuree](https://github.com/cadsondemak/Bai-Jamjuree) and
[Anuphan](https://github.com/cadsondemak/Anuphan) by Cadson Demak, and
[IBM Plex Mono](https://github.com/IBM/plex).
