# dibby landing — карта проекта (audit/00-map.md)

Дата аудита: 2026-06-14. Аудит проводился только на чтение, код не менялся.

---

## 1. Стек

**Лендинг — это чистый HTML/CSS/JS, не генератор (нет Astro / Next / Vite / 11ty).**
Сборка — собственный Node-скрипт `build.cjs` (~520 строк, без зависимостей, только `fs`/`path`).

- **Пакетный менеджер:** npm. `package.json` минимален — единственная зависимость отсутствует (`dependencies` нет), есть только скрипт `"build": "node build.cjs"` и `engines.node >= 18`. Lock-файла нет.
- **Исходник** живёт в `landing/`:
  - `landing/index.html` — единственный шаблон страницы (вся разметка + клиентская логика: i18n, плеер, галерея).
  - `landing/styles.css` — стили.
  - `landing/i18n.js` — таблицы переводов + `LANGS`, `FRIEND_SLUGS`, `FRIEND_NAMES`, `I18N` (1511 строк).
  - `landing/legal/<code>.json` — по одному файлу на локаль для privacy / support / legal.
  - `landing/ads.txt`, `landing/app-ads.txt` — authorized-sellers для Яндекс РСЯ.
- **Ассеты** — в `assets/` (fonts, friends ×36, mascot-кадры, screens, icon.png, og.png).

### Как `landing/` превращается в `dist/`

`build.cjs` (запускается через `npm run build` → `node build.cjs`):

1. `global.window = {}` и `require("landing/i18n.js")` — грузит таблицы переводов ровно так, как это делает браузер.
2. `rmrf(dist)` — полностью пересоздаёт `dist/`.
3. Копирует `assets/` → `dist/assets/`, `styles.css`, `i18n.js`. **`.ttf` шрифты выкидываются** (остаётся subset `.woff2`); `.DS_Store` пропускается.
4. Для каждой из 19 локалей рендерит `landing/index.html` в статический HTML c уже «запечённым» текстом (`renderLang`): подставляет `data-i18n` тексты, разворачивает JS-контейнеры (store-бейджи, friends-grid, FAQ, confetti) в реальный HTML, локализует `<title>`/`<meta>`/`og:locale`, переписывает относительные пути по глубине, добавляет `hreflang` + JSON-LD (`@graph`: Organization ← WebSite ← VideoGame/MobileApplication + FAQPage). EN → `dist/index.html`, остальные → `dist/<code>/index.html`.
5. Рендерит legal-страницы (privacy / support / legal) × локали, у которых есть JSON → `dist/[<code>/]<slug>/index.html`. Подставляет `{{TOKENS}}` из `PUBLISHER`.
6. Генерирует `sitemap.xml`, `robots.txt` (явно разрешает GPTBot/ClaudeBot/PerplexityBot и т.д.), `llms.txt`.
7. Копирует `ads.txt` / `app-ads.txt` в корень `dist/`.

`dist/` — артефакт сборки, **в `.gitignore`**, в гит не коммитится (генерируется при деплое).

**Зачем pre-render:** страница локализуется клиентским JS (`i18n.js`); AI-краулеры и часть поисковиков JS не исполняют → видели бы только английский. Скрипт «запекает» по файлу на язык; JS-i18n остаётся UX-слоем, переключатель языка ходит между готовыми URL (`DIBBY_PATHS`).

> ⚠️ Важно: `index.html` + `index.wasm` (37 MB) в **корне репозитория** — это НЕ лендинг. Это Telegram Mini App shell самой игры на Godot 4.6 (`GODOT_CONFIG`, `telegram-web-app.js`, canvas). Он не участвует в `build.cjs`, не попадает в `dist/` и к лендинг-пайплайну отношения не имеет — просто лежит рядом в той же папке.

---

## 2. Cloudflare Worker — роль

В репозитории **два разных Worker'а**.

### A. `worker.js` (корень) + `wrangler.jsonc` — основной сайт `dibbyplay.com`

Это **edge language router поверх статики Cloudflare Workers Assets**. Не API, не прокси (кроме одного редиректа). Он отдаёт статику через `env.ASSETS` и делает edge-редирект только для корня.

