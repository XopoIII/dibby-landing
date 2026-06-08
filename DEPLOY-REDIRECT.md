# Деплой и домены — пошаговая настройка (Cloudflare Pages + Cloudflare DNS)

Итоговая схема:

| Домен | Роль | Что отдаёт |
|-------|------|-----------|
| **dibbyplay.com** | основной сайт | контент из `dist/` (Cloudflare Pages), canonical/OG/sitemap указывают сюда |
| **www.dibbyplay.com** | алиас | 301 → `dibbyplay.com` |
| **dib.by** | короткая брендовая ссылка | 301 → `https://dibbyplay.com` (с сохранением пути и query) |
| **www.dib.by** | алиас | 301 → `https://dibbyplay.com` |

Деплой автоматический: пуш в `main` на GitHub → Cloudflare Pages запускает `node build.cjs` → раздаёт `dist/`.

---

## Шаг 0. Завести оба домена в Cloudflare (NS)

Для каждого домена (`dibbyplay.com` и `dib.by`):

1. Cloudflare Dashboard → **Add a site** → ввести домен → план **Free**.
2. Cloudflare покажет 2 своих nameserver'а (вида `xxx.ns.cloudflare.com`).
3. В панели **регистратора** домена заменить NS-серверы на эти два (старые удалить).
   - `dibbyplay.com` — у регистратора, где покупал.
   - `dib.by` — в панели .by-регистратора (hoster.by и т.п.). Если NS поменять нельзя — см. Приложение Б.
4. Подождать активацию (от минут до пары часов). Статус зоны в Cloudflare станет **Active**.

> Делать это нужно один раз на домен. Дальше все записи и редиректы — внутри Cloudflare.

---

## Шаг 1. Основной сайт — Cloudflare Pages (хостинг + сборка из GitHub)

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → вкладка **Pages** → **Connect to Git**.
2. Авторизовать GitHub, выбрать репозиторий лендинга, ветка **`main`**.
3. **Build settings**:
   - Framework preset: **None**
   - **Build command:** `npm run build`  (равнозначно `node build.cjs`)
   - **Build output directory:** `dist`
   - Root directory: `/` (оставить по умолчанию)
   - (опц.) Environment variable `NODE_VERSION` = `20`
4. **Save and Deploy.** Появится временный адрес `<project>.pages.dev` — проверь, что сайт открывается.

> `dist/` лежит в `.gitignore` — это нормально: Cloudflare собирает папку заново при каждом деплое. `package.json` (уже в репо) фиксирует Node и команду сборки.

---

## Шаг 2. Привязать dibbyplay.com к Pages

1. В проекте Pages → **Custom domains** → **Set up a custom domain** → `dibbyplay.com` → подтвердить.
2. Ещё раз → добавить `www.dibbyplay.com`.
3. Cloudflare **сам создаст нужные DNS-записи** в зоне `dibbyplay.com` (CNAME с flattening на `<project>.pages.dev`, проксированные — оранжевое облако). Вручную ничего добавлять не надо.
4. HTTPS-сертификат выпустится автоматически (Universal SSL) за несколько минут.

Канонический домен — голый `dibbyplay.com`. Чтобы `www` не плодил дубль, добавь редирект `www → apex` (Шаг 4, правило №1).

### DNS-записи в зоне dibbyplay.com (как должно получиться)
```
CNAME   dibbyplay.com       <project>.pages.dev     Proxied   (создаст Pages)
CNAME   www                 <project>.pages.dev     Proxied   (создаст Pages)
```

---

## Шаг 3. DNS для dib.by (домен только под редирект)

В зоне **dib.by** (Cloudflare → выбрать домен → **DNS → Records**) добавить «заглушечные» проксированные записи — сам IP неважен, трафик перехватит Redirect Rule, а HTTPS даст edge-сертификат Cloudflare:

```
AAAA   dib.by   100::      Proxied (оранжевое облако)
AAAA   www      100::      Proxied (оранжевое облако)
```
(`100::` — discard-адрес, рекомендованный Cloudflare для redirect-only зон. Можно вместо этого `A @ 192.0.2.1` Proxied — тоже сработает.)

Убедись, что Universal SSL для зоны `dib.by` активен (DNS → **SSL/TLS → Edge Certificates**), иначе `https://dib.by` не откроется до редиректа.

---

## Шаг 4. Redirect Rules (в Cloudflare)

### Правило 1 — dib.by (и www) → dibbyplay.com, с сохранением пути и query
Зона **dib.by** → **Rules → Redirect Rules → Create rule**:
- **Rule name:** `dib.by -> dibbyplay.com`
- **When incoming requests match:** Custom filter expression →
  `(http.host eq "dib.by") or (http.host eq "www.dib.by")`
- **Then... Type:** Dynamic
- **Expression:** `concat("https://dibbyplay.com", http.request.uri.path)`
- **Status code:** **301**
- **Preserve query string:** ✅ включить
- Deploy.

### Правило 2 — www.dibbyplay.com → dibbyplay.com (каноникализация)
Зона **dibbyplay.com** → **Rules → Redirect Rules → Create rule**:
- **When:** `(http.host eq "www.dibbyplay.com")`
- **Type:** Dynamic → `concat("https://dibbyplay.com", http.request.uri.path)`
- **Status:** **301**, Preserve query string ✅
- Deploy.

---

## Шаг 5. SSL/TLS — проверить настройки (обе зоны)

В каждой зоне → **SSL/TLS → Overview**:
- Encryption mode: **Full (strict)** (для Pages работает из коробки).
- **Edge Certificates** → включить **Always Use HTTPS** (http → https).
- (опц.) **Automatic HTTPS Rewrites** — ON.

---

## Шаг 6. Проверка

```bash
# короткий домен -> основной, 301, путь+query сохранены
curl -sIL "https://dib.by/ru/?utm_source=tg" | grep -iE "^HTTP|^location"
# ждём: 301 ... location: https://dibbyplay.com/ru/?utm_source=tg  -> затем 200

# www -> apex
curl -sIL "https://www.dibbyplay.com/" | grep -iE "^HTTP|^location"

# основной сайт отдаёт 200 и правильный canonical
curl -s https://dibbyplay.com/ | grep -i 'rel="canonical"'
```

---

## Шаг 7. SEO (после того как всё резолвится)

- Google Search Console: добавить **только** `https://dibbyplay.com` (dib.by добавлять не нужно — это редирект).
- Отправить sitemap: `https://dibbyplay.com/sitemap.xml`.
- Проверить, что `dib.by` и `www` отдают именно **301** (не 302) — иначе Google может не склеить.

---

## Дальнейшие обновления сайта
Просто `git push` в `main` → Cloudflare Pages пересоберёт и задеплоит автоматически. Меняешь тексты/локали в `landing/` и `i18n.js` — деплой подхватит. Сменишь домен — правь `SITE_URL` в `build.cjs`.

---

# Приложение

## А. Альтернативные хостинги (если передумаешь)
В папке `deploy/` лежат готовые конфиги редиректа dib.by под другие платформы:
- `deploy/_redirects` — Netlify / Cloudflare Pages
- `deploy/vercel.json` — Vercel
- `deploy/dib.by-static/index.html` — клиентский фолбэк для голого статик-хостинга

## Б. Если NS у .by-регистратора поменять нельзя
Используй встроенный **URL Forwarding / «Перенаправление»** в панели регистратора `dib.by`:
- Тип: **301 / Permanent**, назначение `https://dibbyplay.com`, включить «сохранять путь» если есть.
Минус: не везде сохраняется путь и не всегда корректный HTTPS на голом домене. Cloudflare (основной способ выше) надёжнее.
