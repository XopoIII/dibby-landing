# dibby — landing page

A cozy landing page for the game **dibby** (one-finger rescue arcade). Localized into 19 languages.

## Running (development)
Open `landing/index.html` in a browser. No build step is needed for development — it's plain HTML/CSS/JS.
(If fonts/images don't load when opening the file directly, start a local server from the project root, e.g. `python3 -m http.server`, and open `http://localhost:8000/landing/`.)

## Production build (SEO/GEO)
```
node build.cjs
```
Generates the `dist/` folder — that's what you deploy (not `landing/`).

**Why:** the landing page is localized with client-side JS (`i18n.js`). AI crawlers (GPTBot, PerplexityBot, ClaudeBot, etc.) **do not execute JavaScript**, and Baidu barely does. Without pre-rendering they only see the raw English HTML, and the other 10 locales don't exist as indexable content. `build.cjs` "bakes" one static file per language (`/`, `/ru/`, `/ja/`, `/zh-cn/`, `/zh-tw/`, `/ko/`, `/de/`, `/fr/`, `/es/`, `/pt/`, `/pl/`) with the text already substituted, localized `<title>`/`<meta>`, `hreflang`, JSON-LD (`VideoGame`+`MobileApplication`, `Organization`, `FAQPage`), plus `sitemap.xml`, `robots.txt`, `llms.txt`. The FAQ, friends gallery, and store badges are emitted as raw HTML (previously built only via JS — invisible to crawlers). JS i18n stays as a UX layer: the language switcher navigates between the pre-built URLs.

**Domains:** the main site is `https://dibbyplay.com` (set in `SITE_URL` in `build.cjs` — it controls canonical, OG, JSON-LD, sitemap, and robots all at once). The short brand domain **`dib.by` does a 301 redirect to `dibbyplay.com`** — use it in social media/ads. The redirect setup and ready-made configs (Cloudflare / Netlify / Vercel / registrar forwarding) are in **[DEPLOY-REDIRECT.md](DEPLOY-REDIRECT.md)** and the `deploy/` folder. After deploying, add `dibbyplay.com` to Google Search Console and submit `sitemap.xml`.

`dist/` is in `.gitignore` — it's a build artifact, not committed; generate it at deploy time.

## Structure
```
landing/
  index.html     ← page (markup + all logic: i18n, player, gallery)
  styles.css     ← styles (palette taken from the game)
  i18n.js        ← translations for 19 languages + names of 36 friends
assets/
  fonts/         ← m6x11 (pixel) + Golos Text
  friends/       ← 36 friend sprites
  mascot/        ← mascot animation frames
  screens/       ← game screenshots (main, menu) — fallback for the player
  icon.png       ← favicon
```

## How to show gameplay video
Right now the phone frame cycles through real screenshots (`assets/screens/`).
Once a recording is available:
1. Drop in `assets/gameplay.mp4` (optionally `assets/gameplay.webm` too for a smaller size).
2. In `landing/index.html` find `var HAS_VIDEO = false;` and set it to `true`.
   The player shows the video automatically; screenshots remain as a fallback if the video fails to load.

## Launch links (fill in before publishing)
At the start of the script in `landing/index.html` there's a `LINKS` object:
```js
var LINKS = {
  preregIos:     "", // App Store "coming soon"/pre-order
  preregAndroid: "", // Google Play pre-registration
  discord:       "", // community invite
  youtube:       "",
  x:             ""
};
```
While a value is empty, the corresponding button smoothly scrolls to the hero CTA (`#get`), so nothing looks broken. Footer social icons with no link are hidden automatically. Once real URLs are available, just paste them here: the main "Notify me" CTA, store badges, and `Get` links pick them up automatically.

The domain in the meta tags (`canonical`, `og:*`, `twitter:*`) is already set to `https://dibbyplay.com/`; `build.cjs` rewrites them per locale at build time. If the domain changes, edit `SITE_URL` in `build.cjs` (plus the placeholders in `landing/index.html` that it relies on).

## Notes
- **Languages**: switcher in the top right. Default is English. The choice is remembered. All 19 languages have a complete set of keys.
- **Hero**: a single variant (cozy split). The `hero 1/2/3` switcher is gone — #hero1 is chosen and locked in, with the friends row and a "Coming soon" status line.
- **Friends gallery**: 6 are revealed, the other 30 are silhouettes ("???"). Which ones are revealed is the `REVEAL` array in `index.html`. Below the counter is a teaser for the hidden friends and a CTA.