Цитаты из `wrangler.jsonc`:
```jsonc
"name": "dibby-landing",
"main": "worker.js",
"compatibility_date": "2025-01-01",
"assets": {
  "directory": "./dist",
  "binding": "ASSETS",
  "run_worker_first": true,
  "html_handling": "auto-trailing-slash",
  "not_found_handling": "none"
}
```
- `directory: ./dist` — статика берётся из собранной папки.
- `binding: ASSETS` — ассеты доступны воркеру как `env.ASSETS.fetch(...)`.
- `run_worker_first: true` — воркер выполняется ДО отдачи ассета, иначе `/` сразу матчился бы на `index.html` и воркер не отработал.
- `html_handling: auto-trailing-slash` — `/ru/` → `/ru/index.html`.
- `not_found_handling: none` — нет кастомного 404-фолбэка.
- **Нет** `routes`/`triggers`/`vars`/`env`/секретов — деплоится на `*.workers.dev` либо привязывается к домену через дашборд/Custom Domain (в конфиге маршрут не задан).

Логика `worker.js`:
```js
if (url.pathname === "/") {
  // 1. cookie dibby_lang  2. Accept-Language  3. English по умолчанию
  ...
  if (code && code !== "en" && LOCALE_PATH[code]) {
    return new Response(null, {
      status: 302,                 // per-request, НЕ кэшировать как постоянный
      headers: { Location: LOCALE_PATH[code],
                 Vary: "Accept-Language, Cookie",
                 "Cache-Control": "no-store" } });
  }
}
return env.ASSETS.fetch(request);
```
- Только `/` принимает языковое решение: cookie `dibby_lang` → `Accept-Language` (с учётом q-весов, `matchTag`/`fromAcceptLanguage`) → дефолт English.
- Для не-английских — **302** (а не 301) с `Cache-Control: no-store` и `Vary`, чтобы пер-запросное решение не закэшировалось навсегда.
- Всё остальное (`/ru/`, `/de/`, картинки, css, js) — passthrough в `env.ASSETS.fetch(request)`.

### B. `deploy/dib-by-worker/` — Worker для короткого домена `dib.by`

Цитаты из `deploy/dib-by-worker/wrangler.jsonc`:
```jsonc
"name": "dib-by-redirect",
"main": "worker.js",
"compatibility_date": "2025-01-01",
"routes": [ { "pattern": "dib.by/*", "zone_name": "dib.by" } ]
```
Логика `deploy/dib-by-worker/worker.js`:
- `/app-ads.txt` и `/ads.txt` — **reverse-proxy 200** с canonical-origin (`fetch("https://dibbyplay.com" + path, { cf: { cacheTtl: 300 } })`), отдаются inline как `text/plain` — чтобы ad-tech краулеры (Яндекс РСЯ) читали `https://dib.by/app-ads.txt` без кросс-доменного редиректа.
- Всё остальное — `Response.redirect(CANONICAL + path + search, 301)`.
- В комментариях предупреждение: перед включением убрать существующее Redirect Rule в дашборде `dib.by` (Redirect Rules выполняются ПЕРЕД Workers и иначе перехватят запрос).

Это единственный источник правды для sellers-файлов; они физически живут в основной сборке.

---

## 3. Пайплайн деплоя

**GitHub Actions нет** (каталога `.github/` в репозитории нет). **Cloudflare Git-интеграции тоже нет** (нет признаков Pages-проекта/connected repo). Деплой — **ручной `wrangler deploy`**.

- Основной сайт: `npm run build` (→ `node build.cjs` пишет `dist/`) затем `npx wrangler deploy` из корня — публикует `dist/` как Workers static assets с `worker.js` как entrypoint.
- Короткий домен: `npx wrangler deploy` из `deploy/dib-by-worker/`, затем вручную добавить route `dib.by/*` и снять старое Redirect Rule.
- **Секреты/переменные окружения:** в конфигах нет ни `vars`, ни `secrets`, ни биндингов кроме `ASSETS`. Аутентификация wrangler — через локальный кэш `.wrangler/cache/wrangler-account.json` (account id `92a026a2…`, аккаунт `Xopoiii@outlook.com's Account`). `.wrangler/` в `.gitignore`.

**Альтернативные хостинги для редиректа `dib.by`** (заготовки в `deploy/`, не основной путь):
- `deploy/vercel.json` — Vercel: `permanent` (301) редирект `/(.*)` → `dibbyplay.com/$1`.
- `deploy/_redirects` — Netlify/Cloudflare Pages: `/* https://dibbyplay.com/:splat 301!`.
- `deploy/dib.by-static/index.html` — клиентский фолбэк-редирект (canonical + `noindex` + JS `location.replace` + meta-refresh), если хост не умеет 301.

`README.md` ссылается на `DEPLOY-REDIRECT.md`, но **этого файла в репозитории нет** (был удалён — см. коммит `69c00aa "Remove internal DEPLOY-REDIRECT.md note from repo"`). Битая ссылка в README.

