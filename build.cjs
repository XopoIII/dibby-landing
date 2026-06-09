#!/usr/bin/env node
/* ============================================================================
   dibby landing — static pre-render build.

   WHY: the page localizes via client-side JS (i18n.js). AI crawlers (GPTBot,
   PerplexityBot, ClaudeBot, …) and most non-Google engines do NOT run JS, so
   only the raw English HTML is ever seen and the other 10 locales are
   invisible. This script "bakes" one static HTML file per language with the
   text already in the markup, plus hreflang, JSON-LD, sitemap, robots, llms.txt.

   USAGE:  node build.cjs        → writes ./dist/ (deploy that folder)
   The JS i18n stays as a UX layer; the language picker navigates between the
   baked URLs (see DIBBY_PATHS injected below).

   TODO before going live: set SITE_URL to the real domain.
   ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");

// ---- config ---------------------------------------------------------------
const SITE_URL = "https://dibbyplay.com"; // canonical site (no trailing slash). dib.by is a short domain that 301-redirects here
const ROOT = __dirname;
const SRC = path.join(ROOT, "landing");
const ASSETS_SRC = path.join(ROOT, "assets");
const OUT = path.join(ROOT, "dist");

// Load the translation tables exactly like the browser does.
global.window = {};
require(path.join(SRC, "i18n.js"));
const { LANGS, FRIEND_SLUGS, FRIEND_NAMES, I18N } = global.window;

// ---- legal / utility pages ------------------------------------------------
// Required to publish: privacy (both stores), support (Apple 1.5),
// legal/Impressum (EU DSA trader info). Content lives in landing/legal/<code>.json
// — one file per locale, so the pages are fully localized like the rest of the
// site. Publisher details + tokens below are the single source of truth; the
// build substitutes {{TOKENS}} into every page.
//
// ⚠️  BEFORE GOING LIVE: fill every [...] placeholder in PUBLISHER.
const PUBLISHER = {
  name:    "Malashenkov Anton", // legal name of the individual (trader)
  email:   "support@dib.by",  // public support + privacy contact
  address: "",                // not shown on the website — provided to the stores for the EU DSA display
  phone:   "",                // none — provided to the stores for the EU DSA display
  updated: "2026-06-09"       // privacy-policy "last updated" date
};
const YANDEX_PRIVACY = "https://yandex.com/legal/confidential/";
// Public profiles for the brand entity (App Store / Google Play / Discord / X / YouTube …).
// Fill these as channels go live — they feed Organization/VideoGame `sameAs`, which is how
// search + AI engines tie the unsearched name "dibby" to a recognised entity. Keep in sync
// with LINKS in landing/index.html.
const SAMEAS = [];
const LEGAL_SLUGS = ["privacy", "support", "legal"];
const LEGAL_DIR = path.join(SRC, "legal");

// load every landing/legal/<code>.json (filename base === our internal LANGS code)
const LEGAL = {};
for (const f of fs.readdirSync(LEGAL_DIR)) {
  if (!f.endsWith(".json")) continue;
  LEGAL[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(LEGAL_DIR, f), "utf8"));
}
const LEGAL_LANGS = LANGS.map(l => l.code).filter(c => LEGAL[c]);

// merge each locale's footer labels + cookie-banner strings into the i18n table
// so the baked footer (data-i18n="linkPrivacy" …) and cookie banner are
// localized in every language straight from the per-locale legal JSON.
for (const code of LEGAL_LANGS) {
  const extra = Object.assign({}, LEGAL[code].footer, LEGAL[code].cookie);
  for (const k in extra) if (I18N[code] && I18N[code][k] == null) I18N[code][k] = extra[k];
}

// replace {{TOKENS}} (publisher details, links) for a given locale
function fillTokens(str, code) {
  const privacyUrl = (code === "en" ? "/" : "/" + URLCODE[code] + "/") + "privacy/";
  // optional fields: when blank, drop their fragment cleanly (works across all
  // locales — the localized label/punctuation is matched generically).
  if (!PUBLISHER.address) {
    str = str.replace(/\s*\{\{PUBLISHER_ADDRESS\}\}<br>/g, "");                  // own-line address
    str = str.replace(/[,،、，]?\s*\{\{PUBLISHER_ADDRESS\}\}/g, ""); // ", address" + leftovers
  }
  if (!PUBLISHER.phone) {
    str = str.replace(/<br>\s*[^<\n]*\{\{PUBLISHER_PHONE\}\}/g, "");             // "<br> label: phone"
    str = str.replace(/\{\{PUBLISHER_PHONE\}\}/g, "");
  }
  return str
    .split("{{PUBLISHER_NAME}}").join(escText(PUBLISHER.name))
    .split("{{PUBLISHER_EMAIL}}").join(escText(PUBLISHER.email))
    .split("{{PUBLISHER_ADDRESS}}").join(escText(PUBLISHER.address))
    .split("{{PUBLISHER_PHONE}}").join(escText(PUBLISHER.phone))
    .split("{{YANDEX_PRIVACY}}").join(YANDEX_PRIVACY)
    .split("{{PRIVACY_URL}}").join(privacyUrl)
    .split("{{UPDATED}}").join(escText(PUBLISHER.updated));
}

// per-language: URL sub-path, hreflang/lang code, writing system class
const URLCODE = { en: "", ru: "ru", zh_CN: "zh-cn", zh_TW: "zh-tw", ja: "ja", ko: "ko", de: "de", fr: "fr", es: "es", pt: "pt", pl: "pl", uk: "uk", it: "it", id: "id", tr: "tr", vi: "vi", th: "th", hi: "hi", ar: "ar" };
const HREFLANG = { en: "en", ru: "ru", zh_CN: "zh-Hans", zh_TW: "zh-Hant", ja: "ja", ko: "ko", de: "de", fr: "fr", es: "es", pt: "pt", pl: "pl", uk: "uk", it: "it", id: "id", tr: "tr", vi: "vi", th: "th", hi: "hi", ar: "ar" };
// writing-system class (drives fonts + RTL in styles.css). Latin/Cyrillic locales omit it (default).
const SCRIPT_OF = { ja: "ja", zh_CN: "cjk", zh_TW: "cjk", ko: "cjk", th: "thai", hi: "deva", ar: "arab" };
const RTL = { ar: true };
// Open Graph locale (Facebook/og uses xx_YY, not BCP-47 hreflang).
const OGLOCALE = { en: "en_US", ru: "ru_RU", zh_CN: "zh_CN", zh_TW: "zh_TW", ja: "ja_JP", ko: "ko_KR", de: "de_DE", fr: "fr_FR", es: "es_ES", pt: "pt_PT", pl: "pl_PL", uk: "uk_UA", it: "it_IT", id: "id_ID", tr: "tr_TR", vi: "vi_VN", th: "th_TH", hi: "hi_IN", ar: "ar_AR" };
const REVEAL = ["pushok", "kvaki", "kotik", "utenok", "zaychik", "zvyozdochka"];
const CONFETTI = ["pushok", "kvaki", "kotik", "utenok", "zaychik", "zvyozdochka"];
const FAQ_PAIRS = [["q5", "a5"], ["q1", "a1"], ["q2", "a2"], ["q3", "a3"], ["q4", "a4"]];

const APPLE_SVG = '<svg viewBox="0 0 24 24"><path d="M16.4 12.7c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.6.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.5 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.5 2.2 2.6 2.1 1-.04 1.4-.7 2.7-.7s1.6.7 2.7.66c1.1-.02 1.8-1 2.5-2a9 9 0 001.1-2.3c-.02-.01-2.1-.8-2.1-3.2zM14.3 6.1c.6-.7 1-1.7.9-2.7-.8.03-1.9.5-2.5 1.3-.5.6-1 1.6-.9 2.6.9.07 1.8-.5 2.5-1.2z"/></svg>';
const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M3.6 2.3c-.2.2-.3.5-.3.9v17.6c0 .4.1.7.3.9l.1.1L13.5 12 3.7 2.2l-.1.1zM17 8.3l-2.4-1.4L5.6 16l9-5.2L17 9.4v-1.1zM4.7 21.3l9.9-9.3 2.4 1.4c.9.5.9 1.4 0 1.9l-2.4 1.4-9.9 4.6zM5.6 8L14.6 17 17 15.6c.9-.5.9-1.4 0-1.9L14.6 12 5.6 8z"/></svg>';

// the two distinct English description strings present in the <head> template
// (must match landing/index.html byte-for-byte so the per-locale split() below finds them)
const EN_DESC_LONG = "Cozy one-finger arcade for iOS & Android. Lower the rope past the rubble and carry a little friend home. Free to play — get a launch reminder.";
const EN_DESC_SHORT = "Cozy one-finger rope-rescue arcade. Lower the rope, save a little friend. Free — coming soon to iOS & Android.";
const EN_TITLE = "Cozy one-finger rope-rescue arcade — dibby";

// ---- helpers ---------------------------------------------------------------
const escText = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = s => escText(s).replace(/"/g, "&quot;");
const langPath = code => (code === "en" ? "/" : `/${URLCODE[code]}/`);
const absUrl = code => SITE_URL + langPath(code);

function storeBadges(t) {
  return (
    '<a class="store" href="#get" data-prereg="ios"><span class="store__soon">' + escText(t.soon) + "</span>" + APPLE_SVG +
    '<span class="store__txt"><span class="store__small">' + escText(t.downloadOn) + '</span><span class="store__big">' + escText(t.appstore) + "</span></span></a>" +
    '<a class="store" href="#get" data-prereg="android"><span class="store__soon">' + escText(t.soon) + "</span>" + PLAY_SVG +
    '<span class="store__txt"><span class="store__small">' + escText(t.getItOn) + '</span><span class="store__big">' + escText(t.playstore) + "</span></span></a>"
  );
}

function friendsGrid(names, assetPrefix) {
  const revealedIdx = REVEAL.map(s => FRIEND_SLUGS.indexOf(s)).filter(i => i >= 0);
  const isRevealed = {};
  revealedIdx.forEach(i => { isRevealed[i] = true; });
  const order = revealedIdx.concat(FRIEND_SLUGS.map((_, i) => i).filter(i => !isRevealed[i]));
  return order.map(i => {
    const found = !!isRevealed[i];
    const no = String(i + 1).padStart(2, "0");
    const name = names[i];
    return (
      '<div class="friend ' + (found ? "friend--found" : "friend--locked") + '">' +
      '<div class="friend__pic"><img class="pixelated" src="' + assetPrefix + "friends/" + FRIEND_SLUGS[i] + '.png" alt="' + (found ? escAttr(name) : "") + '" /></div>' +
      '<div class="friend__name">' + (found ? escText(name) : "???") + "</div>" +
      '<div class="friend__no">#' + no + "</div>" +
      "</div>"
    );
  }).join("");
}

function faqList(t) {
  return FAQ_PAIRS.map(([q, a], i) =>
    '<div class="faq-item">' +
    '<button class="faq-q" id="faq-q-' + i + '" aria-expanded="false" aria-controls="faq-a-' + i + '">' + escText(t[q]) + '<span class="chev" aria-hidden="true">+</span></button>' +
    '<div class="faq-a" id="faq-a-' + i + '" role="region" aria-labelledby="faq-q-' + i + '"><p>' + escText(t[a]) + "</p></div>" +
    "</div>"
  ).join("");
}

function confettiRow(assetPrefix) {
  return CONFETTI.map((s, i) =>
    '<img class="pixelated bob" style="animation-delay:' + (i * 0.3) + 's" src="' + assetPrefix + "friends/" + s + '.png" alt="" />'
  ).join("");
}

function hreflangLinks() {
  const links = LANGS.map(l => `<link rel="alternate" hreflang="${HREFLANG[l.code]}" href="${absUrl(l.code)}" />`);
  links.push(`<link rel="alternate" hreflang="x-default" href="${absUrl("en")}" />`);
  return links.join("\n");
}

// One @graph with @id-cross-linked nodes (Organization ← WebSite ← VideoGame + FAQPage).
// This entity model is what lets search/AI engines resolve "dibby" into a recognised thing.
function jsonLd(code, t) {
  const ORG_ID = SITE_URL + "/#org";
  const SITE_ID = SITE_URL + "/#website";
  const GAME_ID = SITE_URL + "/#game";
  const org = {
    "@type": "Organization",
    "@id": ORG_ID,
    name: "dibby",
    url: SITE_URL + "/",
    logo: { "@type": "ImageObject", url: SITE_URL + "/assets/icon.png", width: 1024, height: 1024 }
  };
  if (SAMEAS.length) org.sameAs = SAMEAS;
  const website = {
    "@type": "WebSite",
    "@id": SITE_ID,
    url: SITE_URL + "/",
    name: "dibby",
    inLanguage: HREFLANG[code],
    publisher: { "@id": ORG_ID }
  };
  const game = {
    "@type": ["VideoGame", "MobileApplication"],
    "@id": GAME_ID,
    name: "dibby",
    description: t.sub,
    applicationCategory: "GameApplication",
    genre: "Arcade",
    operatingSystem: "iOS, Android",
    gamePlatform: ["iOS", "Android"],
    inLanguage: HREFLANG[code],
    url: absUrl(code),
    image: SITE_URL + "/assets/screens/main.png",
    screenshot: ["gp-earth", "gp-water", "gp-crystal", "rescued", "finale", "friends-menu"]
      .map(s => SITE_URL + "/assets/screens/" + s + ".png"),
    datePublished: PUBLISHER.updated,
    dateModified: PUBLISHER.updated,
    isPartOf: { "@id": SITE_ID },
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/PreOrder" },
    publisher: { "@id": ORG_ID },
    author: { "@id": ORG_ID }
  };
  if (SAMEAS.length) game.sameAs = SAMEAS;
  const faq = {
    "@type": "FAQPage",
    "@id": absUrl(code) + "#faq",
    inLanguage: HREFLANG[code],
    isPartOf: { "@id": SITE_ID },
    mainEntity: FAQ_PAIRS.map(([q, a]) => ({
      "@type": "Question", name: t[q],
      acceptedAnswer: { "@type": "Answer", text: t[a] }
    }))
  };
  const graph = { "@context": "https://schema.org", "@graph": [org, website, game, faq] };
  return '<script type="application/ld+json">' + JSON.stringify(graph) + "</script>";
}

function dibbyConfigScript(code) {
  const paths = {};
  LANGS.forEach(l => { paths[l.code] = langPath(l.code); });
  return '<script>window.DIBBY_LANG=' + JSON.stringify(code) + ";window.DIBBY_PATHS=" + JSON.stringify(paths) + ";</script>";
}

// ---- per-language render ---------------------------------------------------
function renderLang(code, template) {
  const t = I18N[code];
  const names = FRIEND_NAMES[code] || FRIEND_NAMES.en;
  const isEn = code === "en";
  const depth = isEn ? 0 : 1;
  const assetPrefix = isEn ? "assets/" : "../assets/";
  const sitePrefix = isEn ? "" : "../";

  let h = template;

  // <html lang/data-script>
  h = h.replace('<html lang="en" data-script="latin">', `<html lang="${HREFLANG[code]}" data-script="${SCRIPT_OF[code] || "latin"}"${RTL[code] ? ' dir="rtl"' : ""}>`);

  // data-i18n text nodes (data-i18n is always the last attribute in this template)
  h = h.replace(/data-i18n="(\w+)"\s*>([\s\S]*?)<\//g, (m, key, _inner) => {
    const val = t[key];
    return val == null ? m : `data-i18n="${key}">${escText(val)}</`;
  });

  // JS-injected containers → bake real HTML so crawlers see it (JS rebuilds it identically for users)
  h = h.split('<div class="stores" data-stores></div>').join('<div class="stores" data-stores>' + storeBadges(t) + "</div>");
  h = h.replace('<div class="friends-grid" data-friends></div>', '<div class="friends-grid" data-friends>' + friendsGrid(names, assetPrefix) + "</div>");
  h = h.replace('<div class="faq-list" data-faq></div>', '<div class="faq-list" data-faq>' + faqList(t) + "</div>");
  h = h.replace('<div class="confetti-row" data-confetti></div>', '<div class="confetti-row" data-confetti>' + confettiRow(assetPrefix) + "</div>");
  h = h.replace('<div class="final-confetti" data-confetti2></div>', '<div class="final-confetti" data-confetti2>' + confettiRow(assetPrefix) + "</div>");

  // per-locale og:locale (Facebook uses xx_YY, not BCP-47). EN keeps the template's en_US.
  h = h.replace('<meta property="og:locale" content="en_US" />', `<meta property="og:locale" content="${OGLOCALE[code]}" />`);

  // localized <head> title + description (keep the hand-written English as-is)
  if (!isEn) {
    const title = `${t.kicker} — dibby`;   // front-load the localized genre, brand last
    const desc = `${t.sub} ${t.footerSoon}`;
    h = h.split(EN_TITLE).join(escAttr(title));
    h = h.split(EN_DESC_LONG).join(escAttr(desc));
    h = h.split(EN_DESC_SHORT).join(escAttr(desc));
  }

  // absolute URLs: image first (always site root), then canonical + og:url (per-locale)
  h = h.split('https://dibbyplay.com/assets/screens/main.png').join(SITE_URL + "/assets/screens/main.png");
  h = h.split('https://dibbyplay.com/"').join(absUrl(code) + '"');

  // relative paths by depth
  h = h.split('../assets/').join(assetPrefix);                 // icons, og fallbacks, inline ASSET var, etc.
  h = h.split('var ASSET = "assets/";').join('var ASSET = "' + assetPrefix + '";'); // fix only if the above turned it wrong
  h = h.replace('href="styles.css"', `href="${sitePrefix}styles.css"`);
  h = h.replace('<script src="i18n.js"></script>', dibbyConfigScript(code) + '\n<script src="' + sitePrefix + 'i18n.js"></script>');

  // hreflang + JSON-LD before </head>
  h = h.replace("</head>", hreflangLinks() + "\n" + jsonLd(code, t) + "\n</head>");

  // footer legal links → this locale's own /xx/privacy/ pages when we render
  // them; locales without a legal translation fall back to the English set.
  if (code !== "en" && LEGAL[code]) {
    const pre = "/" + URLCODE[code];
    h = h.split('href="/privacy/"').join('href="' + pre + '/privacy/"');
    h = h.split('href="/support/"').join('href="' + pre + '/support/"');
    h = h.split('href="/legal/"').join('href="' + pre + '/legal/"');
  }

  return h;
}

// ---- legal pages (privacy / support / legal) -------------------------------
// Standalone pages sharing the site chrome + styles.css. Root-absolute paths
// (these only ever exist in dist/, never opened as local files).
function renderLegalPage(code, slug) {
  const data = LEGAL[code];
  const page = data[slug];
  const home = code === "en" ? "/" : "/" + URLCODE[code] + "/";
  const lp = sub => home + sub + "/";
  const navLabel = s => escText(data[s].title);
  const updated = page.updated ? `<p class="legal-updated">${escText(fillTokens(page.updated, code))}</p>` : "";
  // reciprocal hreflang for this slug across every localized legal page + x-default
  const hreflang = LEGAL_LANGS.map(c => `<link rel="alternate" hreflang="${HREFLANG[c]}" href="${legalUrl(slug, c)}" />`).join("\n") +
    `\n<link rel="alternate" hreflang="x-default" href="${legalUrl(slug, "en")}" />`;
  // BreadcrumbList (unaffected by the 2025-26 FAQ rich-result deprecation, still renders in SERPs)
  const breadcrumb = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "dibby", item: SITE_URL + home },
      { "@type": "ListItem", position: 2, name: page.title, item: SITE_URL + lp(slug) }
    ]
  });
  return `<!DOCTYPE html>
<html lang="${HREFLANG[code]}" data-script="${SCRIPT_OF[code] || "latin"}"${RTL[code] ? ' dir="rtl"' : ""}>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${escText(page.title)} — dibby</title>
<meta name="theme-color" content="#bde8db" />
<link rel="icon" type="image/png" href="/assets/icon.png" />
<link rel="apple-touch-icon" href="/assets/icon.png" />
<link rel="canonical" href="${SITE_URL}${lp(slug)}" />
<meta name="robots" content="index,follow" />
${hreflang}
<script type="application/ld+json">${breadcrumb}</script>
<link rel="stylesheet" href="/styles.css" />
</head>
<body>
<header class="site-header">
  <div class="wrap">
    <a class="logo" href="${home}" aria-label="dibby">dibby</a>
    <nav class="nav" aria-label="Legal">
      <a href="${lp("privacy")}">${navLabel("privacy")}</a>
      <a href="${lp("support")}">${navLabel("support")}</a>
      <a href="${lp("legal")}">${navLabel("legal")}</a>
    </nav>
  </div>
</header>
<main class="legal-main">
  <div class="wrap legal">
    <h1 class="section-title">${escText(page.title)}</h1>
    ${updated}
    ${fillTokens(page.html, code).trim()}
    <p class="legal-back"><a href="${home}">${escText(data.back)}</a></p>
  </div>
</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-bottom">
      <p class="footer-made">${escText(PUBLISHER.name)}</p>
      <nav class="footer-links" aria-label="Legal">
        <a href="${lp("privacy")}">${navLabel("privacy")}</a>
        <a href="${lp("support")}">${navLabel("support")}</a>
        <a href="${lp("legal")}">${navLabel("legal")}</a>
      </nav>
    </div>
  </div>
</footer>
</body>
</html>
`;
}

// ---- sitemap / robots / llms ----------------------------------------------
const legalUrl = (slug, code) => SITE_URL + (code === "en" ? "/" : "/" + URLCODE[code] + "/") + slug + "/";

function sitemap() {
  const entry = (loc, altPairs) => {
    const alts = altPairs.map(([hl, href]) => `    <xhtml:link rel="alternate" hreflang="${hl}" href="${href}" />`).join("\n");
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${PUBLISHER.updated}</lastmod>\n${alts}\n  </url>`;
  };
  const urls = [];
  // home locales
  const homeAlts = LANGS.map(a => [HREFLANG[a.code], absUrl(a.code)]).concat([["x-default", absUrl("en")]]);
  LANGS.forEach(l => urls.push(entry(absUrl(l.code), homeAlts)));
  // legal / utility pages (privacy · support · legal), each localized with its own hreflang set
  LEGAL_SLUGS.forEach(slug => {
    const alts = LEGAL_LANGS.map(c => [HREFLANG[c], legalUrl(slug, c)]).concat([["x-default", legalUrl(slug, "en")]]);
    LEGAL_LANGS.forEach(c => urls.push(entry(legalUrl(slug, c), alts)));
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
}

function robots() {
  // Allow everyone, and explicitly name the AI answer-engines + search crawlers we welcome —
  // for a coming-soon launch both AI training and AI-search citation help discovery.
  const NAMED = [
    "Googlebot", "Bingbot", "DuckDuckBot", "YandexBot", "Applebot",
    "GPTBot", "OAI-SearchBot", "ChatGPT-User",
    "ClaudeBot", "Claude-SearchBot", "anthropic-ai",
    "PerplexityBot", "Perplexity-User",
    "Google-Extended", "Applebot-Extended", "Meta-ExternalAgent", "Amazonbot"
  ];
  const blocks = NAMED.map(ua => `User-agent: ${ua}\nAllow: /\n`).join("\n");
  return `User-agent: *\nAllow: /\n\n${blocks}\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

function llms() {
  return `# dibby\n\n> dibby — a cozy one-finger rope-rescue arcade game. Lower a rope with one finger, slip past falling rubble, and lift a little friend home to a growing camp. Free to play. Coming soon to iOS & Android.\n\nKey facts: one-finger controls; rescue 36 little friends (plus a few rare hidden ones); 30-second runs; speedrun-friendly magnet-rope; soft cozy art and music; 19 languages.\n\n## Pages\n- [Home](${SITE_URL}/): the offer, how to play, the 36 friends, why it's fun, and FAQ.\n- [Privacy Policy](${SITE_URL}/privacy/) · [Support](${SITE_URL}/support/) · [Legal](${SITE_URL}/legal/)\n`;
}

// ---- fs helpers ------------------------------------------------------------
function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === ".DS_Store") continue;
    if (e.name.endsWith(".ttf")) continue; // superseded by subset .woff2; don't ship the 215KB source
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

// ---- build -----------------------------------------------------------------
function build() {
  const template = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
  rmrf(OUT);
  fs.mkdirSync(OUT, { recursive: true });

  // shared static files
  copyDir(ASSETS_SRC, path.join(OUT, "assets"));
  fs.copyFileSync(path.join(SRC, "styles.css"), path.join(OUT, "styles.css"));
  fs.copyFileSync(path.join(SRC, "i18n.js"), path.join(OUT, "i18n.js"));

  // NOTE: the edge language router (worker.js) is NOT copied into dist anymore.
  // It's deployed as the Worker entrypoint via "main" in wrangler.jsonc; a
  // _worker.js inside the assets dir makes `wrangler deploy` refuse the upload.

  // one HTML per language
  for (const l of LANGS) {
    const html = renderLang(l.code, template);
    const dir = l.code === "en" ? OUT : path.join(OUT, URLCODE[l.code]);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
  }

  // legal/utility pages (EN at /privacy/, RU at /ru/privacy/, etc.)
  for (const code of LEGAL_LANGS) {
    for (const slug of LEGAL_SLUGS) {
      const dir = code === "en" ? path.join(OUT, slug) : path.join(OUT, URLCODE[code], slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "index.html"), renderLegalPage(code, slug));
    }
  }

  fs.writeFileSync(path.join(OUT, "sitemap.xml"), sitemap());
  fs.writeFileSync(path.join(OUT, "robots.txt"), robots());
  fs.writeFileSync(path.join(OUT, "llms.txt"), llms());

  console.log(`Built ${LANGS.length} locales → ${path.relative(ROOT, OUT)}/`);
  console.log(`Locales: ${LANGS.map(l => l.code === "en" ? "/" : "/" + URLCODE[l.code] + "/").join("  ")}`);
  console.log(`Legal pages: ${LEGAL_SLUGS.join(", ")} × ${LEGAL_LANGS.length} locales (${LEGAL_LANGS.join(" ")})`);
  if (SITE_URL.includes("example")) console.log("⚠  SITE_URL is still a placeholder — set the real domain in build.cjs before deploying.");
  if (JSON.stringify(PUBLISHER).includes("[")) console.log("⚠  PUBLISHER details still contain [placeholders] — fill them in the PUBLISHER block in build.cjs before store submission (EU DSA trader + Apple Guideline 1.5).");
}

build();
