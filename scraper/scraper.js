'use strict';

// Buyee proxies multiple Japanese marketplaces under one domain.
// Each marketplace lives in SUB_SITES with its own URL builder and selectors,
// so the core pagination/retry logic never needs to change between them.

const axios       = require('axios');
const cheerio     = require('cheerio');
const path        = require('path');
const ScraperBase = require(path.join(__dirname, '../shared/scraper-base'));
const config      = require('./config.json');

const BASE_URL = 'https://buyee.jp';

function parsePrice(raw) {
  if (!raw) return null;
  const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

// ---------------------------------------------------------------------------
// Marketplace definitions
// To add a new sub-site: add an entry below with buildUrl() and selectors.
// selectors.timeRemaining can be null for fixed-price marketplaces.
//   selectors  — CSS selectors scoped to that site's HTML
// ---------------------------------------------------------------------------

// Tab order matches Buyee's navigation bar (left → right).
// Selectors verified against live HTML; update here if Buyee changes their markup.

const AUCTION_SORT_MAP = {
  end_asc:    { sort: 'end',   order: 'asc'  },
  end_desc:   { sort: 'end',   order: 'desc' },
  price_asc:  { sort: 'price', order: 'asc'  },
  price_desc: { sort: 'price', order: 'desc' },
  bids_desc:  { sort: 'bids',  order: 'desc' },
};

const SUB_SITES = {

  // ── JDirectItems tabs (Buyee's own marketplace) ───────────────────────────

  'yahoo-auctions': {
    label: 'JDirectItems Auction',
    buildUrl(query, page, sort, minPrice, maxPrice) {
      const p = new URLSearchParams();
      p.set('translationType', '98');
      const mapped = AUCTION_SORT_MAP[sort];
      if (mapped) { p.set('sort', mapped.sort); p.set('order', mapped.order); }
      if (page > 1)         p.set('page', page);
      if (minPrice != null) p.set('aucminprice', minPrice);
      if (maxPrice != null) p.set('aucmaxprice', maxPrice);
      return `${BASE_URL}/item/search/query/${encodeURIComponent(query)}?${p}`;
    },
    selectors: {
      itemList:      'li.itemCard',
      title:         '.itemCard__itemName a',
      price:         '.g-price',
      timeRemaining: '.g-text--attention',
      link:          '.itemCard__itemName a',
      image:         'img',
    },
  },

  'mercari': {
    label: 'JDirectItems Fleamarket',
    buildUrl(query, page, sort, minPrice, maxPrice) {
      const p = new URLSearchParams({ keyword: query });
      if (page > 1)         p.set('page', page);
      if (minPrice != null) p.set('price_min', minPrice);
      if (maxPrice != null) p.set('price_max', maxPrice);
      const sortMap = { price_asc: 'price_asc', price_desc: 'price_desc' };
      if (sort && sortMap[sort]) p.set('sort_order', sortMap[sort]);
      return `${BASE_URL}/mercari/search?${p}`;
    },
    selectors: {
      itemList:      'li.itemCard',
      title:         '.itemCard__itemName a',
      price:         '.g-price',
      timeRemaining: null,
      link:          '.itemCard__itemName a',
      image:         'img',
    },
  },

  'yahoo-shopping': {
    label: 'JDirectItems Shopping',
    buildUrl(query, page, sort, minPrice, maxPrice) {
      const p = new URLSearchParams({ query });
      if (page > 1)         p.set('page', page);
      if (minPrice != null) p.set('price_from', minPrice);
      if (maxPrice != null) p.set('price_to', maxPrice);
      const sortMap = { price_asc: 'price', price_desc: '-price' };
      if (sort && sortMap[sort]) p.set('sort', sortMap[sort]);
      return `${BASE_URL}/yahoo/shopping/search?${p}`;
    },
    selectors: {
      itemList:      'li.itemCard',
      title:         '.itemCard__itemName a',
      price:         '.g-price',
      timeRemaining: null,
      link:          '.itemCard__itemName a',
      image:         'img',
    },
  },

  // ── External marketplaces ─────────────────────────────────────────────────

  'rakuten': {
    label: 'Rakuten',
    buildUrl(query, page, sort, minPrice, maxPrice) {
      const p = new URLSearchParams({ keyword: query });
      if (page > 1)         p.set('p', page);
      if (minPrice != null) p.set('min_price', minPrice);
      if (maxPrice != null) p.set('max_price', maxPrice);
      const sortMap = { price_asc: '+itemPrice', price_desc: '-itemPrice' };
      if (sort && sortMap[sort]) p.set('sort', sortMap[sort]);
      return `${BASE_URL}/rakuten/ichiba/search?${p}`;
    },
    selectors: {
      itemList:      'li.itemCard',
      title:         '.itemCard__itemName a',
      price:         '.g-price',
      timeRemaining: null,
      link:          '.itemCard__itemName a',
      image:         'img',
    },
  },

  'rakuten-rakuma': {
    label: 'Rakuten Rakuma',
    buildUrl(query, page, sort, minPrice, maxPrice) {
      const p = new URLSearchParams({ keyword: query });
      if (page > 1)         p.set('page', page);
      if (minPrice != null) p.set('price_min', minPrice);
      if (maxPrice != null) p.set('price_max', maxPrice);
      return `${BASE_URL}/rakuten/rakuma/search?${p}`;
    },
    selectors: {
      itemList:      'li.itemCard',
      title:         '.itemCard__itemName a',
      price:         '.g-price',
      timeRemaining: null,
      link:          '.itemCard__itemName a',
      image:         'img',
    },
  },

  'amazon-jp': {
    label: 'Amazon',
    buildUrl(query, page, sort, minPrice, maxPrice) {
      const p = new URLSearchParams({ keyword: query });
      if (page > 1)         p.set('page', page);
      if (minPrice != null) p.set('price_min', minPrice);
      if (maxPrice != null) p.set('price_max', maxPrice);
      return `${BASE_URL}/amazon/search?${p}`;
    },
    selectors: {
      itemList:      'li.itemCard',
      title:         '.itemCard__itemName a',
      price:         '.g-price',
      timeRemaining: null,
      link:          '.itemCard__itemName a',
      image:         'img',
    },
  },

  'paypay-flea-market': {
    label: 'PayPay Flea Market',
    buildUrl(query, page, sort, minPrice, maxPrice) {
      const p = new URLSearchParams({ keyword: query });
      if (page > 1)         p.set('page', page);
      if (minPrice != null) p.set('price_min', minPrice);
      if (maxPrice != null) p.set('price_max', maxPrice);
      return `${BASE_URL}/paypay-flea-market/search?${p}`;
    },
    selectors: {
      itemList:      'li.itemCard',
      title:         '.itemCard__itemName a',
      price:         '.g-price',
      timeRemaining: null,
      link:          '.itemCard__itemName a',
      image:         'img',
    },
  },

  'surugaya': {
    label: 'Surugaya',
    buildUrl(query, page, sort, minPrice, maxPrice) {
      const p = new URLSearchParams();
      p.set('search[keyword]', query);
      if (page > 1)         p.set('page', page);
      if (minPrice != null) p.set('search[price_from]', minPrice);
      if (maxPrice != null) p.set('search[price_to]', maxPrice);
      return `${BASE_URL}/surugaya/search?${p}`;
    },
    selectors: {
      itemList:      'li.itemCard',
      title:         '.itemCard__itemName a',
      price:         '.g-price',
      timeRemaining: null,
      link:          '.itemCard__itemName a',
      image:         'img',
    },
  },

  'zozotown': {
    label: 'ZOZOTOWN',
    buildUrl(query, page, sort, minPrice, maxPrice) {
      const p = new URLSearchParams({ keyword: query });
      if (page > 1)         p.set('page', page);
      if (minPrice != null) p.set('priceFrom', minPrice);
      if (maxPrice != null) p.set('priceTo', maxPrice);
      return `${BASE_URL}/zozotown/search?${p}`;
    },
    selectors: {
      itemList:      'li.itemCard',
      title:         '.itemCard__itemName a',
      price:         '.g-price',
      timeRemaining: null,
      link:          '.itemCard__itemName a',
      image:         'img',
    },
  },

  'bookoff': {
    label: 'Bookoff',
    buildUrl(query, page, sort, minPrice, maxPrice) {
      const p = new URLSearchParams({ keyword: query });
      if (page > 1)         p.set('page', page);
      if (minPrice != null) p.set('price_from', minPrice);
      if (maxPrice != null) p.set('price_to', maxPrice);
      return `${BASE_URL}/bookoff/search?${p}`;
    },
    selectors: {
      itemList:      'li.itemCard',
      title:         '.itemCard__itemName a',
      price:         '.g-price',
      timeRemaining: null,
      link:          '.itemCard__itemName a',
      image:         'img',
    },
  },

  'joshin': {
    label: 'Joshin',
    buildUrl(query, page, sort, minPrice, maxPrice) {
      const p = new URLSearchParams({ keyword: query });
      if (page > 1)         p.set('page', page);
      if (minPrice != null) p.set('price_from', minPrice);
      if (maxPrice != null) p.set('price_to', maxPrice);
      return `${BASE_URL}/joshin/search?${p}`;
    },
    selectors: {
      itemList:      '.item-list__item, .SearchResult__item',
      title:         '.item-list__item-title a, .item-name a',
      price:         '.item-list__item-price, .item-price',
      timeRemaining: null,
      link:          '.item-list__item-title a, a.item-name',
      image:         'img.item-image, img.thumbnail',
    },
  },

};

const DEFAULT_SUB_SITE = 'yahoo-auctions';

class BuyeeScraper extends ScraperBase {
  constructor(options = {}) {
    super({
      httpClient:   axios,
      retries:      config.request.retries,
      retryDelay:   config.request.retryDelay,
      requestDelay: config.request.requestDelay,
      timeout:      config.request.timeout,
      headers:      config.headers,
      ...options,
    });
  }

  _parsePage(html, selectors) {
    const $ = cheerio.load(html);
    const items = [];

    $(selectors.itemList).each((_, el) => {
      const titleEl = $(el).find(selectors.title);
      const priceEl = $(el).find(selectors.price);
      const timeEl  = selectors.timeRemaining ? $(el).find(selectors.timeRemaining) : null;
      const imgEl   = $(el).find(selectors.image);
      const linkEl  = $(el).find(selectors.link);

      const rawHref  = (linkEl.first().attr('href') || titleEl.attr('href') || '');
      const rawImg   = imgEl.attr('data-src') || imgEl.attr('src') || '';
      const rawPrice = priceEl.first().text().trim();

      const link  = rawHref.startsWith('http') ? rawHref : rawHref ? `${BASE_URL}${rawHref}` : null;
      const image = rawImg.startsWith('http')  ? rawImg  : rawImg  ? `${BASE_URL}${rawImg}`  : null;

      const title    = titleEl.first().text().trim();
      const price    = parsePrice(rawPrice);
      const timeLeft = timeEl ? timeEl.first().text().trim() || null : null;

      if (!title) return;

      items.push({ title, price, currency: config.defaults.currency, timeRemaining: timeLeft, link, image });
    });

    return items;
  }

  _isBlocked(html) {
    const lower = html.toLowerCase();
    return (
      lower.includes('access denied') ||
      lower.includes('captcha') ||
      lower.includes('too many requests') ||
      lower.includes('robot check')
    );
  }

  /**
   * @param {string}   query
   * @param {object}  [opts]
   * @param {string}  [opts.subSite='yahoo-auctions']  key from SUB_SITES
   * @param {number}  [opts.maxPages]
   * @param {number}  [opts.minPrice]
   * @param {number}  [opts.maxPrice]
   * @param {string}  [opts.sort]
   * @param {Function}[opts.onPage]  called with (items, pageNum) as each page lands
   */
  async scrape(query, opts = {}) {
    if (!query || typeof query !== 'string') {
      throw new Error('scrape() requires a non-empty search query string');
    }

    const subSiteKey = opts.subSite ?? DEFAULT_SUB_SITE;
    const subSite    = SUB_SITES[subSiteKey];

    if (!subSite) {
      throw new Error(`Unknown subSite: "${subSiteKey}". Valid options: ${Object.keys(SUB_SITES).join(', ')}`);
    }

    const maxPages = opts.maxPages ?? config.defaults.maxPages;
    const minPrice = opts.minPrice ?? config.defaults.minPrice;
    const maxPrice = opts.maxPrice ?? config.defaults.maxPrice;
    const sort     = opts.sort     ?? config.defaults.sort;

    const allItems = [];

    for (let page = 1; page <= maxPages; page++) {
      const url = subSite.buildUrl(query, page, sort, minPrice, maxPrice);
      console.log(`[Buyee/${subSite.label}] Fetching page ${page}/${maxPages}: ${url}`);

      let response;
      try {
        response = await this.fetch(url);
      } catch (err) {
        console.error(`[Buyee/${subSite.label}] Failed to fetch page ${page}: ${err.message}`);
        break;
      }

      const html = response.data;

      if (this._isBlocked(html)) {
        console.error('[Buyee] Blocked — CAPTCHA or access denied. Stopping.');
        break;
      }

      const items = this._parsePage(html, subSite.selectors);

      if (items.length === 0) {
        console.log(`[Buyee/${subSite.label}] No items on page ${page} — stopping.`);
        break;
      }

      allItems.push(...items);
      console.log(`[Buyee/${subSite.label}] Page ${page}: ${items.length} items (total: ${allItems.length})`);

      if (typeof opts.onPage === 'function') await opts.onPage(items, page);
      if (page < maxPages) await this.waitBetweenRequests();
    }

    return allItems.filter(item => {
      if (minPrice != null && item.price != null && item.price < minPrice) return false;
      if (maxPrice != null && item.price != null && item.price > maxPrice) return false;
      return true;
    });
  }
}

// Expose sub-site list so the server can read it for the API
BuyeeScraper.SUB_SITES = SUB_SITES;

module.exports = BuyeeScraper;
