# Аудит Cloudflare Worker (лендинг)

Дата: 2026-06-14. Аудит без изменения кода.

Разобраны:

- **Воркер A (корневой)** — `worker.js` + `wrangler.jsonc`. Edge language router поверх Cloudflare Workers Assets (`directory: ./dist`, `binding: ASSETS`, `run_worker_first: true`). Только `/` делает 302-редирект по cookie `dibby_lang` / `Accept-Language`, остальное — passthrough в `env.ASSETS.fetch(request)`.
- **Воркер B (dib.by)** — `deploy/dib-by-worker/worker.js` + `wrangler.jsonc`. Reverse-proxy для `/app-ads.txt` и `/ads.txt` (200), 301 на `https://dibbyplay.com` для остального. Привязан к зоне `dib.by` через `routes`.
- Сопутствующее: `deploy/_redirects`, `deploy/vercel.json`, `deploy/dib.by-static/index.html` (альтернативные реализации редиректа dib.by для других хостов), `.wrangler/cache/` (локальный кэш аккаунта).

---

## Сводная таблица находок

| # | Находка | Severity | Где (файл / строка) | Фикс (кратко) |
|---|---------|----------|---------------------|---------------|
| 1 | Воркер НЕ ставит ни одного security-заголовка на ответах ассетов (HSTS, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy). Passthrough `env.ASSETS.fetch` отдаёт дефолтные заголовки Assets без усиления | **High** | `worker.js:108` | Обернуть ответ ассетов и дописать заголовки (сниппет ниже) или добавить `dist/_headers` |
| 2 | Нет `_headers` и нет конфигурации Cache-Control для ассетов/HTML. HTML отдаётся с дефолтным кэшем Workers Assets — нет явного `no-cache` для HTML и нет `immutable`/длинного TTL для хешированных ассетов | **High** | нет `dist/_headers`; `wrangler.jsonc:12-22` | Добавить `dist/_headers`: HTML — `no-cache`, `/assets/*` — `max-age=31536000, immutable` |
| 3 | `not_found_handling: "none"` — на отсутствующих путях Workers Assets вернёт пустую/служебную 404 без осмысленной страницы. Кастомной 404 в `dist` нет | **Medium** | `wrangler.jsonc:21` | `"not_found_handling": "404-page"` + положить `dist/404.html` (или `"single-page-application"` неуместно для MPA) |
| 4 | Нет канонизации хоста: воркер A не редиректит `www`↔`non-www` и не форсит https. Если зона отдаёт и `www.dibbyplay.com`, и apex — дублирование контента (SEO) и две версии всех URL | **Medium** | `worker.js` (отсутствует логика); канонизация не задана в коде | Добавить early-redirect на канонический хост (сниппет ниже) либо Bulk Redirect/Redirect Rule в дашборде |
| 5 | В корневом `wrangler.jsonc` НЕТ `routes` — привязка к зоне/домену делается вручную в дашборде. Высокий риск дрейфа конфигурации и того, что воркер не запустится на нужном паттерне (ручной деплой, нет CI) | **Medium** | `wrangler.jsonc` (нет блока `routes`) | Зафиксировать `routes` с `zone_name` в конфиге, чтобы привязка была в коде |
| 6 | Редирект `/` происходит при КАЖДОМ заходе на корень неанглоязычного посетителя (302 на `/ru/` и т.д.). 302 с `Cache-Control: no-store` — корректно по логике, но корень не кэшируется на edge никогда; для en-посетителей корень кэшируется без `Vary`, что может закрепить англ. версию | **Low** | `worker.js:86-106` | Для en/fallthrough-ответа тоже добавить `Vary: Accept-Language, Cookie` через обёртку ответа |
| 7 | Воркер B: upstream-ответ проксируется, но НЕ проверяется статус — при 404/5xx с origin отдаётся тело ошибки с `content-type: text/plain` и `cache-control: max-age=300`, кэшируя битый sellers-файл на 5 мин | **Low** | `deploy/dib-by-worker/worker.js:27-34` | Проверять `upstream.ok`; при не-200 не кэшировать (или короткий TTL / fallback) |
| 8 | Воркер B: `Response.redirect(..., 301)` для всего прочего — корректно, но нет канонизации схемы/слеша и нет `cache-control` на 301 (по умолчанию кэшируется агрессивно — для 301 это ок, но смена правил потом «залипнет» у клиентов) | **Low** | `deploy/dib-by-worker/worker.js:38` | Осознанно оставить 301; при сомнении — 302 на период обкатки |
| 9 | Дублирование источников редиректа dib.by: воркер B + `deploy/_redirects` + `deploy/vercel.json` + `deploy/dib.by-static/index.html`. Риск рассинхронизации; `dib.by-static/index.html` ссылается на удалённый `DEPLOY-REDIRECT.md` | **Low** | `deploy/_redirects`, `deploy/vercel.json`, `deploy/dib.by-static/index.html:7` | Оставить один канонический механизм (воркер B), остальные пометить как fallback или удалить |
| 10 | Раскрытие заголовков: воркер не снимает `Server` / служебные заголовки CF. Минорно (CF и так отдаёт `server: cloudflare`), но `X-Powered-By`/лишние можно зачистить в обёртке | **Info** | `worker.js:108` | В обёртке ответа `headers.delete(...)` для лишнего |
| 11 | `compatibility_date: "2025-01-01"` в обоих конфигах — устарел (сегодня 2026-06-14). Не критично для этого простого кода, но стоит поднять, чтобы получать актуальное поведение рантайма | **Info** | `wrangler.jsonc:11`, `deploy/dib-by-worker/wrangler.jsonc:11` | Поднять до свежей даты, напр. `"2026-06-01"`, проверив деплоем |

