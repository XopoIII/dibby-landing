# Аудит 06 — технические мелочи (Dibby landing)

Дата: 2026-06-14. Метод: статический разбор `landing/index.html`, `landing/i18n.js`, `build.cjs`, `dist/index.html` + локализованные сборки, `worker.js`, `wrangler.jsonc`, ассеты в `assets/` и SEO-файлы в `dist/`. Код не менялся.

Сводка статусов: **ОК — 9**, **Проблема — 4** (все мелкие/средние, ни одной критичной).

---

## 1. Аналитика / метрика — [ок]

- **Подключена ли:** нет. По grep (`metrika|mc.yandex|gtag|googletagmanager|google-analytics|plausible|fathom|posthog|amplitude|mixpanel|clarity`) в `landing/`, `dist/`, `index.html`, `worker.js`, `build.cjs` — **ни одного реального счётчика**. Единственные совпадения — это комментарии-«заглушки» в cookie-consent блоке (`hook point: if val === "all", load analytics here in the future`).
- **Дублирование / битый счётчик:** отсутствует (нечему дублироваться).
- **Блокировка загрузки:** не применимо — внешних скриптов аналитики нет, единственный `<script src="i18n.js">` локальный.
- **Вывод:** чисто. Архитектура под аналитику уже готова правильно: есть GDPR-баннер согласия (`initConsent`), который пишет `dibby_consent = "all"|"necessary"` и оставляет hook-точку. Когда будете добавлять метрику — грузить её **только** при `__dibbyConsent === "all"`, асинхронно (`async`/`defer`), в той самой hook-точке (`landing/index.html:628`). Сейчас фиксить нечего.

## 2. Favicon и иконки — [проблема]

- **`<title>` в табе:** [ок] — осмысленный и **локализованный** по каждой локали (en: «Cozy one-finger rope-rescue arcade — dibby», ru: «Уютная аркада одним пальцем — dibby», de/ja/ar тоже переведены). Бренд в конце — хорошо.
- **`<link rel="icon">`:** есть, но указывает на `assets/icon.png` — это **PNG 1024×1024, ~25 КБ**, используемый как фавикон. Браузер тянет полноразмерную картинку ради иконки 16–32 px.
- **`apple-touch-icon`:** есть (`assets/icon.png`, тот же 1024×1024 — для apple-touch это нормальный размер, ок).
- **`favicon.ico`:** **отсутствует** (`dist/favicon.ico` нет). Часть старых браузеров/ботов и некоторые соц-превью по-прежнему дёргают `/favicon.ico` по корню → будет 404 в логах.
- **`favicon.svg`:** отсутствует.
- **web manifest (`site.webmanifest` / `manifest.json`):** **отсутствует** — ни файла, ни `<link rel="manifest">`. Для PWA-добавления на домашний экран и корректных иконок в Android-Chrome его нет. `theme-color` (`#bde8db`) при этом задан — ок.
- **Фикс:**
  1. Добавить настоящий многоразмерный фавикон: `favicon.ico` (16/32/48) в корень `dist/` + `favicon-32.png`. Прописать `<link rel="icon" sizes="32x32" href="/favicon-32.png">` вместо тяжёлого 1024px PNG.
  2. (Опц., но дёшево) добавить `site.webmanifest` с `name`, `short_name: "dibby"`, `theme_color: #bde8db`, `background_color`, иконками 192/512, и `<link rel="manifest" href="/site.webmanifest">`. Учесть локальные пути: в корне путь `assets/...`, в локалях `../assets/...` — build.cjs уже переписывает относительные ссылки, манифест лучше дать абсолютным путём `/site.webmanifest`.

## 3. Страница 404 — [проблема]

- **`dist/404.html`:** **отсутствует**.
- **`wrangler.jsonc`:** `"not_found_handling": "none"` — значит на несуществующий путь Cloudflare вернёт голый системный 404 без брендинга и без навигации обратно.
- **Влияние:** среднее. Битые/устаревшие ссылки и опечатки в URL дают «пустую» страницу. Для лендинга с шарингом по соцсетям и магазинам это неприятно.
- **Фикс:** создать осмысленный `dist/404.html` (логотип dibby, короткий текст на en + ссылка «На главную» → `/`) и переключить `not_found_handling` на `"404-page"`. Либо, если нужен мягкий редирект, обработать промах в `worker.js` (сейчас он всё, кроме `/`, прозрачно пропускает в `env.ASSETS.fetch`). Минимальный вариант — просто статический `404.html` + `not_found_handling: "404-page"`.

## 4. Превью при шаринге (OG/Twitter) — [ок]

