// Edge language router for the dibby landing.
//
// The site is a static, pre-rendered multilingual build (dist/, one folder per
// locale) deployed on Cloudflare Workers static assets. This file is the Worker
// entrypoint ("main" in wrangler.jsonc) and runs in front of the assets
// (run_worker_first); we serve static files through env.ASSETS.fetch().
//
// Only the root "/" makes a language decision, based on, in order:
//   1. an explicit saved choice  — cookie `dibby_lang` (set by the picker / applyLang)
//   2. the visitor's browser/system language — Accept-Language header
//   3. English — the default, served straight from the root asset
//
// Everything else (/ru/, /de/, images, css, js) is passed through to static
// assets untouched. Locale sub-pages already carry hreflang + JSON-LD, so
// crawlers and shared links keep working exactly as before.

// our locale code -> URL path (mirrors URLCODE/langPath in build.cjs)
const LOCALE_PATH = {
  en: "/",
  ru: "/ru/",
  zh_CN: "/zh-cn/",
  zh_TW: "/zh-tw/",
  ja: "/ja/",
  ko: "/ko/",
  de: "/de/",
  fr: "/fr/",
  es: "/es/",
  pt: "/pt/",
  pl: "/pl/",
  uk: "/uk/",
  it: "/it/",
  id: "/id/",
  tr: "/tr/",
  vi: "/vi/",
  th: "/th/",
  hi: "/hi/",
  ar: "/ar/",
};

// Map a single BCP-47 tag (e.g. "pt-BR", "zh-Hant", "en-US") to one of our codes.
function matchTag(tag) {
  if (!tag) return null;
  tag = tag.toLowerCase();
  // Chinese needs script/region disambiguation (Simplified vs Traditional).
  if (tag.startsWith("zh")) {
    return /hant|tw|hk|mo/.test(tag) ? "zh_TW" : "zh_CN"; // zh / zh-cn / zh-sg / zh-hans -> Simplified
  }
  const direct = { en: "en", ru: "ru", uk: "uk", ja: "ja", ko: "ko", de: "de", fr: "fr", es: "es", pt: "pt", pl: "pl", it: "it", id: "id", tr: "tr", vi: "vi", th: "th", hi: "hi", ar: "ar" };
  return direct[tag.split("-")[0]] || null;
}

// Parse an Accept-Language header into our best-matching locale code (honours q-weights).
function fromAcceptLanguage(header) {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      let q = 1;
      for (const p of params) {
        const m = p.trim().match(/^q=([\d.]+)$/);
        if (m) q = parseFloat(m[1]);
      }
      return { tag: tag.trim(), q };
    })
    .filter((x) => x.tag && x.tag !== "*")
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const hit = matchTag(tag);
    if (hit) return hit;
  }
  return null;
}

function readCookie(header, name) {
  if (!header) return null;
  const m = header.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}

// Security headers applied to every response at the edge (the static assets layer
// sets none of these). CSP allows our self-hosted CSS/fonts/images and the inline
// boot script (no third-party scripts, no analytics, no user input on the page).
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; " +
    "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; " +
    "upgrade-insecure-requests",
};

// HTML must always revalidate (cheap via ETag) so a redeploy is seen immediately;
// other static assets (css/js/fonts/images) may sit in cache a while. Filenames
// are not content-hashed yet, so we revalidate rather than mark immutable.
function isHtml(url, res) {
  const ct = (res.headers.get("Content-Type") || "").toLowerCase();
  if (ct.includes("text/html")) return true;
  return url.pathname === "/" || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
}

function harden(res, url) {
  const h = new Headers(res.headers);
  for (const k in SECURITY_HEADERS) h.set(k, SECURITY_HEADERS[k]);
  h.delete("X-Powered-By");
  if (isHtml(url, res)) {
    h.set("Cache-Control", "public, max-age=0, must-revalidate");
  } else if (res.ok) {
    h.set("Cache-Control", "public, max-age=86400, must-revalidate");
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 0. canonical host: collapse www -> apex with a permanent redirect (one
    //    canonical URL per page, no duplicate-content split for SEO).
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return new Response(null, {
        status: 301,
        headers: Object.assign({ Location: url.toString() }, SECURITY_HEADERS),
      });
    }

    // 1. Only the root makes a language decision; everything else is a plain asset.
    if (url.pathname === "/") {
      // a. explicit saved choice wins (set when the visitor uses the picker)
      const saved = readCookie(request.headers.get("Cookie"), "dibby_lang");
      let code = saved && LOCALE_PATH[saved] ? saved : null;

      // b. otherwise detect from the browser / system languages
      if (!code) code = fromAcceptLanguage(request.headers.get("Accept-Language"));

      // c. default is English, which lives at the root — only redirect for the rest
      if (code && code !== "en" && LOCALE_PATH[code]) {
        return new Response(null, {
          status: 302, // per-request decision -> must NOT be cached as permanent
          headers: Object.assign(
            {
              Location: LOCALE_PATH[code],
              Vary: "Accept-Language, Cookie",
              "Cache-Control": "no-store",
            },
            SECURITY_HEADERS
          ),
        });
      }
      // en / no match: fall through and serve the English root asset
    }

    return harden(await env.ASSETS.fetch(request), url);
  },
};
