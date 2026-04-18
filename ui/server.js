'use strict';

const express          = require('express');
const fs               = require('fs');
const path             = require('path');
const Kuroshiro        = require('kuroshiro').default;
const KuromojiAnalyzer = require('kuroshiro-analyzer-kuromoji');

const BuyeeScraper = require('../buyee/scraper');
const trainer      = require('../shared/trainer');
const agent        = require('../shared/agent');

// ── Kuroshiro: initialise once at startup ──────────────────────────────────

const kuroshiro = new Kuroshiro();
let   kuroReady = false;

kuroshiro.init(new KuromojiAnalyzer())
  .then(() => { kuroReady = true; console.log('[Kuroshiro] Ready'); })
  .catch(err => console.warn('[Kuroshiro] Failed to init:', err.message));

async function romanize(text) {
  if (!text || !kuroReady) return null;
  if (!/[\u3000-\u9FFF\uF900-\uFAFF\u30A0-\u30FF\u3040-\u309F]/.test(text)) return null;
  try {
    const result  = await kuroshiro.convert(text, { to: 'romaji', mode: 'normal', romajiSystem: 'hepburn' });
    const cleaned = result.replace(/\s+/g, ' ').trim();
    return cleaned && cleaned !== text ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : null;
  } catch {
    return null;
  }
}

const app  = express();
const PORT = process.env.PORT || 3000;

const REQUESTS_FILE = path.join(__dirname, 'data', 'requests.json');

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function loadRequests() {
  try { return JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8')); }
  catch { return []; }
}

function saveRequest(data) {
  const all = loadRequests();
  all.push({ id: Date.now(), submittedAt: new Date().toISOString(), ...data });
  fs.mkdirSync(path.dirname(REQUESTS_FILE), { recursive: true });
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(all, null, 2), 'utf8');
}

function sendEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── Scraper registry ───────────────────────────────────────────────────────

const { SUB_SITES } = BuyeeScraper;

const SCRAPERS = [
  {
    id:          'buyee',
    name:        'Buyee.jp',
    description: 'Japanese proxy — auctions, flea market, shopping & more',
    url:         'https://buyee.jp',
    favicon:     'https://buyee.jp/favicon.ico',
    color:       '#F97316',
    colorDark:   '#EA580C',
    colorLight:  '#FFF7ED',
    status:      'live',
    fields:      ['Title', 'Price (JPY)', 'Time Remaining', 'Image', 'Listing URL'],
    subSites:    Object.entries(SUB_SITES).map(([id, s]) => ({ id, label: s.label })),
    defaultSubSite: 'yahoo-auctions',
    sortOptions: {
      end_asc:    'Ending soonest',
      end_desc:   'Ending latest',
      price_asc:  'Price: low to high',
      price_desc: 'Price: high to low',
      bids_desc:  'Most bids',
    },
  },
  {
    id:          'ebay',
    name:        'eBay',
    description: 'Global auction and buy-it-now listings',
    url:         'https://ebay.com',
    favicon:     'https://ebay.com/favicon.ico',
    color:       '#E53238',
    colorDark:   '#B91C1C',
    colorLight:  '#FEF2F2',
    status:      'soon',
    fields:      ['Title', 'Price', 'Buy It Now / Auction', 'Bids', 'Time Remaining', 'Image', 'Listing URL'],
  },
];

// ── Exchange rate cache ────────────────────────────────────────────────────

let rateCache = { jpyToGbp: null, fetchedAt: 0 };
const RATE_TTL = 60 * 60 * 1000; // 1 hour

async function getRate() {
  if (rateCache.jpyToGbp && Date.now() - rateCache.fetchedAt < RATE_TTL) {
    return rateCache.jpyToGbp;
  }
  try {
    const res  = await fetch('https://api.frankfurter.app/latest?from=JPY&to=GBP');
    const data = await res.json();
    const rate = data?.rates?.GBP;
    if (!rate) throw new Error('Missing GBP rate');
    rateCache = { jpyToGbp: rate, fetchedAt: Date.now() };
    console.log(`[Rates] 1 JPY = £${rate}`);
    return rate;
  } catch (err) {
    console.warn('[Rates] Failed to fetch rate:', err.message);
    return rateCache.jpyToGbp;
  }
}

app.get('/api/rates', async (req, res) => {
  const jpyToGbp = await getRate();
  res.json({ jpyToGbp: jpyToGbp ?? null });
});

// ── API ────────────────────────────────────────────────────────────────────

app.get('/api/scrapers', (req, res) => {
  res.json(SCRAPERS);
});