### Что в порядке (без находок)

- **Секреты не захардкожены.** В коде нет токенов/ключей. `account.id` лежит только в `.wrangler/cache/wrangler-account.json`, и `.wrangler/` корректно в `.gitignore` (подтверждено `git check-ignore` и `git ls-files`) — в репозиторий не попадает.
- **Размер воркеров мал** — A ≈ 3.8 КБ, B ≈ 1.7 КБ исходника; чистый JS без зависимостей. Холодный старт пренебрежимо мал, проблем нет. (Большой `index.wasm` ~37 МБ — это ассет в корне репо, не часть воркера и не в `dist/`.)
- **302 на `/`** реализован корректно по сути: `status: 302` + `Cache-Control: no-store` + `Vary: Accept-Language, Cookie` — per-request решение не кэшируется как постоянное. Цепочек/циклов редиректов нет (en остаётся на `/`, прочие коды один раз уходят на `/<locale>/`).
- **`run_worker_first: true`** обязателен и обоснован: без него `/` сразу матчил бы `index.html` и воркер не запускался. Последствие — воркер исполняется на КАЖДЫЙ запрос (включая ассеты), но тело короткое и для не-`/` сразу делает passthrough, накладные расходы минимальны.
- **`html_handling: "auto-trailing-slash"`** даёт единообразный trailing-slash для локалей (`/ru/` → `/ru/index.html`), снижая риск дублей с/без слеша.

---

## Готовые сниппеты (в стиле этого воркера)

### A. Security-заголовки + Cache-Control через обёртку ответа (worker.js)

Заменяет голый `return env.ASSETS.fetch(request)` на обёртку, которая дописывает заголовки безопасности и корректный кэш. Заголовки ставятся на ВСЕ ответы ассетов (HTML, css, js, картинки).

```js
// --- helpers (рядом с остальными функциями вверху файла) ---

const SECURITY_HEADERS = {
  // HSTS: только после проверки, что весь трафик и поддомены на https
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Лендинг статический; ужесточайте под реальные источники (analytics, шрифты)
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self'; font-src 'self' data:; connect-src 'self'; " +
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

function harden(response, request) {
  // Response из ASSETS immutable по заголовкам — копируем, чтобы дописать.
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);

  // Кэш: HTML — коротко/перепроверять; хешированные ассеты — надолго.
  const path = new URL(request.url).pathname;
  const ct = headers.get("content-type") || "";
  if (ct.includes("text/html")) {
    headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    // решение зависит от языка/cookie даже на под-страницах при шаринге
    headers.set("Vary", "Accept-Language, Cookie");
  } else if (/^\/assets\//.test(path)) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }

  // Зачистка лишнего раскрытия (если вдруг проставлено апстримом)
  headers.delete("X-Powered-By");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
```

