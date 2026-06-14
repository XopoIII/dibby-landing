// Edge Worker for the SHORT domain dib.by.
//
// Replaces the plain "/* -> dibbyplay.com 301" redirect (Redirect Rule) so that
// the authorized-sellers files are served DIRECTLY at dib.by with a 200 — no
// cross-domain redirect — while every other path keeps 301-ing to the canonical
// site. This lets ad-tech crawlers (Yandex РСЯ and other DSPs) read
//   https://dib.by/app-ads.txt
// even if dib.by is the developer site listed in the app store.
//
// The files themselves still live in the main build (landing/app-ads.txt etc.,
// published at dibbyplay.com); we reverse-proxy them here so there is a single
// source of truth and the two domains can never drift out of sync.
//
// Deploy: `npx wrangler deploy` from this folder, then add a route dib.by/* to
// this Worker and REMOVE/disable the existing dib.by Redirect Rule (Redirect
// Rules run before Workers, so the rule would otherwise pre-empt this code).

const CANONICAL = "https://dibbyplay.com";
const PASSTHROUGH = new Set(["/app-ads.txt", "/ads.txt"]);

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Serve the sellers files inline (200) from the canonical origin.
    if (PASSTHROUGH.has(url.pathname)) {
      const upstream = await fetch(CANONICAL + url.pathname, { cf: { cacheTtl: 300 } });
      // Only cache a genuine 200. A 404/5xx (missing or broken upstream file) must
      // NOT be cached for 5 minutes — surface it with no-store so a fix propagates.
      if (!upstream.ok) {
        return new Response(null, {
          status: upstream.status,
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
        });
      }
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300",
        },
      });
    }

    // Everything else: permanent redirect to the canonical site (path + query).
    return Response.redirect(CANONICAL + url.pathname + url.search, 301);
  },
};