---

## 4. Структура и контент

- **Локалей: 19.** `LANGS` в `i18n.js`: `en, ru, zh_CN, zh_TW, ja, ko, de, fr, es, pt, pl, uk, it, id, tr, vi, th, hi, ar`.
  (README устарел и говорит про «11 языков» — фактически 19. Расхождение.)
- **Блога нет.** Контент-страниц всего две «категории»: главная (по локали) + три legal/utility страницы (privacy, support, legal/Impressum).
- **Страниц в `dist/`: 76 `index.html`.** Раскладка:
  - 19 главных: `/` (en) + `/ru/`, `/zh-cn/`, `/zh-tw/`, `/ja/`, `/ko/`, `/de/`, `/fr/`, `/es/`, `/pt/`, `/pl/`, `/uk/`, `/it/`, `/id/`, `/tr/`, `/vi/`, `/th/`, `/hi/`, `/ar/`.
  - 57 legal: privacy/support/legal × 19 локалей (у всех 19 есть legal JSON) = 57.
  - 19 + 57 = 76. ✔
- Корневые файлы в `dist/`: `index.html`, `styles.css`, `i18n.js`, `sitemap.xml`, `robots.txt`, `llms.txt`, `ads.txt`, `app-ads.txt`, `assets/`.
- **Контент-данные:** тексты — `landing/i18n.js` (`I18N[code]`), 36 друзей (`FRIEND_SLUGS`/`FRIEND_NAMES`, спрайты в `assets/friends/`), legal — `landing/legal/<code>.json`.
- **Store-кнопки локале-зависимые** (`STORES_BY_LANG` в `build.cjs`): по умолчанию iOS+Android; `ru` добавляет telegram/rustore/yandex/vk; `tr`/`en` — telegram/yandex; ряд локалей — telegram; vi/zh_CN/ja/ko/zh_TW/th — без telegram. Telegram и RuStore помечены как «живые» (без ribbon «Soon»).

---

## 5. Пять самых рискованных мест

1. **Хрупкие строковые замены в `build.cjs`.** Весь рендер построен на `.split(...).join(...)` / `.replace(...)` по точным байтам шаблона (`EN_TITLE`, `EN_DESC_LONG`, store-SVG, конкретные `<div ... data-...></div>`). Любая правка `landing/index.html` (пробел, атрибут, текст) тихо ломает запекание: контейнер не развернётся или og/canonical не перепишутся — без ошибки сборки. Комментарии «must match byte-for-byte» это подтверждают. Высокий риск регрессии при редактировании.

2. **Незаполненные обязательные данные перед публикацией.** `PUBLISHER.address`/`phone` пусты, `SAMEAS = []`, `LINKS` (preregIos/Android/discord/…) в `index.html` пусты → store-бейджи и CTA ведут на `#get`. `build.cjs` сам печатает предупреждения про `[placeholders]` (EU DSA trader + Apple Guideline 1.5). Деплой «как есть» = юридически/функционально неполный лендинг.

3. **Ручной деплой без CI и без commit'а `dist/`.** Нет `.github/`, нет Pages-git-интеграции; `dist/` в `.gitignore`. Источник истины — только локальная сборка на машине разработчика. Любой деплой = ручной `npm run build` + `npx wrangler deploy`; легко задеплоить устаревший/несобранный `dist`, забыть пересборку, нет воспроизводимости/отката. Плюс нет lock-файла.

4. **Зависимости порядка на edge у `dib.by` + двойной редирект-конфиг.** Worker `dib-by-redirect` корректен, только если вручную удалить старое Redirect Rule в дашборде (Rules выполняются раньше Workers). Параллельно в `deploy/` лежат ещё три конфликтующих механизма редиректа (Vercel 301, Netlify `_redirects`, статический JS-фолбэк) — если активны несколько, поведение `dib.by` непредсказуемо (особенно для `/app-ads.txt`, который должен быть 200, а не 301). Sellers-файлы зависят от того, что `dibbyplay.com` доступен и отдаёт 200.

5. **Рассинхрон документации и реального состояния.** README говорит «11 языков» (реально 19) и ссылается на удалённый `DEPLOY-REDIRECT.md`. `compatibility_date: 2025-01-01` фиксирован. `not_found_handling: none` — нет кастомного 404. `SITE_URL` захардкожен в `build.cjs` (canonical/OG/JSON-LD/sitemap/robots завязаны на одну строку) — при смене домена нужно править в нескольких местах (`build.cjs` + плейсхолдеры в `index.html`). Эти расхождения повышают шанс ошибки при следующих правках.
