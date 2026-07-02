/* ============================================================================
   Dibby Universe — game manifest. SINGLE SOURCE OF TRUTH for the landing.

   Both build.cjs (server pre-render) and the in-page client script read this.
   It is loaded the same way as i18n.js: in Node, `global.window={}` then
   `require("games.config.js")` exposes window.GAMES / window.STORES_BY_LANG;
   in the browser it's a plain <script> that sets the same globals.

   STORE MODEL: every game ships to the SAME set of stores as Dibby (the
   flagship). STORES_BY_LANG below is the one badge set, shared by all games.
   A game only lists the stores where it differs from the default — i.e. the
   ones that are already LIVE. Everything else defaults to {status:"soon"}
   (a "Soon" ribbon, inert link). To flip a store live after moderation:
   add it to that game's `liveStores` with status:"live" and the real href.
   ========================================================================== */
(function (root) {
  "use strict";

  /* ---- the five games ----------------------------------------------------
     status:  "live" → released, has at least one live store
              "soon" → submitted / in moderation; all badges show "Soon"
              "dev"  → still in development; hub teaser card only, no page
     page:    true → gets its own /<slug>/ page in every locale.
              false → appears only as a card on the universe hub.
     verb:    its place in the universe ("down / run / up / fly").
     friends: true → show the "36 little friends" gallery (the save-a-friend
              meta). Dibby + Dash share it; Chirp is a pure endless flyer.
     sections: which page blocks render, in order.
     cta:     store key for the primary "Play now" button (must be a live one).
              null → no live destination yet; CTA points at the store list.
     liveStores: per-store overrides — ONLY the stores that are already live.
              Any store in STORES_BY_LANG not listed here defaults to "soon".  */
  var GAMES = [
    {
      slug: "dibby",
      name: "Dibby",
      fullName: "Dibby: Rope Rescue",
      status: "live",
      page: true,
      verb: "down",
      genre: "Arcade",
      bundleId: "com.xopoiii.dibby",
      // OS platforms to advertise in JSON-LD (honest about what's playable NOW).
      // Dibby is playable now on RuStore (Android); iOS native + Yandex Games (Web) are soon.
      platforms: ["Android"],
      accent: "#bde8db",        // mint — the universe base colour
      accentDeep: "#9ed7c4",
      icon: "games/dibby/icon.png",
      screenDir: "screens/",                             // gameplay screens live under assets/screens/
      hero: "screens/gp-water",
      screens: ["gp-earth", "gp-water", "gp-crystal", "rescued", "finale", "friends-menu"],
      friends: true,
      sections: ["about", "how", "shots", "friends", "why", "faq", "final"],
      cta: "rustore",
      liveStores: {
        rustore:  { status: "live", href: "https://www.rustore.ru/catalog/app/com.xopoiii.dibby" }
      }
    },
    {
      slug: "dash",
      name: "Dibby Dash",
      fullName: "Dibby Dash: Cozy Runner",
      status: "soon",            // in moderation — all stores "Soon"
      page: true,
      verb: "run",
      genre: "Arcade",
      bundleId: "com.xopoiii.dibbydash",
      platforms: ["iOS", "Android"],   // target stores: App Store + Google Play (in review)
      accent: "#f2a33c",         // warm honey-amber — golden-hour road
      accentDeep: "#6e5c9e",     // dusk-purple secondary
      icon: "games/dash/icon.png",
      // one-tap lane runner; free, no IAP, no ads. Reuses the 36 friends.
      screenDir: "games/dash/screens/",
      hero: "games/dash/screens/02-meadow",
      // hero gameplay loop (Godot Movie Maker capture → ffmpeg). Only Dash has one;
      // games without `gameplay` fall back to the screenshot crossfade.
      gameplay: { mp4: "games/dash/dash-hero.mp4", poster: "games/dash/dash-hero-poster" },
      screens: ["02-meadow", "03-steppe", "04-dusk", "05-grove", "06-night", "07-wonder"],
      friends: true,
      // runner gets the genre-required Modes block (Campaign vs Endless)
      sections: ["about", "friends", "how", "modes", "shots", "why", "faq", "final"],
      cta: null,
      liveStores: {}             // nothing live yet
    },
    {
      slug: "chirp",
      name: "Dibby Chirp",
      fullName: "Dibby Chirp: Cozy Flyer",
      status: "soon",            // in moderation
      page: true,
      verb: "fly",
      genre: "Arcade",
      bundleId: "com.xopoiii.dibbychirp",
      platforms: ["iOS", "Android"],   // target stores: App Store + Google Play (in review)
      accent: "#f2c24b",         // warm yellow — the little chirp critter
      accentDeep: "#e0a92e",
      icon: "games/chirp/icon.png",
      // pure endless flyer: no friends gallery, HAS ads (never claim "no ads"),
      // offline, no IAP. Sky darkens blue → lavender → violet with depth.
      screenDir: "games/chirp/screens/",
      hero: "games/chirp/screens/03-glide",
      screens: ["01-home", "02-fly", "03-glide", "04-gap", "05-sky", "06-deep"],
      friends: false,
      // one-tap flyer → lean, hero-led page: Hero → About → Shots → Final.
      // genre convention: long pages hurt conversion; drop how/why/faq.
      sections: ["about", "shots", "final"],
      cta: null,
      liveStores: {}
    },
    {
      slug: "sling",
      name: "Dibby Sling",
      fullName: "Dibby Sling: Cozy Arcade",
      status: "soon",            // in moderation — all stores "Soon"
      page: true,
      verb: "up",
      genre: "Arcade",
      bundleId: "com.xopoiii.dibbysling",
      platforms: ["iOS", "Android"],   // target stores: App Store + Google Play (in review)
      accent: "#86cfe8",         // sky blue — the floating-island climb
      accentDeep: "#4f9fc9",
      icon: "games/sling/icon.png",
      // cozy slingshot arcade; friends you saved hold the rope, you fling the
      // next one up through floating islands. Reuses the 36 friends. HAS ads.
      screenDir: "games/sling/screens/",
      hero: "games/sling/screens/03-fling",
      screens: ["01-aim", "02-arc", "03-fling", "04-rescue", "05-tower", "06-offline"],
      friends: true,
      // slingshot gets the genre-required Modes block (Campaign vs Endless)
      sections: ["about", "friends", "how", "modes", "shots", "why", "faq", "final"],
      cta: null,
      liveStores: {}
    },
    {
      slug: "bloom",
      name: "Dibby Bloom",
      fullName: "Dibby Bloom: Cozy Arcade",
      status: "soon",            // in moderation — all stores "Soon"
      page: true,
      verb: "climb",
      genre: "Arcade",
      bundleId: "com.xopoiii.dibbybloom",
      platforms: ["iOS", "Android"],   // target stores: App Store + Google Play (in review)
      accent: "#f6a81f",         // honey gold — the rising-flood climb
      accentDeep: "#cf7d10",
      icon: "games/bloom/icon.png",
      // cozy one-tap rhythm climber; build honey arches up, outrun the flood,
      // free a caged friend at the top. Reuses the 36 friends. HAS ads.
      screenDir: "games/bloom/screens/",
      hero: "games/bloom/screens/03-flood",
      screens: ["01-build", "02-climb", "03-flood", "04-honey", "05-rescue", "06-offline"],
      friends: true,
      sections: ["about", "friends", "how", "shots", "why", "faq", "final"],
      cta: null,
      liveStores: {}
    }
  ];

  /* ---- store badge order per locale --------------------------------------
     The ONE badge set, shared by every game (all games ship to the same
     stores as Dibby). The final visible set for a page is just this list;
     each badge's live/soon state comes from the game's `liveStores`.

     App Store + Google Play are the universal pair → they're the default for
     EVERY locale (any locale not listed below falls back to ["ios","android"]).
     The two web/regional stores are gated:
       • RuStore — Russia only, so it rides on the `ru` locale alone.
       • Yandex Games — the one web build; shown where Yandex actually has reach:
         RU/CIS (ru, uk) plus its strong international markets (tr, ar, hi, id, vi).
     Every other locale (en, pt, es, it, de, fr, pl, zh_CN, zh_TW, ja, ko, th)
     stays on the App Store + Google Play default — no RuStore, no Yandex.      */
  var STORES_BY_LANG = {
    ru: ["ios", "android", "rustore", "yandex"],
    uk: ["ios", "android", "yandex"],
    tr: ["ios", "android", "yandex"],
    ar: ["ios", "android", "yandex"],
    hi: ["ios", "android", "yandex"],
    id: ["ios", "android", "yandex"],
    vi: ["ios", "android", "yandex"]
  };

  root.GAMES = GAMES;
  root.STORES_BY_LANG = STORES_BY_LANG;
  root.GAME_BY_SLUG = GAMES.reduce(function (m, g) { m[g.slug] = g; return m; }, {});
})(typeof window !== "undefined" ? window : this);