В `fetch(...)` в самом конце:

```js
    const assetResponse = await env.ASSETS.fetch(request);
    return harden(assetResponse, request);
```

И в ветке 302 на `/` security-заголовки можно тоже добавить (HSTS на редиректе полезен):

```js
        return new Response(null, {
          status: 302,
          headers: {
            Location: LOCALE_PATH[code],
            Vary: "Accept-Language, Cookie",
            "Cache-Control": "no-store",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
          },
        });
```

### B. Канонический редирект хоста (www↔non-www + https), в начале fetch

Поставить ПЕРВЫМ в `fetch(...)`, до языковой логики. Выбран apex (`dibbyplay.com`) как канонический — поменяйте, если канон `www`.

```js
    const CANONICAL_HOST = "dibbyplay.com";
    if (url.hostname === "www." + CANONICAL_HOST) {
      url.hostname = CANONICAL_HOST;
      return new Response(null, {
        status: 301,
        headers: {
          Location: url.toString(),
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
    // https форсится HSTS-заголовком + правилом зоны "Always Use HTTPS";
    // на уровне воркера CF обычно уже терминирует TLS, доп. проверка url.protocol
    // нужна только если воркер реально получает http-запросы.
```

> Примечание: один редирект-хоп, без цепочек. Если включаете и канонизацию хоста (301), и языковой 302 на `/`, посетитель `www` получит максимум 301 → затем (на apex) при необходимости 302 на локаль. Это нормальная короткая цепочка, не цикл.

### C. Альтернатива без кода — `dist/_headers` (Workers Assets читает его)

Если не хочется обёртки в JS, создайте `dist/_headers`:

```
/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.html
  Cache-Control: public, max-age=0, must-revalidate
```

Так как `dist/` генерируется `build.cjs`, этот `_headers` нужно либо писать билдом, либо положить в исходник и копировать при сборке.

### D. Осмысленная 404 (wrangler.jsonc + dist/404.html)

```jsonc
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "run_worker_first": true,
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "404-page"   // вместо "none"
  }
```

И добавить `dist/404.html` (генерировать билдом). Это исключает пустую/служебную 404 и не раскрывает внутренности. Стектрейсы воркер и так не отдаёт (нет `try/catch` с выводом ошибки наружу — ошибки уходят в дефолтный CF error page, тело пользовательского кода не печатается).

### E. Воркер B — проверка статуса апстрима

```js
    if (PASSTHROUGH.has(url.pathname)) {
      const upstream = await fetch(CANONICAL + url.pathname, { cf: { cacheTtl: 300 } });
      if (!upstream.ok) {
        // не кэшируем битый ответ как валидный sellers-файл
        return new Response("", { status: 502, headers: { "cache-control": "no-store" } });
      }
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300",
        },
      });
    }
```

---

## Связка с SEO (дублирование контента)

- **www vs non-www / схема** — сейчас не канонизируется воркером. Если зона отвечает на оба хоста, каждый URL существует в двух версиях → размытие сигналов. Фикс — сниппет B (301 на канонический хост) или Bulk Redirect в дашборде.
- **trailing slash** — для локалей унифицирован через `html_handling: auto-trailing-slash`; для корня en канон — `/`. Дублей с/без слеша внутри локалей быть не должно.
- **Языковые под-страницы** несут hreflang + JSON-LD (по комментарию в `worker.js`), 302 с `/` помечен `Vary` — шаринг и краулинг локалей сохраняются.
- **dib.by** 301-ит весь сторонний контент на `dibbyplay.com` (sellers-файлы — 200 inline), отдельной индексируемой копии лендинга на коротком домене нет — это правильно для SEO.
