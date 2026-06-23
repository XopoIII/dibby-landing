#!/usr/bin/env bash
# Sync per-game brand art + screenshots from the game monorepo into the landing.
#
# The games live in a separate repo; their store-ready icons, wordmarks and
# screenshots are the source of truth. Re-run this whenever those are
# regenerated. Destination layout mirrors games.config.js: each game's assets
# sit under assets/games/<slug>/ (icon.png, wordmark.png, screens/<name>.png).
#
# Usage:  ./sync-game-assets.sh
set -euo pipefail

SRC="${DIBBY_GAMES_REPO:-/Users/xopoiii/Programming/platformer}"
DST="$(cd "$(dirname "$0")" && pwd)/assets/games"

copy() { # copy <src-rel> <dst-abs>
  if [ -f "$SRC/$1" ]; then
    mkdir -p "$(dirname "$2")"
    cp "$SRC/$1" "$2"
    echo "  ✓ $1 → ${2#"$DST"/}"
  else
    echo "  ✗ MISSING: $SRC/$1" >&2
  fi
}

echo "Syncing game assets from: $SRC"

# ---- Dibby (flagship) — icon for the hub card; gameplay screens already live
#      under assets/screens/, so only the card icon is pulled here. -----------
echo "Dibby:"
copy "assets/dibby/ios/icon_1024.png" "$DST/dibby/icon.png"

# ---- Dibby Dash — iOS+Android cozy runner ----------------------------------
echo "Dash:"
copy "assets/dash/icon_1024.png"            "$DST/dash/icon.png"
copy "assets/dash/dibby_dash_wordmark.png"  "$DST/dash/wordmark.png"
for s in 02-meadow 03-steppe 04-dusk 05-grove 06-night 07-wonder; do
  copy "publishing/dash/store-screenshots/google-play/en/phone/$s.png" "$DST/dash/screens/$s.png"
done

# ---- Dibby Chirp — one-tap endless flyer -----------------------------------
echo "Chirp:"
copy "assets/chirp/ios/icon_1024.png" "$DST/chirp/icon.png"
copy "assets/chirp/chirp_splash.png"  "$DST/chirp/wordmark.png"
for s in 01-home 02-fly 03-glide 04-gap 05-sky 06-deep; do
  copy "publishing/chirp/store-screenshots/google-play/en/phone/$s.png" "$DST/chirp/screens/$s.png"
done

# ---- Dibby Sling — still in development; teaser card art only ---------------
echo "Sling:"
copy "assets/sling/ios/icon_1024.png" "$DST/sling/icon.png"
copy "assets/sling/sling_splash.png"  "$DST/sling/wordmark.png"

# ---- WebP pass --------------------------------------------------------------
# The page serves screenshots via <picture> (webp source, png fallback), the
# same as Dibby's own screens. Pixel art at q82 shrinks ~15-20x with no visible
# loss. Generate a .webp next to every synced .png. Skipped if cwebp is absent.
if command -v cwebp >/dev/null 2>&1; then
  echo "WebP:"
  while IFS= read -r -d '' png; do
    cwebp -quiet -q 82 "$png" -o "${png%.png}.webp"
    echo "  ✓ ${png#"$DST"/} → webp"
  done < <(find "$DST" -type f -name '*.png' -print0)
else
  echo "WebP: cwebp not found — serving PNG only (run 'brew install webp' to enable)." >&2
fi

echo "Done."