- **OG-картинка существует:** да — `assets/og.png`.
- **Размер:** **ровно 1200×630** (проверено `sips`), формат PNG. Совпадает с задекларированными `og:image:width=1200` / `og:image:height=630`. Идеально.
- **`og:title` / `og:description`:** заполнены и осмысленны, локализуются per-locale в сборке (build.cjs переписывает мета). `og:image` дан **абсолютным https-URL** (`https://dibbyplay.com/assets/og.png`) — правильно для скрейперов.
- Полный комплект: `og:type`, `og:site_name`, `og:locale`, `og:url`, `og:image:secure_url`, `og:image:type`, `og:image:alt`, плюс Twitter `summary_large_image` с image+alt. Это выше среднего по качеству.
- **Мелочь (не проблема):** `twitter:description` отличается текстом от `og:description` (укороченный) — это допустимо и осознанно.
- **Вывод:** фиксить нечего.

## 5. Mixed content (http:// на https-странице) — [ок]

- grep `http://` по всему `dist/` — **ноль** реальных ресурсов. Совпадения только в неймспейсах (`w3.org`, `schema.org` в SVG/JSON-LD `@context`), что НЕ загружается и mixed content не вызывает.
- В `dist/i18n.js` — 0 вхождений `http://`.
- Все ассеты — относительные пути, внешние ссылки (canonical, og, hreflang, RuStore, Telegram) — `https://`.
- **Вывод:** чисто.

## 6. Консольные ошибки (статический прогноз по JS) — [ок]

Разобран инлайн-скрипт `landing/index.html` и `i18n.js`:

- Все обращения к DOM защищены: `buildFriends`/`buildFaq`/`buildLangMenu`/`buildPhones` делают `if (!el) return` или `querySelectorAll().forEach`, который безопасен на пустом наборе.
- `localStorage`/`cookie` обёрнуты в `try/catch` (`rememberLang`, `initConsent`, `pickInitialLang`) — приватный режим / заблокированные куки не уронят скрипт.
- Зависимость от глобалов `window.I18N`, `window.LANGS`, `window.FRIEND_SLUGS`, `window.FRIEND_NAMES`, `window.DIBBY_LANG/DIBBY_PATHS` — все они определяются в `i18n.js`, который грузится **до** инлайн-скрипта (`<script src="i18n.js">` строкой выше). Порядок верный.
- Видео-логика (`HAS_VIDEO = false`) аккуратно фолбэчит на скриншоты, `play().catch(()=>{})` глушит promise-rejection от автоплея.
- **Риск-замечание (не ошибка):** иконка-фавикон 1024px и ассеты грузятся по относительному пути; если страницу когда-то отдадут не из ожидаемой папки, пути `../assets/` могут сломаться — но в текущей структуре (`/` и `/xx/`) build.cjs выставляет их корректно.
- **Вывод:** явных runtime-ошибок в консоли при штатной загрузке не прогнозируется.

## 7. robots.txt / llms.txt / sitemap.xml — [ок]

- **`dist/robots.txt`:** [ок] — есть, `Allow: /` для всех, явно разрешены AI-краулеры (GPTBot, ClaudeBot, PerplexityBot, Google-Extended и т.д. — осознанная GEO-стратегия), указан `Sitemap: https://dibbyplay.com/sitemap.xml`.
- **`dist/sitemap.xml`:** [ок] — присутствует (~142 КБ, все локали).
- **`dist/llms.txt`:** [ок] — присутствует, аккуратно оформлен (краткое описание, key facts, ссылки на Home/Privacy/Support/Legal). Хорошая практика для LLM-выдачи.
- **Доп. файлы:** `ads.txt`, `app-ads.txt` тоже на месте (монетизация/реклама).
- **Вывод:** SEO/AI-discovery файлы в порядке.

---

## Итоговый чек-лист

| # | Пункт | Статус | Фикс |
|---|-------|--------|------|
| 1 | Аналитика/метрика | ок | нет счётчика, дублей нет, не блокирует; добавлять только за consent="all", async |
| 2 | Favicon / иконки / title | проблема | нет `favicon.ico`, нет web-manifest, фавикон = тяжёлый PNG 1024px; title локализован — ок |
| 3 | 404-страница | проблема | нет `dist/404.html`, `not_found_handling: none` → сделать брендовый 404 + переключить на `404-page` |
| 4 | OG-превью | ок | og.png ровно 1200×630, мета полные и локализованы |
| 5 | Mixed content | ок | http:// ресурсов нет |
| 6 | Консольные ошибки (статически) | ок | DOM-обращения и storage защищены, порядок скриптов верный |
| 7 | robots / llms / sitemap | ок | все три на месте и корректны |

**Приоритет фиксов:** (1) брендовый 404-страница (виден пользователям), (2) favicon.ico + web-manifest (404 в логах, PWA/Android-иконки), (3) заменить 1024px PNG-фавикон на лёгкий 32px. Всё остальное — без замечаний.
