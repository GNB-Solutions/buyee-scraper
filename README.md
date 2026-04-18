# GNB Solutions — Web Scrapers

A collection of site-specific scrapers built on a shared Node.js base. Each scraper runs independently and exposes both a CLI and a streaming HTTP API consumed by the dashboard UI.

---

## Structure

```
web-scrapers/
├── shared/
│   └── scraper-base.js   ← HTTP, retries, rate limiting, UA rotation
│
├── buyee/                ← Buyee.jp (Yahoo Auctions, Mercari, Rakuten, and more)
│   ├── scraper.js
│   ├── index.js          ← CLI
│   ├── config.json
│   └── README.md
│
├── ui/                   ← Dashboard and client demo
│   ├── server.js         ← Express API + SSE streaming
│   └── public/           ← Frontend (HTML/CSS/JS)
│
└── README.md
```

---

## Shared base

`ScraperBase` handles everything that isn't site-specific:

- GET requests via an injected axios instance
- Exponential-backoff retries (configurable, default 3×)
- Per-request User-Agent rotation across 5 browser strings
- ±20 % jitter on all delays to avoid clockwork traffic patterns
- Configurable inter-page delay and request timeout

### Extending for a new site

```js
const ScraperBase = require('../shared/scraper-base');

class MyScraper extends ScraperBase {
  constructor() {
    super({ httpClient: require('axios'), requestDelay: 2000 });
  }

  async scrape(query, opts = {}) {
    const url = buildUrl(query, opts);
    const { data } = await this.fetch(url);
    return parse(data);
  }
}
```

---

## Running the dashboard

```bash
cd ui
npm install
node server.js
# → http://localhost:3000
```

---

## Available scrapers

| Scraper | Status |
|---|---|
| Buyee.jp | Live |
| eBay | Planned |