app.get('/api/scrape/:siteId', async (req, res) => {
  const { siteId }  = req.params;
  const { query, maxPages, minPrice, maxPrice, sort, subSite, profileId } = req.query;

  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }

  if (siteId !== 'buyee') {
    return res.status(404).json({ error: `Scraper '${siteId}' is not yet available` });
  }

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const opts = {
    maxPages: maxPages ? parseInt(maxPages, 10) : undefined,
    minPrice: minPrice ? parseFloat(minPrice)   : undefined,
    maxPrice: maxPrice ? parseFloat(maxPrice)   : undefined,
    sort:     sort    || undefined,
    subSite:  subSite || undefined,
    onPage: async (items, pageNum) => {
      for (const item of items) {
        item.romaji       = await romanize(item.title);
        item.trainerScore = profileId ? trainer.scoreItem(profileId, item.title) : null;
        sendEvent(res, 'item', item);
      }
      sendEvent(res, 'page', { page: pageNum, count: items.length });
    },
  };

  const scraper = new BuyeeScraper();
  let totalCount = 0;

  try {
    const results = await scraper.scrape(query.trim(), opts);
    totalCount = results.length;
  } catch (err) {
    sendEvent(res, 'error', { message: err.message });
  }

  sendEvent(res, 'done', { total: totalCount });
  res.end();
});

app.post('/api/request', (req, res) => {
  const { name, email, company, website, fields, volume, notes } = req.body;

  if (!name || !email || !website) {
    return res.status(400).json({ error: 'name, email, and website are required' });
  }

  try {
    saveRequest({ name, email, company: company || null, website, fields: fields || null, volume: volume || null, notes: notes || null });
    console.log(`[Requests] New request from ${name} <${email}> — site: ${website}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Requests] Failed to save:', err.message);
    res.status(500).json({ error: 'Could not save request' });
  }
});

// Local admin — view submitted requests at /admin/requests
app.get('/admin/requests', (req, res) => {
  res.json(loadRequests());
});

// ── Trainer API ────────────────────────────────────────────────────────────

app.get('/api/profiles', (req, res) => {
  res.json(trainer.getProfiles());
});

app.post('/api/profiles', (req, res) => {
  const { name, scraper, subSite, query, filters, lotMode } = req.body;
  if (!name || !query) return res.status(400).json({ error: 'name and query are required' });
  const profile = trainer.saveProfile({ name, scraper, subSite, query, filters: filters || {}, lotMode: !!lotMode });
  res.json(profile);
});

app.put('/api/profiles/:id', (req, res) => {
  const profile = trainer.saveProfile({ ...req.body, id: req.params.id });
  res.json(profile);
});

app.delete('/api/profiles/:id', (req, res) => {
  trainer.deleteProfile(req.params.id);
  res.json({ ok: true });
});

app.post('/api/rate', (req, res) => {
  const { profileId, item, rating } = req.body;
  if (!profileId || !item || rating === undefined) {
    return res.status(400).json({ error: 'profileId, item, and rating are required' });
  }
  trainer.rateItem(profileId, item, rating);
  res.json({ ok: true });
});

app.get('/api/trainer/insights/:profileId', (req, res) => {
  res.json(trainer.getInsights(req.params.profileId));
});

app.get('/api/trainer/lot-keywords/:scraperId', (req, res) => {
  res.json({ keywords: trainer.getLotKeywords(req.params.scraperId) });
});

// ── Agent API ──────────────────────────────────────────────────────────────

app.get('/api/agent/health', async (req, res) => {
  res.json(await agent.checkHealth());
});

app.post('/api/agent/generate', async (req, res) => {
  const { text, image, mimeType, scraper, subSite } = req.body;

  if (!text && !image) {
    return res.status(400).json({ error: 'Provide either text or image' });
  }

  try {
    let result;
    if (image) {
      result = await agent.generateFromImage(image, mimeType || 'image/jpeg', { scraper, subSite });
    } else {
      result = await agent.generateFromText(text, { scraper, subSite });
    }
    res.json(result);
  } catch (err) {
    console.error('[Agent] Generate failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agent/save', async (req, res) => {
  const { name, query, positiveKeywords, negativeKeywords, scraper, subSite, filters, lotMode } = req.body;

  if (!name || !query) {
    return res.status(400).json({ error: 'name and query are required' });
  }

  try {
    const profile = trainer.saveProfile({
      name, scraper, subSite,
      query,
      filters:   filters || {},
      lotMode:   !!lotMode,
      aiGenerated: true,
    });

    trainer.seedFromAgent(profile.id, positiveKeywords || [], negativeKeywords || []);
    res.json(profile);
  } catch (err) {
    console.error('[Agent] Save failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  GNB Solutions — Scraper UI`);
  console.log(`  Running at http://localhost:${PORT}\n`);
});
