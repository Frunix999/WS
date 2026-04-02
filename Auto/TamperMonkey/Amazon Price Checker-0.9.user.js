// ==UserScript==
// @name         Amazon Price Checker 0.9
// @namespace    http://tampermonkey.net/
// @version      0.9
// @match        https://www.amazon.de
// @match        https://www.amazon.de/*
// @match        https://amazon.de
// @match        https://amazon.de/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  console.log('🔥 TM START:', location.href);

  /* =========================
     HELPERS
  ========================= */
  function releaseItem(itemId) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'http://127.0.0.1:8008/release-item',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ id: itemId }),
        onload: () => resolve(true),
        onerror: () => resolve(false),
      });
    });
  }

  function isAmazonProtectionPage() {
  const url = location.href.toLowerCase();
  const title = (document.title || '').toLowerCase();

  if (
    url.includes('/errors/validatecaptcha') ||
    url.includes('validatecaptcha') ||
    url.includes('/captcha/') ||
    url.includes('captcha') ||
    url.includes('/errors/') && url.includes('captcha')
  ) {
    console.warn('🛡️ Protection detected: URL match', url);
    return true;
  }

  const captchaInput =
    document.querySelector('#captchacharacters') ||
    document.querySelector('input[name="field-keywords"][type="text"][maxlength="6"]'); // иногда бывает

  const captchaForm =
    document.querySelector('form[action*="validateCaptcha"]') ||
    document.querySelector('form[action*="validatecaptcha"]') ||
    document.querySelector('form[action*="/errors/validateCaptcha"]') ||
    document.querySelector('form[action*="/errors/validatecaptcha"]');

  const captchaImg =
    document.querySelector('img[alt*="captcha" i]') ||
    document.querySelector('img[src*="captcha" i]');

  if (captchaInput || captchaForm || captchaImg) {
    console.warn('🛡️ Protection detected: captcha DOM elements', {
      captchaInput: !!captchaInput,
      captchaForm: !!captchaForm,
      captchaImg: !!captchaImg
    });
    return true;
  }

  if (title.includes('robot check') || title.includes('captcha')) {
    console.warn('🛡️ Protection detected: title', title);
    return true;
  }

  const bodyText = (document.body?.innerText || '').toLowerCase();

  const strongTextSignals = [
    'enter the characters you see below',
    'type the characters you see in this image',
    'we just need to make sure you\'re not a robot',
    'to continue, please',
  ];

  for (const s of strongTextSignals) {
    if (bodyText.includes(s)) {
      console.warn('🛡️ Protection detected: strong text signal', s);
      return true;
    }
  }

  const hasProductTitle = !!document.querySelector('#productTitle');
  const hasPrice =
    !!document.querySelector('.a-price .a-offscreen') ||
    !!document.querySelector('span.a-price-whole') ||
    !!document.querySelector('#priceblock_ourprice, #priceblock_dealprice, #priceblock_saleprice');

  const hasBuyBox = !!document.querySelector('#add-to-cart-button, #buy-now-button, #desktop_buybox');

  if (hasProductTitle && (hasPrice || hasBuyBox)) {
    return false;
  }

  if (!hasProductTitle && !hasBuyBox) {
    if (bodyText.includes('robot') && bodyText.includes('captcha')) {
      console.warn('🛡️ Protection detected: fallback robot+captcha without product blocks');
      return true;
    }
  }

  return false;
}

  function updateWeightInDB(itemId, weightKg) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'http://127.0.0.1:8008/update-weight',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ id: itemId, weight_kg: Number(weightKg.toFixed(3)) }),
        onload: (r) => {
          console.log('✅ update-weight:', r.responseText);
          resolve(true);
        },
        onerror: (e) => {
          console.error('❌ update-weight error:', e);
          resolve(false);
        }
      });
    });
  }


  function extractPackageWeightKg() {
    const rows = document.querySelectorAll('table.prodDetTable tr');

    for (const tr of rows) {
      const th = tr.querySelector('th');
      const td = tr.querySelector('td');
      if (!th || !td) continue;

      const key = (th.textContent || '').trim().toLowerCase();
      if (key !== 'gewicht des pakets') continue;

      const valText = (td.textContent || '').trim(); // "6,79 Kilogramm"
      const m = valText.match(/([\d\.,]+)\s*([a-zA-Z\.]+)/);
      if (!m) return 0;

      let num = parseFloat(m[1].replace(',', '.'));
      let unit = (m[2] || '').toLowerCase().replace('.', '').trim();

      if (isNaN(num)) return 0;

      if (unit === 'gramm' || unit === 'g') {
        num = num / 1000; // g → kg
      } else if (unit === 'kilogramm' || unit === 'kilogram' || unit === 'kg') {
        // already kg
      } else {
        console.log('⚠️ Unknown weight unit:', unit, 'raw:', valText);
        return 0;
      }

      console.log('📦 Package weight kg:', num);
      return num;
    }

    console.log('⚠️ Package weight not found');
    return 0;
  }

  function getAsin() {
    let m = location.href.match(/\/dp\/([A-Z0-9]{10})/i) ||
            location.href.match(/\/gp\/product\/([A-Z0-9]{10})/i);
    if (m) return m[1].toUpperCase();

    const el = document.querySelector('[data-asin]');
    if (el && el.getAttribute('data-asin')) {
      const a = el.getAttribute('data-asin').trim().toUpperCase();
      if (/^[A-Z0-9]{10}$/.test(a)) return a;
    }

    return 'UNKNOWN';
  }

  function saveSourceToApi(asin, html) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'http://127.0.0.1:8000/save-source',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({
          asin: asin,
          url: location.href,
          platform: location.hostname,
          html: html
        }),
        onload: (r) => {
          try {
            const j = JSON.parse(r.responseText);
            console.log('✅ save-source:', j);
            resolve(j);
          } catch (e) {
            console.warn('⚠️ save-source bad json:', r.responseText);
            resolve({ status: 'bad_json' });
          }
        },
        onerror: (e) => {
          console.error('❌ save-source error:', e);
          reject(e);
        }
      });
    });
  }

  function apiLog(module, event, level, data) {
    GM_xmlhttpRequest({
      method: 'POST',
      url: 'http://127.0.0.1:8008/log',
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        module: module,
        event: event,
        level: level,
        data: data || {}
      }),
      onerror: e => console.error('❌ apiLog failed', e)
    });
  }

  function fetchRates(callback) {
    GM_xmlhttpRequest({
      method: 'GET',
      url: 'http://127.0.0.1:8008/get-rates',
      timeout: 5000,
      onload: r => {
        if (!r.responseText || r.responseText.trim() === '') {
          console.error('❌ Rates response empty');
          return;
        }
        try {
          const data = JSON.parse(r.responseText);
          if (typeof data.usd !== 'number' || typeof data.eur !== 'number' || typeof data.gbp !== 'number') {
            console.error('❌ Rates malformed:', data);
            return;
          }
          callback(data);
        } catch (e) {
          console.error('❌ Failed to parse rates:', r.responseText, e);
        }
      },
      onerror: e => console.error('❌ Rates request failed', e)
    });
  }

  function calculateFinalPrice({ profit, price, shipping, shippingUA, sourcePlatform, rates }) {
    let cost = price + profit + shipping + shippingUA;
    cost *= 1.25;

    const currency = detectCurrencyByPlatform(sourcePlatform);

    let rate = 0;
    switch (currency) {
      case 'USD': rate = rates.usd; break;
      case 'GBP': rate = rates.gbp; break;
      default: rate = rates.eur;
    }

    const costUAH = cost * rate;

    return {
      cost_now: Number(cost.toFixed(2)),
      cost_now_uah: Number(costUAH.toFixed(2)),
      currency: currency
    };
  }

  function detectCurrencyByPlatform(sourcePlatform) {
    if (!sourcePlatform) return 'EUR';
    const domain = sourcePlatform.toLowerCase();
    if (domain.endsWith('amazon.com')) return 'USD';
    if (domain.endsWith('amazon.co.uk')) return 'GBP';
    return 'EUR';
  }

  function getShippingByRegion(region, weightKg) {
    if (!weightKg || weightKg <= 0) return 0.0;

    switch (region) {
      case 'EU':
        if (weightKg <= 0.5) return 5.28;
        if (weightKg <= 1.0) return 7.86;
        if (weightKg <= 1.5) return 9.16;
        return 12.18;
      case 'UK':
        if (weightKg <= 0.5) return 4.99;
        if (weightKg <= 1.0) return 6.99;
        if (weightKg <= 1.5) return 8.99;
        return 11.99;
      case 'US':
        if (weightKg <= 0.5) return 3.99;
        if (weightKg <= 1.0) return 5.99;
        if (weightKg <= 1.5) return 7.99;
        return 12.99;
      case 'CA':
        if (weightKg <= 0.5) return 4.50;
        if (weightKg <= 1.0) return 6.50;
        return 9.50;
      case 'AU':
        if (weightKg <= 0.5) return 5.50;
        if (weightKg <= 1.0) return 8.00;
        return 12.00;
      case 'JP':
        if (weightKg <= 0.5) return 400;
        if (weightKg <= 1.0) return 600;
        return 900;
      case 'IN':
        if (weightKg <= 0.5) return 100;
        if (weightKg <= 1.0) return 150;
        return 200;
      default:
        return 0.0;
    }
  }

  function detectAmazonRegion(sourcePlatform) {
    if (!sourcePlatform) return 'OTHER';
    const domain = sourcePlatform.toLowerCase();

    const euDomains = [
      'amazon.de','amazon.fr','amazon.it','amazon.es','amazon.nl','amazon.pl','amazon.se','amazon.be'
    ];

    if (domain.endsWith('amazon.co.uk')) return 'UK';
    if (domain.endsWith('amazon.com')) return 'US';
    if (domain.endsWith('amazon.ca')) return 'CA';
    if (domain.endsWith('amazon.com.au')) return 'AU';
    if (domain.endsWith('amazon.co.jp')) return 'JP';
    if (domain.endsWith('amazon.in')) return 'IN';

    for (const d of euDomains) {
      if (domain.endsWith(d)) return 'EU';
    }

    return 'OTHER';
  }

  function getShippingByPrime(prime) {
    if (prime === 1) return 0.0;
    const shipping = extractDeliveryPriceFromDOM();
    if (shipping !== null) return shipping;
    return 10.0;
  }

  function extractDeliveryPriceFromDOM() {
    const html = document.body.innerHTML;

    let m = html.match(/data-csa-c-delivery-price="([^"]+)"/i);
    if (m && m[1]) {
      let shippingPrice = m[1].trim()
        .replace(/&nbsp;/g, ' ')
        .replace(/€/g, '')
        .trim()
        .replace(',', '.');

      const val = parseFloat(shippingPrice);
      return !isNaN(val) ? val : null;
    }

    m = html.match(/Lieferung\s+für\s+([\d\.,]+)\s*€/i);
    if (m && m[1]) {
      const val = parseFloat(m[1].replace(',', '.'));
      return !isNaN(val) ? val : null;
    }

    return null;
  }

  function detectFBAFromDOM() {
    let html = document.body.innerHTML.replace(/[\n\r\t]/g, '');

    const patternsFrom = [
      'Dispatches from','Versand','Versand durch','Verkauft durch','Expédié par','Vendu par',
      'Spedito da','Venduto da','Envíos desde','Vendido por','Verzonden door','Wysyłka z',
      'Skickas från','Αποστολή από','Gönderim','発送元','发货方','Enviado por','Enviado de',
      'Shipped from','Ships from'
    ];

    for (const p of patternsFrom) {
      if (html.toLowerCase().includes(p.toLowerCase())) {
        if (/<span[^>]*>\s*Amazon\s*<\/span>/i.test(html)) return 1;
        if (/offer-display-feature-text-message"\s*>\s*Amazon/i.test(html)) return 1;
        if (/>\s*Amazon\s*</i.test(html)) return 1;
      }
    }
    return 0;
  }

  function extractAvailabilityFromDOM() {
    const html = document.body.innerHTML;

    if (/<span[^>]*class="[^"]*\bprimary-availability-message\b[^"]*"[^>]*>\s*in\s+stock\s*<\/span>/i.test(html)) {
      return { available: 1, quantity: 999 };
    }

    const m = html.match(/<div[^>]+id="availability"[^>]*>(.*?)<\/div>/is);
    if (!m || !m[1]) return { available: 0, quantity: 0 };

    let availabilityHtml = m[1];

    const needle = '<span class="a-size-medium a-color-state">  </span>';
    if (availabilityHtml.includes(needle)) {
      availabilityHtml = availabilityHtml.replace(
        needle,
        '<span class="a-size-medium a-color-state">in stock</span>'
      );
    }

    availabilityHtml = availabilityHtml.replace(/<script[^>]*>.*?<\/script>/gis, '');

    const tmp = document.createElement('div');
    tmp.innerHTML = availabilityHtml;
    let availabilityText = (tmp.textContent || tmp.innerText || '').trim().replace(/\s+/g, ' ');

    const quantityPatterns = [
      /only\s+(\d+)\s+left/i,
      /nur\s+noch\s+(\d+)\s+auf\s+lager/i,
      /il\s+ne\s+reste\s+plus\s+que\s+(\d+)\s+exemplaires/i,
      /solo\s+(\d+)\s+en\s+stock/i,
      /solo\s+(\d+)\s+disponibili/i,
    ];

    for (const p of quantityPatterns) {
      const mm = availabilityText.match(p);
      if (mm && mm[1]) {
        const qty = parseInt(mm[1], 10);
        return { available: qty > 0 ? 1 : 0, quantity: qty };
      }
    }

    const inStockWords = ['in stock','auf lager','en stock','disponible','disponibile'];
    for (const w of inStockWords) {
      if (availabilityText.toLowerCase().includes(w)) return { available: 1, quantity: 999 };
    }

    const outPatterns = [
      'out of stock',
      'derzeit nicht verfügbar',
      'non disponibile',
      'temporalmente no disponible',
      'actuellement indisponible',
    ];
    for (const w of outPatterns) {
      if (availabilityText.toLowerCase().includes(w)) return { available: 0, quantity: 0 };
    }

    return { available: 0, quantity: 0 };
  }

  function extractAmazonPriceFromDOM() {
    const html = document.body.innerHTML;

    let m = html.match(/<span[^>]*class="a-offscreen"[^>]*>[^0-9]*([0-9]+(?:[.,][0-9]{1,2})?)/i);
    if (m && m[1]) {
      const price = parseFloat(m[1].replace(',', '.'));
      if (!isNaN(price)) return price;
    }

    m = html.match(/a-price-whole">([0-9]+).*?a-price-fraction">([0-9]{1,2})/is);
    if (m && m[1] && m[2]) {
      const price = parseFloat(`${m[1]}.${m[2]}`);
      if (!isNaN(price)) return price;
    }

    return 0;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function randomDelay(minSec = 1, maxSec = 20) {
    const sec = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
    return sec * 1000;
  }

  function isAmazon404() {
    const title = (document.title || '').toLowerCase();
    if (title.includes('page not found')) return true;

    const text = (document.body && document.body.innerText ? document.body.innerText : '').toLowerCase();
    return (text.includes('not a functioning page') || text.includes('looking for something'));
  }

  if (location.pathname.startsWith('/dp/') || location.pathname.includes('/gp/product/')) {
    (async () => {
      let currentItem = null;

      try {
        console.log('📦 Product page');

        currentItem = GM_getValue('current_item');
        if (!currentItem || !currentItem.id) {
          console.error('❌ No current_item');
          return;
        }

        if (isAmazon404()) {
          apiLog("items_price_check_ex", "removed_amazon_page", "WARN", {
            id: currentItem.id,
            url: location.href
          });

          GM_xmlhttpRequest({
            method: 'POST',
            url: 'http://127.0.0.1:8008/update-item',
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ id: currentItem.id, available: 0 }),
            onload: async () => {
              const delay = randomDelay(1, 20);
              await sleep(delay);
              location.href = 'https://www.amazon.de/';
            },
            onerror: () => console.error('❌ Failed to update removed item')
          });

          return;
        }

        console.log('✅ Product exists (not 404)');

        const asin = getAsin();
        const html = document.documentElement.outerHTML;
        console.log('🧾 ASIN:', asin);

        saveSourceToApi(asin, html);

        if (isAmazonProtectionPage()) {
          console.warn('🛡️ Amazon protection page detected. Skipping updates.');

          apiLog("items_price_check_ex", "amazon_protection_detected", "WARN", {
            id: currentItem.id,
            asin: asin,
            url: location.href,
            title: document.title,
            html_len: html.length
          });

          await releaseItem(currentItem.id);

          const delay = randomDelay(10, 30);
          await sleep(delay);
          location.href = 'https://www.amazon.de/';
          return;
        }

        const price = extractAmazonPriceFromDOM();
        if (price > 0) {
          console.log('💰 Old Price:', currentItem.cost_source);
          console.log('💰 Price extracted:', price);
        } else {
          console.warn('⚠️ Price not found');
        }

        const availability = extractAvailabilityFromDOM();
        console.log('📦 Availability:', availability.available);
        console.log('🔢 Quantity:', availability.quantity);

        if (price <= 0 && availability.available === 0) {
          console.log('ℹ️ OOS + no price detected');

          currentItem = GM_getValue('current_item');
          if (!currentItem || !currentItem.id) {
            console.error('❌ No current_item');
            return;
          }

          GM_xmlhttpRequest({
            method: 'POST',
            url: 'http://127.0.0.1:8008/report-oos-no-price',
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ id: currentItem.id }),
            onload: async () => {
              apiLog("items_price_check_ex", "oos_no_price", "INFO", {
                id: currentItem.id,
                price: price,
                available: availability.available
              });

              console.log('✅ OOS without price reported');

              const delay = Math.floor(Math.random() * 4000) + 1000;
              console.log(`⏳ Waiting ${delay / 1000}s before next item`);
              await new Promise(r => setTimeout(r, delay));

              location.href = 'https://www.amazon.de/';
            },
            onerror: () => console.error('❌ Failed to report OOS')
          });

          return;
        }

        const prime = detectFBAFromDOM();
        console.log('🚚 FBA / Prime:', prime);

        const shipping = getShippingByPrime(prime);
        console.log('📦 Shipping price:', shipping);

        const region = detectAmazonRegion(currentItem.platform);
        console.log('🌍 Region:', region);

        const weightKgReal = extractPackageWeightKg();

        const weightForShipping = (weightKgReal > 0) ? weightKgReal : currentItem.weight_kg;

        if (weightKgReal > 0) {
          const dbW = Number(currentItem.weight_kg || 0);
          const amzW = Number(weightKgReal);

          const absDiff = Math.abs(amzW - dbW);
          const relDiff = dbW > 0 ? absDiff / dbW : 999;

          const needUpdate = (dbW <= 0) || (absDiff >= 0.05 && relDiff >= 0.03);

          if (needUpdate) {
            console.warn(`⚠️ Weight differs. DB=${dbW}kg, AMZ=${amzW}kg. Updating...`);

            apiLog("items_price_check_ex", "weight_diff_detected", "INFO", {
              id: currentItem.id,
              db_weight_kg: dbW,
              amazon_weight_kg: amzW,
              abs_diff: absDiff,
              rel_diff: relDiff
            });

            updateWeightInDB(currentItem.id, amzW).then(ok => {
              if (ok) {
                currentItem.weight_kg = amzW;
                GM_setValue('current_item', currentItem);
                console.log('✅ Weight updated and cached:', amzW);
              }
            });
          }
        }

        const shippingUA = getShippingByRegion(region, weightForShipping);

        console.log('📦 Weight DB (kg):', currentItem.weight_kg);
        console.log('📦 Weight Amazon Package (kg):', weightKgReal);
        console.log('📦 Weight used for shipping (kg):', weightForShipping);
        console.log('🚚 Shipping UA:', shippingUA);

        fetchRates(rates => {
          const calc = calculateFinalPrice({
            profit: currentItem.profit,
            price: price,
            shipping: shipping,
            shippingUA: shippingUA,
            sourcePlatform: currentItem.platform,
            rates: rates
          });

          const payload = {
            id: currentItem.id,
            old_price: currentItem.cost_source,
            old_available: currentItem.available,
            old_quantity: currentItem.quantity,
            price: price,
            available: availability.available,
            quantity: availability.quantity,
            cost_now: calc.cost_now,
            cost_now_uah: calc.cost_now_uah,
            currency: calc.currency
          };

          console.log('₴ cost_now_uah:', calc.cost_now_uah);
          console.log('📤 Reporting result:', payload);

          GM_xmlhttpRequest({
            method: 'POST',
            url: 'http://127.0.0.1:8008/report-result',
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify(payload),
            onload: async (r) => {
              let res;
              try { res = JSON.parse(r.responseText); } catch {}

              if (res && res.status === 'same') {
                apiLog("items_price_check_ex", "item_same", "DEBUG", payload);
              } else {
                apiLog("items_price_check_ex", "item_updated", "INFO", payload);
              }

              console.log('✅ Result reported:', r.responseText);

              const delay = randomDelay(1, 20);
              console.log(`⏳ Waiting ${delay / 1000}s before next item`);
              await sleep(delay);

              location.href = 'https://www.amazon.de/';
            },
            onerror: () => console.error('❌ Failed to report result')
          });
        });

      } catch (e) {
        console.error('❌ Product page crash:', e);

        apiLog("items_price_check_ex", "product_page_crash", "ERROR", {
          id: (currentItem && currentItem.id) ? currentItem.id : null,
          url: location.href,
          err: String(e)
        });

        try { if (currentItem && currentItem.id) await releaseItem(currentItem.id); } catch {}

        await sleep(randomDelay(10, 30));
        location.href = 'https://www.amazon.de/';
      }
    })();

    return;
  }

  console.log('📡 Requesting next item');

  GM_xmlhttpRequest({
    method: 'GET',
    url: 'http://127.0.0.1:8008/get-next-item',
    timeout: 15000,
    onload: function (response) {
      let data;
      try {
        data = JSON.parse(response.responseText);
      } catch {
        console.error('❌ JSON parse error');
        return;
      }

      if (data.status !== 'ok') {
        console.log('⛔ No tasks');
        return;
      }

      const item = data.item;

      GM_setValue('current_item', {
        id: item.id,
        asin: item.asin,
        source_url: item.source_url,
        cost_source: item.cost_source,
        profit: item.profit,
        available: item.available,
        quantity: item.quantity,
        platform: item.source_platform,
        weight_kg: item.weight_kg,
        updated_at: item.updated_at
      });

      if (item.updated_at) {
        const updatedTs = Date.parse(item.updated_at);

        if (!isNaN(updatedTs)) {
          const nowTs = Date.now();
          const diffMin = (nowTs - updatedTs) / 60000;

          console.log(`⏱ Last update: ${diffMin.toFixed(1)} min ago`);

          if (diffMin < 60) {
            const waitMs = 30 * 60 * 1000;

            console.log(`🕒 Too fresh. Waiting 30 minutes…`);
            apiLog("items_price_check_ex", "skip_fresh_item", "DEBUG", {
              id: item.id,
              minutes: diffMin
            });

            setTimeout(() => location.reload(), waitMs);
            return;
          }
        } else {
          console.warn('⚠️ Invalid updated_at format:', item.updated_at);
        }
      }

      console.log('➡️ Redirect to:', item.source_url);
      location.href = item.source_url;
    },
    onerror: () => console.error('❌ API unavailable')
  });

})();