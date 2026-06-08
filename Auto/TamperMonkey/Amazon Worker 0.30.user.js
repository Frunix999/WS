// ==UserScript==
// @name         DropSync Amazon Worker DE
// @namespace    https://php-service.xyz/
// @version      0.47
// @description  Розподілений воркер для парсингу Amazon. v0.31: concurrency = 5 паралельних слотів.
// @match        https://php-service.xyz/worker-runner.php*
// @match        http://localhost/php_service_dropshipping/worker-runner.php*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      php-service.xyz
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

/* eslint-disable no-console */
(function () {
    'use strict';

    // ──────────────────────────────────────────────────────────────
    //  CONFIG (з GM_setValue('dropsync_worker', {uuid, secret, gateway, worker_key}))
    //  worker_key — для multi-worker setup. Скрипт запуститься лише на ?w=<key>.
    //  Якщо worker_key=null/'' → single-worker, запускається на будь-якій вкладці.
    // ──────────────────────────────────────────────────────────────
    GM_setValue('dropsync_worker', {
        uuid:    'ded1a3b7-eb12-4881-8acb-b1a19b6dec91',
        secret:  'bc5df54b6691c36813e6c3b0ec510f57b60234018394a8ee',
        gateway: 'https://php-service.xyz:8443',
		worker_key: 'de'
    });

    const CONFIG = GM_getValue('dropsync_worker');

    const VERSION = '0.47';

    // CONCURRENCY керується з БД (workers.concurrency, керує адмін у /workers.php).
    // Це FALLBACK якщо /worker/auth не повернув значення або пайдь старий сервер.
    let CONCURRENCY = 50;
    const TICK_INTERVAL_MS    = 3000;     // пауза між запитами до get-next-task КОЛИ IDLE
    const HEARTBEAT_MS        = 5 * 60 * 1000;  // 5 хв
    const REQ_TIMEOUT_MS      = 200_000;  // > Gateway timeout (180s) для /worker/fetch-html
    const BACKOFF_AFTER_ERROR = 30_000;   // 30 сек паузи після помилки
    // Race-condition guard для concurrency=30: між слотами можлива дублікація запиту,
    // якщо сервер ще не оновив last_check_at коли інший слот picks той самий item.
    // 5 хв достатньо щоб сервер встиг записати, реальна частота керується p.recheck_minutes.
    const MIN_RECHECK_MS      = 5 * 60 * 1000;

    // Anti-double-check cache (локальний на воркера). Сервер вже фільтрує по last_check_at +
    // p.recheck_minutes, але safety-net на випадок race-condition між слотами.
    const recentlyChecked = new Map();  // item_id → timestamp_of_last_check
    function alreadyCheckedRecently(itemId) {
        if (!itemId) return false;
        const last = recentlyChecked.get(itemId);
        return last && (Date.now() - last) < MIN_RECHECK_MS;
    }
    function markChecked(itemId) {
        if (!itemId) return;
        recentlyChecked.set(itemId, Date.now());
        // GC — лишаємо тільки items за останню годину
        if (recentlyChecked.size > 500) {
            const cutoff = Date.now() - MIN_RECHECK_MS;
            for (const [k, v] of recentlyChecked) {
                if (v < cutoff) recentlyChecked.delete(k);
            }
        }
    }

    let JWT             = null;
    let WORKER_INFO     = null;     // {worker_id, name, regions}
    let isRunning       = false;
    let backoffUntil    = 0;        // глобальний — captcha_hit/disable впливає на всі слоти
    let stats           = { session: 0, success: 0, errors: 0, captcha: 0 };

    // Per-slot state — створюється у boot() ПІСЛЯ auth (бо CONCURRENCY приходить з сервера).
    let slotState = [];
    function initSlotState(n) {
        slotState = new Array(n).fill(null).map((_, i) => ({
            id: i, currentTask: null, active: false,
        }));
    }
    function activeSlotsCount() { return slotState.filter(s => s.active).length; }

    // ──────────────────────────────────────────────────────────────
    //  HTTP via GM_xmlhttpRequest (bypasses CORS)
    //  Авто-retry на 'network' / 'timeout' (типові glitch'і Chrome keep-alive
    //  reuse). 1 повторна спроба з backoff 500ms. 502/4xx НЕ ретраяться —
    //  то реальні фейли проксі/auth, ретрай не допоможе.
    // ──────────────────────────────────────────────────────────────
    function _apiOnce(method, path, body) {
        return new Promise((resolve, reject) => {
            const url = CONFIG.gateway.replace(/\/+$/, '') + path;
            GM_xmlhttpRequest({
                method,
                url,
                timeout: REQ_TIMEOUT_MS,
                headers: {
                    'Content-Type':  'application/json',
                    'Accept':        'application/json',
                    ...(JWT ? { 'Authorization': 'Bearer ' + JWT } : {}),
                },
                data: body ? JSON.stringify(body) : undefined,
                onload: (r) => {
                    let parsed = null;
                    try { parsed = JSON.parse(r.responseText); } catch {}
                    if (r.status >= 200 && r.status < 300) {
                        resolve(parsed || { ok: true });
                    } else {
                        reject({ status: r.status, body: parsed || r.responseText });
                    }
                },
                onerror:   (e) => reject({ status: 0, error: 'network', detail: e }),
                ontimeout: ()  => reject({ status: 0, error: 'timeout' }),
            });
        });
    }

    async function api(method, path, body) {
        try {
            return await _apiOnce(method, path, body);
        } catch (e) {
            // Транзитні TCP-проблеми (Chrome reused dead keep-alive socket) — ретраємо 1 раз.
            const transient = (e && (e.error === 'network' || e.error === 'timeout'));
            if (!transient) throw e;
            await new Promise(r => setTimeout(r, 500));
            return _apiOnce(method, path, body);
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  Logging to UI
    // ──────────────────────────────────────────────────────────────
    function uiLog(msg, level) {
        const box = document.getElementById('log_box');
        if (!box) return;
        const line = document.createElement('div');
        line.className = 'log-line ' + (level || '');
        const ts = new Date().toLocaleTimeString();
        line.innerHTML = '<span class="ts">' + ts + '</span>' + escapeHtml(msg);
        box.appendChild(line);
        // лишаємо тільки останні 200 рядків
        while (box.children.length > 200) box.removeChild(box.firstChild);
        box.scrollTop = box.scrollHeight;
    }

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
    }

    function setStatus(state, label) {
        const pill = document.getElementById('worker_status_pill');
        const text = document.getElementById('worker_status_text');
        if (pill) pill.className = 'status-pill ' + state;
        if (text) text.textContent = label;
    }

    function setCurrentTask(text) {
        // в багатопоточному режимі показуємо агрегат: скільки слотів активні + останній task
        const el = document.getElementById('current_task_text');
        if (!el) return;
        const active = activeSlotsCount();
        const lastTask = slotState.filter(s => s.currentTask).slice(-1)[0]?.currentTask;
        if (text) { el.textContent = text; return; }
        if (active === 0) { el.textContent = '—'; return; }
        const summary = `${active}/${CONCURRENCY} слотів активні`;
        const detail  = lastTask ? ` · ${lastTask.task_type} ${(lastTask.url || '').slice(-30)}` : '';
        el.textContent = summary + detail;
    }

    function refreshGlobalStatus() {
        if (!isRunning) return;
        if (Date.now() < backoffUntil) {
            const left = Math.ceil((backoffUntil - Date.now()) / 1000);
            setStatus('backoff', `Backoff: ${left}s`);
        } else if (activeSlotsCount() > 0) {
            setStatus('working', `Парсинг (${activeSlotsCount()}/${CONCURRENCY})`);
        } else {
            setStatus('idle', 'Очікую завдання...');
        }
        setCurrentTask(null);
    }

    function refreshStats() {
        for (const k of ['session', 'success', 'errors', 'captcha']) {
            const el = document.getElementById('stat_' + k);
            if (el) el.textContent = stats[k];
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  Auth
    // ──────────────────────────────────────────────────────────────
    async function authenticate() {
        if (!CONFIG.uuid || !CONFIG.secret) {
            setStatus('unconfigured', 'Не сконфігуровано — задай GM_setValue(\'dropsync_worker\', {...})');
            uiLog('Не вистачає uuid/secret. Виконай у консолі: GM_setValue(\'dropsync_worker\', {uuid:\'...\', secret:\'...\', gateway:\'' + CONFIG.gateway + '\'})', 'error');
            return false;
        }
        try {
            uiLog('Автентифікація...', 'ok');
            const res = await api('POST', '/worker/auth', {
                worker_uuid:    CONFIG.uuid,
                worker_secret:  CONFIG.secret,
                script_version: VERSION + ' (concurrency=' + CONCURRENCY + ')',
            });
            JWT = res.token;
            WORKER_INFO = { id: res.worker_id, name: res.name, regions: res.regions };

            // Override CONCURRENCY значенням з БД (workers.concurrency, керує адмін)
            if (typeof res.concurrency === 'number' && res.concurrency > 0) {
                CONCURRENCY = res.concurrency;
            }

            const nameEl = document.getElementById('worker_name_text');
            const uuidEl = document.getElementById('worker_uuid_text');
            if (nameEl) nameEl.textContent = res.name + ' [' + (res.regions.join(',') || 'all') + ']';
            if (uuidEl) uuidEl.textContent = CONFIG.uuid.slice(0, 12) + '…';

            uiLog('✓ Авторизовано як "' + res.name + '" (id=' + res.worker_id + '), потоки=' + CONCURRENCY, 'ok');
            setStatus('idle', 'Готовий до роботи');
            return true;
        } catch (e) {
            setStatus('error', 'Помилка авторизації');
            uiLog('Auth fail: ' + JSON.stringify(e.body || e.error || e), 'error');
            return false;
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  HTML parsing helpers (адаптовано з 0.22 + items_parse_start_multi.php)
    // ──────────────────────────────────────────────────────────────
    function parseHtmlToDoc(html) {
        return new DOMParser().parseFromString(html, 'text/html');
    }

    function isCaptchaPage(doc, html) {
        const title = (doc.title || '').toLowerCase();
        if (title.includes('robot check') || title.includes('captcha')) return true;
        if (doc.querySelector('#captchacharacters')) return true;
        if (doc.querySelector('form[action*="validateCaptcha" i]')) return true;
        if (doc.querySelector('img[src*="captcha" i]')) return true;
        const hint = (html || '').toLowerCase();
        if (hint.includes('enter the characters you see below')) return true;
        if (hint.includes('we just need to make sure you\'re not a robot')) return true;
        return false;
    }

    function extractAsin(doc, fallbackUrl) {
        // 1) З URL
        if (fallbackUrl) {
            const m = fallbackUrl.match(/\/dp\/([A-Z0-9]{10})/i) || fallbackUrl.match(/\/gp\/product\/([A-Z0-9]{10})/i);
            if (m) return m[1].toUpperCase();
        }
        // 2) З data-asin атрибута
        const el = doc.querySelector('[data-asin]');
        if (el && /^[A-Z0-9]{10}$/.test((el.getAttribute('data-asin') || '').toUpperCase())) {
            return el.getAttribute('data-asin').toUpperCase();
        }
        // 3) З <link rel="canonical">
        const can = doc.querySelector('link[rel="canonical"]');
        if (can) {
            const m = (can.href || '').match(/\/dp\/([A-Z0-9]{10})/i);
            if (m) return m[1].toUpperCase();
        }
        return null;
    }

    function extractTitle(doc) {
        const el = doc.querySelector('#productTitle');
        return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }

    function extractDescription(doc) {
        const parts = [];

        // 1) Bullet-points "About this item"
        const bullets = doc.querySelectorAll('#feature-bullets ul li:not(.aok-hidden) span.a-list-item');
        if (bullets.length) {
            const texts = Array.from(bullets).map(b => (b.textContent || '').trim()).filter(Boolean);
            if (texts.length) parts.push(texts.map(t => '• ' + t).join('\n'));
        }

        // 2) productDescription
        const desc = doc.querySelector('#productDescription');
        if (desc) {
            const t = (desc.textContent || '').replace(/\s+/g, ' ').trim();
            if (t) parts.push(t);
        }

        // 3) Important Information (Safety / Ingredients / Directions / Indications / Legal disclaimer)
        // Структура: <h4>Назва</h4><p>Текст</p> у кількох a-section.content блоках.
        const impInfo = doc.querySelector('#importantInformation_feature_div, #important-information');
        if (impInfo) {
            const sections = impInfo.querySelectorAll('.a-section.content');
            const blocks = [];
            sections.forEach(sec => {
                const h = sec.querySelector('h4');
                const heading = h ? (h.textContent || '').trim() : '';
                // Збираємо весь текст секції БЕЗ заголовка
                const sec_clone = sec.cloneNode(true);
                const hClone = sec_clone.querySelector('h4');
                if (hClone) hClone.remove();
                const body = (sec_clone.textContent || '').replace(/\s+/g, ' ').trim();
                if (body) blocks.push(heading ? `${heading}\n${body}` : body);
            });
            if (blocks.length) parts.push(blocks.join('\n\n'));
        }

        // 4) Aplus — fallback ТІЛЬКИ якщо більше нічого не знайшли
        const aplus = doc.querySelector('#aplus, #aplus_feature_div');
        if (aplus && parts.length === 0) {
            const t = (aplus.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 5000);
            if (t) parts.push(t);
        }

        return parts.join('\n\n');
    }

    // Витягує зображення з JS-блока Amazon (colorImages.initial[].hiRes), як це робить PHP-парсер.
    // Це КАНОНІЧНЕ джерело — Amazon віддає тут саме той список що в галереї, без дублів,
    // у high-resolution. DOM-парсинг лишається як fallback (старі сторінки / нестандартний рендер).
    function extractImagesFromScripts(doc, asin) {
        const out = [];
        if (!asin) return out;
        const scripts = doc.querySelectorAll('script');
        for (const s of scripts) {
            const js = s.textContent || '';
            // Скрипт має містити "'asin' : 'B0XXXXX'" — це гарантує що ми взяли блок саме цього товару
            // (Amazon кладе hiRes для variants теж — нам треба тільки поточний ASIN)
            const asinMarker = "'asin' : '" + asin + "'";
            if (js.indexOf(asinMarker) === -1) continue;

            // hiRes: "https://..." (з одинарними чи подвійними лапками)
            const re = /["']hiRes["']\s*:\s*["']([^"']+)["']/g;
            let m;
            const seen = new Set();
            while ((m = re.exec(js)) !== null) {
                const u = m[1];
                if (u && u.startsWith('http') && !seen.has(u)) {
                    seen.add(u);
                    out.push(u);
                }
            }
            if (out.length) return out;
        }
        return out;
    }

    function extractImages(doc, asin) {
        // ── 1) Спершу пробуємо JS-блок (canonical, без дублів). Як у PHP-парсері.
        const fromScript = extractImagesFromScripts(doc, asin);
        if (fromScript.length) return fromScript.slice(0, 15);

        // ── 2) Fallback: DOM-парсинг (старіші Amazon-шаблони або нестандартні сторінки).
        // Map: stem (basename URL без _SL.../_AC_... суфіксів) → {url, w}.
        const map = new Map();

        // Стема = ім'я файлу БЕЗ шляху і БЕЗ Amazon-суфіксів розміру.
        // Amazon роздає той же файл через різні CDN-префікси (/images/I/, /images/W/MEDIAX_X/,
        // /images/G/01/...), тому простий regex по URL не дедуплікує. Беремо basename.
        const stemOf = (url) => {
            const file = (url.split('?')[0].split('/').pop() || url);
            return file.replace(/\._[A-Z0-9_,]+_\./i, '.');
        };

        function addImg(url, w) {
            if (!url || typeof url !== 'string' || !url.startsWith('http')) return;
            const stem = stemOf(url);
            const ex = map.get(stem);
            if (!ex || w > ex.w) map.set(stem, { url, w: w || 0 });
        }

        // 1) imgBlkFront / landingImage — головне зображення
        const main = doc.querySelector('#landingImage, #imgBlkFront');
        if (main) {
            // data-old-hires — це найвища роздільна здатність (один URL)
            const hires = main.getAttribute('data-old-hires');
            if (hires && hires.startsWith('http')) addImg(hires, 9999);

            // data-a-dynamic-image — JSON {url: [w,h]} різних розмірів. Беремо найбільший.
            const dyn = main.getAttribute('data-a-dynamic-image');
            if (dyn && dyn.startsWith('{')) {
                try {
                    const obj = JSON.parse(dyn);
                    for (const u in obj) {
                        const w = (Array.isArray(obj[u]) && obj[u][0]) || 0;
                        addImg(u, w);
                    }
                } catch {}
            }
            if (main.src) addImg(main.src, 0);
        }

        // 2) altImages thumbnails — data-a-dynamic-image на <img>
        doc.querySelectorAll('#altImages img, li.imageThumbnail img, ul.regularAltImageViewLayout img').forEach(img => {
            const ds = img.getAttribute('data-a-dynamic-image');
            if (ds && ds.startsWith('{')) {
                try {
                    const obj = JSON.parse(ds);
                    for (const u in obj) {
                        const w = (Array.isArray(obj[u]) && obj[u][0]) || 0;
                        addImg(u, w);
                    }
                } catch {}
            }
            // Замінити thumbnail-розмір на повний (Amazon: ._AC_US40_.jpg → ._SL1500_.jpg)
            if (img.src) {
                const full = img.src.replace(/\._[A-Z0-9_,]+_\./i, '._SL1500_.');
                addImg(full, 1500);
            }
        });

        // 3) JSON-LD у <script>
        doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
            try {
                const obj = JSON.parse(s.textContent || '');
                const arr = Array.isArray(obj.image) ? obj.image : (obj.image ? [obj.image] : []);
                arr.forEach(u => addImg(u, 0));
            } catch {}
        });

        // Повертаємо тільки URL найбільшого розміру кожного унікального зображення
        return Array.from(map.values()).map(v => v.url).slice(0, 15);
    }

    function extractBrand(doc) {
        // 1) bylineInfo
        const byline = doc.querySelector('#bylineInfo');
        if (byline) {
            let t = (byline.textContent || '').replace(/\s+/g, ' ').trim();
            // "Visit the X Store" → X
            t = t.replace(/^Visit the\s+/i, '').replace(/\s+Store$/i, '');
            t = t.replace(/^Brand:\s*/i, '');
            t = t.replace(/‎|‏|‪|‮/g, '').trim();
            if (t) return t;
        }
        // 2) detail bullets
        const rows = doc.querySelectorAll('#detailBullets_feature_div li, table.prodDetTable tr');
        for (const row of rows) {
            const txt = (row.textContent || '').replace(/\s+/g, ' ').trim();
            const m = txt.match(/^(?:Brand|Marke|Marca|Marque)[\s:]+(.+?)(?:\s{2,}|$)/i);
            if (m) return m[1].trim();
        }
        return '';
    }

    // Чистимо текст від LRM/RTL/zero-width chars які Amazon вставляє в RTL/LTR вмішаних блоках
    function cleanText(s) {
        return String(s ?? '')
            .replace(/[‎‏‪-‮⁦-⁩﻿]/g, '')  // LRM, RLM, LRE/RLE/PDF, ZWNJ etc.
            .replace(/\s+/g, ' ')
            .trim();
    }

    function extractSpecifications(doc) {
        const specs = {};

        // 1) Стандартні таблиці tech specs (різні селектори що Amazon рендерить)
        const tableSelectors = [
            'table.prodDetTable tr',
            'table#productDetails_techSpec_section_1 tr',
            'table#productDetails_detailBullets_sections1 tr',
            'table.a-keyvalue tr',
        ];
        doc.querySelectorAll(tableSelectors.join(', ')).forEach(tr => {
            const th = tr.querySelector('th');
            const td = tr.querySelector('td');
            if (!th || !td) return;
            const key = cleanText(th.textContent).replace(/[:\s]+$/, '');
            const val = cleanText(td.textContent);
            if (key && val) specs[key] = val;
        });

        // 2) Bullet-list у detailBullets (з LRM/RTL marks)
        doc.querySelectorAll('#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li').forEach(li => {
            const bold = li.querySelector('span.a-text-bold');
            if (!bold) return;
            const boldRaw = bold.textContent || '';
            const key = cleanText(boldRaw).replace(/[:\s]+$/, '');
            const all = cleanText(li.textContent);
            const val = cleanText(all.replace(cleanText(boldRaw), '')).replace(/^[:\s]+/, '');
            if (key && val) specs[key] = val;
        });

        // 3) "Технічні характеристики" блок (новий формат Amazon DE)
        doc.querySelectorAll('#productOverview_feature_div table tr, #poExpander table tr').forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length < 2) return;
            const key = cleanText(cells[0].textContent).replace(/[:\s]+$/, '');
            const val = cleanText(cells[1].textContent);
            if (key && val) specs[key] = val;
        });

        return Object.keys(specs).length ? specs : null;
    }

    function extractDimensions(doc) {
        const out = { weight_kg: 0, depth_cm: 0, width_cm: 0, height_cm: 0 };
        const all = extractSpecifications(doc) || {};

        const RE_WEIGHT_KEY = /(weight|gewicht|peso|poids|вага|вес)/i;
        const RE_DIM_KEY    = /(dimension|abmessung|dimensione|misure|tamaño|габарит|размер)/i;

        const entries = Object.entries(all);

        // ── Збираємо ВСІ кандидати ваги і беремо MAX ────────────────
        // Чому max: інколи Amazon у "Artikelgewicht" пише дурне (500 Milligramm),
        // а реальна вага у "Anzahl von Einheiten" (116 gramm). Беремо найбільшу — ризик
        // взяти "12 kg cat food" з title прийнятний, бо це майже завжди правда.
        const candidates = [];

        // Спершу — поля з вагою у ключі (item/package weight, Artikelgewicht...)
        for (const [k, v] of entries) {
            if (RE_WEIGHT_KEY.test(k)) {
                const w = parseWeightKg(v);
                if (w > 0) candidates.push(w);
            }
        }
        // Потім — Dimensions tail "30 x 20 x 10 cm; 200 g"
        for (const [k, v] of entries) {
            if (!RE_DIM_KEY.test(k)) continue;
            const tail = (v.includes(';') ? v.split(';').pop() : v);
            const w = parseWeightKg(tail);
            if (w > 0) candidates.push(w);
        }
        // Brute scan: будь-яке значення зі специфікацій (наприклад "Anzahl von Einheiten = 116 gramm")
        for (const [, v] of entries) {
            const w = parseWeightKg(v);
            if (w > 0) candidates.push(w);
        }
        // Title — як останній шанс ("100g Berberine", "1.5 kg ...")
        const titleEl = doc.querySelector('#productTitle');
        if (titleEl) {
            const w = parseWeightKg(titleEl.textContent || '');
            if (w > 0) candidates.push(w);
        }

        if (candidates.length) {
            out.weight_kg = Math.max(...candidates);
        }

        // 2) Розміри — за ключем
        for (const [k, v] of entries) {
            if (RE_DIM_KEY.test(k)) {
                const d = parseDimsCm(v);
                if (d) { Object.assign(out, d); break; }
            }
        }
        // 2b) Brute scan для розмірів (parseDimsCm теж строгий — потребує "X x Y x Z UNIT")
        if (out.depth_cm === 0) {
            for (const [, v] of entries) {
                const d = parseDimsCm(v);
                if (d) { Object.assign(out, d); break; }
            }
        }

        // Floor 0.5 кг: реальна вага зберігається як є, але якщо вона менша за 0.5 кг
        // (включно з випадком "не знайшли" — out.weight_kg=0) — піднімаємо до 0.5.
        // Все що ≥0.5 лишаємо без змін (без округлення вгору, на відміну від старої 0.22).
        if (out.weight_kg < 0.5) out.weight_kg = 0.5;

        return out;
    }

    function parseWeightKg(text) {
        if (!text) return 0;
        const t = cleanText(text);
        // ВАЖЛИВО: множинні форми "Kilograms", "Pounds", "Gramms" — тому ?-суфікс на більшості.
        // Порядок альтернатив теж важливий: спочатку довші ("milligramm/milligrams"),
        // потім "mg", потім "kilogramm/kilograms", "kg", "gramm/grams", і лише в кінці "g\b".
        const re = /(\d[\d\.,]*)\s*(milligramms?|milligrams?|mg|kilogramms?|kilograms?|kgs?|gramms?|grams?|pounds?|lbs?|ounces?|oz|g)\b/i;
        const m = t.match(re);
        if (!m) return 0;
        let n = parseFloat(m[1].replace(',', '.'));
        const u = m[2].toLowerCase();
        if (isNaN(n) || n <= 0) return 0;
        if (u === 'mg' || u.startsWith('milli'))                    n /= 1_000_000; // mg → kg
        else if (u.startsWith('kg') || u.startsWith('kilo'))        { /* already kg */ }
        else if (u === 'g' || u.startsWith('gramm') || u.startsWith('gram')) n /= 1000;
        else if (u.startsWith('pound') || u.startsWith('lb'))        n *= 0.453592;
        else if (u.startsWith('ounce') || u === 'oz')                n *= 0.0283495;
        return Number(n.toFixed(4));
    }

    function parseDimsCm(text) {
        if (!text) return null;
        const t = cleanText(text);
        // "30 x 20 x 10 cm" / "30 x 20 x 10 inches" / "30,5 × 20 × 10 cm"
        const m = t.match(/(\d[\d\.,]*)\s*[x×*]\s*(\d[\d\.,]*)\s*[x×*]\s*(\d[\d\.,]*)\s*(cm|mm|inches?|in)\b/i);
        if (!m) return null;
        let a = parseFloat(m[1].replace(',', '.')),
            b = parseFloat(m[2].replace(',', '.')),
            c = parseFloat(m[3].replace(',', '.'));
        const u = m[4].toLowerCase();
        if (u.startsWith('mm')) { a/=10; b/=10; c/=10; }
        else if (u.startsWith('in')) { a*=2.54; b*=2.54; c*=2.54; }
        return {
            depth_cm:  Number(a.toFixed(2)),
            width_cm:  Number(b.toFixed(2)),
            height_cm: Number(c.toFixed(2)),
        };
    }

    function extractPrice(doc) {
        // 1) hidden a-offscreen
        const hidden = doc.querySelector('.a-price .a-offscreen');
        if (hidden) {
            const m = (hidden.textContent || '').match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
            if (m) return parseFloat(m[1].replace(',', '.'));
        }
        // 2) split whole + fraction
        const whole = doc.querySelector('.a-price .a-price-whole');
        const frac  = doc.querySelector('.a-price .a-price-fraction');
        if (whole) {
            const w = (whole.textContent || '').replace(/\D/g, '');
            const f = frac ? (frac.textContent || '').replace(/\D/g, '') : '00';
            if (w) return parseFloat(w + '.' + (f || '00'));
        }
        // 3) старі id
        for (const id of ['#priceblock_ourprice', '#priceblock_dealprice', '#priceblock_saleprice']) {
            const e = doc.querySelector(id);
            if (e) {
                const m = (e.textContent || '').match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
                if (m) return parseFloat(m[1].replace(',', '.'));
            }
        }
        return 0;
    }

    // Витягує ціну доставки з Amazon DOM. Аналог PHP extractDeliveryPrice().
    // Використовується сервером для розрахунку cost_now (shipping компонент).
    function extractShippingPrice(doc) {
        // 1) data-csa-c-delivery-price="4,99 €"
        const el = doc.querySelector('[data-csa-c-delivery-price]');
        if (el) {
            const rawAttr = (el.getAttribute('data-csa-c-delivery-price') || '').trim();
            // FREE -> 0 (Amazon explicit free shipping)
            if (/^FREE$/i.test(rawAttr)) return 0;
            const raw = rawAttr.replace(/[€$£ \s]/g, '').replace(',', '.').trim();
            const n = parseFloat(raw);
            if (!isNaN(n) && n >= 0) return n;
        }
        // Text fallback: FREE delivery / Kostenlose Lieferung / Livraison gratuite
        const bodyText = doc.body ? (doc.body.textContent || '') : '';
        if (/(?:^|\W)(?:FREE\s+delivery|Kostenlose\s+Lieferung|Livraison\s+gratuite|Spedizione\s+GRATUITA|Envío\s+GRATIS)\b/i.test(bodyText)) {
            return 0;
        }
        // 2) "Lieferung für 4,99 €" / "Delivery for $4.99"
        const html = doc.body ? (doc.body.textContent || '') : '';
        const m = html.match(/(?:Lieferung\s+für|Delivery\s+for|Livraison\s+pour)\s+([\d\.,]+)\s*(?:€|\$|£)/i);
        if (m) {
            const n = parseFloat(m[1].replace(',', '.'));
            if (!isNaN(n) && n >= 0) return n;
        }
        return null; // не знайдено — сервер використає fallback (10.0)
    }

    function extractAvailability(doc) {
        // Перевіряємо primary-availability-message
        const primary = doc.querySelector('.primary-availability-message, #availability span');
        const text = primary ? (primary.textContent || '').toLowerCase() : '';

        // "Only N left" pattern
        const patterns = [
            /only\s+(\d+)\s+left/i,
            /nur\s+noch\s+(\d+)/i,
            /il\s+ne\s+reste\s+plus\s+que\s+(\d+)/i,
            /solo\s+(\d+)\s+(?:en\s+stock|disponibili)/i,
        ];
        for (const p of patterns) {
            const m = text.match(p);
            if (m) {
                const qty = parseInt(m[1], 10);
                return { available: qty > 0 ? 1 : 0, quantity: qty };
            }
        }

        // In stock keywords
        const inStock = ['in stock', 'auf lager', 'en stock', 'disponibile', 'disponible'];
        for (const w of inStock) {
            if (text.includes(w)) return { available: 1, quantity: 999 };
        }

        // Out of stock
        const oos = ['out of stock', 'nicht verfügbar', 'derzeit nicht', 'non disponibile', 'currently unavailable'];
        for (const w of oos) {
            if (text.includes(w)) return { available: 0, quantity: 0 };
        }

        // Якщо є buy-box — вважаємо в наявності
        if (doc.querySelector('#add-to-cart-button, #buy-now-button')) {
            return { available: 1, quantity: 999 };
        }

        return { available: 0, quantity: 0 };
    }

    function extractCurrency(doc, region) {
        // З HTML — символ валюти
        const priceText = (doc.querySelector('.a-price .a-offscreen') || {}).textContent || '';
        if (priceText.includes('$')) return 'USD';
        if (priceText.includes('£')) return 'GBP';
        if (priceText.includes('€')) return 'EUR';
        // За регіоном
        const map = { US: 'USD', UK: 'GBP', CA: 'CAD', AU: 'AUD', JP: 'JPY', IN: 'INR' };
        return map[region] || 'EUR';
    }

    function detectFBAOrPrime(doc) {
        // Pattern matching на тексті сторінки
        const html = (doc.body && doc.body.innerHTML) || '';
        if (/<i[^>]*class="[^"]*a-icon-prime/i.test(html)) return 1;
        const fromPatterns = ['Ships from</span>\\s*<span[^>]*>\\s*Amazon',
                              'Versand</span>\\s*<span[^>]*>\\s*Amazon',
                              'Verkauft\\s+(?:von|durch)</span>\\s*<span[^>]*>\\s*Amazon'];
        for (const p of fromPatterns) {
            if (new RegExp(p, 'i').test(html)) return 1;
        }
        return 0;
    }

    // ──────────────────────────────────────────────────────────────
    //  Task processors
    // ──────────────────────────────────────────────────────────────
    async function processTask(task, slotIdx) {
        const slot = slotState[slotIdx];
        slot.currentTask = task;
        slot.active = true;
        refreshGlobalStatus();

        // Safety: не оновлюємо item частіше за 1 раз/годину навіть якщо сервер віддав
        if (task.task_type === 'price_check' && task.item_id && alreadyCheckedRecently(task.item_id)) {
            uiLog(`[s${slotIdx}] ⏩ Skip ${task.asin || task.item_id} — checked < 1h ago (local cache)`, 'warn');
            try {
                await api('POST', '/worker/release-item', {
                    queue_id: task.queue_id || null,
                    item_id:  task.item_id || null,
                });
            } catch {}
            slot.currentTask = null;
            slot.active = false;
            refreshGlobalStatus();
            return;
        }

        try {
            // 1) Fetch HTML через Public API (сервер використає proxy з proxy table)
            uiLog(`[s${slotIdx}] → Fetch HTML via proxy: ${(task.url || '').slice(0, 70)}...`, 'ok');
            const fetchRes = await api('POST', '/worker/fetch-html', {
                item_id: task.queue_id || task.item_id,
                url:     task.url,
            });
            const html = fetchRes.html || '';

            const doc = parseHtmlToDoc(html);

            // 2) Captcha-перевірка
            if (isCaptchaPage(doc, html)) {
                stats.captcha++;
                refreshStats();
                uiLog(`[s${slotIdx}] 🛡 Captcha detected → /worker/captcha-hit`, 'warn');
                const cap = await api('POST', '/worker/captcha-hit', {
                    item_id:    task.item_id || task.queue_id,
                    asin:       task.asin || extractAsin(doc, task.url),
                    url:        task.url,
                    page_title: doc.title || '',
                });
                uiLog(`[s${slotIdx}] Captcha response: action=${cap.action}, wait=${cap.wait_sec}s`, 'warn');
                if (cap.action === 'stop') {
                    setStatus('error', 'Permanently banned (5+ captcha/24h)');
                    isRunning = false;
                    return;
                }
                if (cap.action === 'backoff') {
                    backoffUntil = Date.now() + (cap.wait_sec * 1000);
                }
                return;
            }

            // 3) Парсинг полів
            const asin = extractAsin(doc, task.url);
            if (!asin) {
                throw new Error('ASIN not found in HTML — likely half-page or weird page');
            }

            let payload = {
                item_id:   task.queue_id || task.item_id,
                task_type: task.task_type,
                asin,
            };

            if (task.task_type === 'parse_full') {
                payload = {
                    ...payload,
                    title:          extractTitle(doc),
                    description:    extractDescription(doc),
                    images:         extractImages(doc, asin),
                    brand:          extractBrand(doc),
                    specifications: extractSpecifications(doc),
                    ...extractDimensions(doc),
                    ...((p, a) => ({ price: p, available: a.available, quantity: a.quantity }))(extractPrice(doc), extractAvailability(doc)),
                    currency:       extractCurrency(doc, task.region),
                    prime:          detectFBAOrPrime(doc),
                    shipping_price: extractShippingPrice(doc),  // Amazon→hub у країні (для cost_now)
                };

                // Зберегти сирий HTML на сервер (для дебагу)
                if (task.save_source && asin) {
                    api('POST', '/worker/save-source', { asin, html, url: task.url }).catch(() => {});
                }

                uiLog(`[s${slotIdx}] ✓ Parsed FULL: "${(payload.title||'').slice(0,55)}..." price=${payload.price} ${payload.currency}`, 'ok');
            } else {
                // price_check — мінімум полів
                const av = extractAvailability(doc);
                payload = {
                    ...payload,
                    price:          extractPrice(doc),
                    currency:       extractCurrency(doc, task.region),
                    available:      av.available,
                    quantity:       av.quantity,
                    prime:          detectFBAOrPrime(doc),
                    shipping_price: extractShippingPrice(doc),  // дозволяє перерахувати shipping при price_check
                };
                uiLog(`[s${slotIdx}] ✓ Parsed PRICE: ${asin} price=${payload.price} avail=${payload.available}`, 'ok');
            }

            // 4) Report result
            await api('POST', '/worker/report-result', payload);
            stats.success++;
            stats.session++;
            refreshStats();

            // Запам'ятати що щойно перевірили — щоб не довбати знов протягом години
            if (task.task_type === 'price_check' && task.item_id) markChecked(task.item_id);
        } catch (e) {
            stats.errors++;
            stats.session++;
            refreshStats();
            uiLog(`[s${slotIdx}] ✗ Task failed: ${e.body?.error || e.error || e.message || JSON.stringify(e)}`, 'error');

            // Звільнити lock
            try {
                await api('POST', '/worker/release-item', {
                    queue_id: task.queue_id || null,
                    item_id:  task.item_id || null,
                });
            } catch {}

            // ВАЖЛИВО: backoff впливає на ВСІ слоти (anti-cascade)
            backoffUntil = Date.now() + BACKOFF_AFTER_ERROR;
        } finally {
            slot.currentTask = null;
            slot.active = false;
            refreshGlobalStatus();
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  Slot loop — кожен слот крутиться сам по собі async
    // ──────────────────────────────────────────────────────────────
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    async function slotLoop(slotIdx) {
        // Стартова затримка щоб слоти не били одночасно (розсинхрон ~ slotIdx × 500ms)
        await sleep(slotIdx * 500);

        while (isRunning) {
            // Глобальний backoff — пауза для ВСІХ слотів
            if (Date.now() < backoffUntil) {
                refreshGlobalStatus();
                await sleep(1000);
                continue;
            }

            try {
                const task = await api('GET', '/worker/get-next-task?v=' + encodeURIComponent(VERSION + ' (concurrency=' + CONCURRENCY + ')'));
                if (!task.ok || !task.task_type) {
                    // черга порожня → idle pause
                    refreshGlobalStatus();
                    await sleep(TICK_INTERVAL_MS);
                    continue;
                }
                await processTask(task, slotIdx);
            } catch (e) {
                stats.errors++;
                refreshStats();
                const msg = e.body?.error || e.error || e.message || JSON.stringify(e);
                uiLog(`[s${slotIdx}] Loop error: ${msg}`, 'error');

                if (e.status === 401 || e.status === 403) {
                    uiLog(`[s${slotIdx}] Trying re-auth...`, 'warn');
                    JWT = null;
                    const ok = await authenticate();
                    if (!ok) {
                        // воркер заблоковано/видалено — стоп всіх слотів
                        isRunning = false;
                        return;
                    }
                } else if (e.status === 429) {
                    const wait = (e.body?.wait_sec || 60);
                    backoffUntil = Date.now() + (wait * 1000);
                } else {
                    backoffUntil = Date.now() + BACKOFF_AFTER_ERROR;
                }
                await sleep(BACKOFF_AFTER_ERROR);
            }
        }
    }

    async function heartbeat() {
        if (!JWT) return;
        try {
            const anyTask = slotState.find(s => s.currentTask)?.currentTask || null;
            await api('POST', '/worker/heartbeat', {
                status:          activeSlotsCount() > 0 ? 'working' : (Date.now() < backoffUntil ? 'backoff' : 'idle'),
                current_url:     anyTask?.url || null,
                current_item_id: anyTask?.item_id || anyTask?.queue_id || null,
                current_asin:    anyTask?.asin || null,
                script_version:  VERSION + ' (concurrency=' + CONCURRENCY + ')',
            });
        } catch (e) { /* не критично */ }
    }

    // ──────────────────────────────────────────────────────────────
    //  Boot — запускаємо CONCURRENCY паралельних слотів
    // ──────────────────────────────────────────────────────────────
    async function boot() {
        if (!document.getElementById('dropsync_worker_marker')) {
            console.warn('[DropSync Worker] Not on worker-runner page, skipping.');
            return;
        }

        // Multi-worker isolation: якщо CONFIG.worker_key задано (наприклад 'de'/'us'),
        // запускаємось ТІЛЬКИ якщо URL містить ?w=<key>. Без worker_key — без перевірки.
        const urlKey = new URLSearchParams(location.search).get('w');
        if (CONFIG.worker_key && urlKey !== CONFIG.worker_key) {
            console.info(`[DropSync Worker ${CONFIG.worker_key}] Skip: URL ?w=${urlKey || '<none>'} ≠ CONFIG.worker_key=${CONFIG.worker_key}`);
            return;
        }

        uiLog(`DropSync Worker v${VERSION} (${CONFIG.worker_key || 'default'}) booting...`, 'ok');

        const ok = await authenticate();
        if (!ok) return;

        // Тепер коли CONCURRENCY оновлено з auth response — створюємо слоти
        initSlotState(CONCURRENCY);

        isRunning = true;
        refreshStats();

        // Heartbeat одразу + кожні 5 хв
        heartbeat();
        setInterval(heartbeat, HEARTBEAT_MS);

        // Status updater (тіки що показують backoff countdown)
        setInterval(refreshGlobalStatus, 1000);

        // Запускаємо CONCURRENCY паралельних слотів — fire-and-forget
        for (let i = 0; i < CONCURRENCY; i++) {
            slotLoop(i).catch(e => {
                console.error(`[slot ${i}] crashed:`, e);
                uiLog(`[s${i}] FATAL crash — slot stopped: ${e.message}`, 'error');
            });
        }

        uiLog(`✓ ${CONCURRENCY} паралельних слотів запущено`, 'ok');
    }

    // Затримка ~3 сек щоб дати сторінці прогрузитись
    setTimeout(boot, 3000);

})();
