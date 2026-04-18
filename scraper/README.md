# Buyee Scraper

Scrapes auction and marketplace listings from [Buyee.jp](https://buyee.jp) — a Japanese proxy service that covers Yahoo! Auctions, Mercari, Rakuten, Amazon Japan, and several other platforms.

---

## Setup

```bash
cd web-scrapers/buyee
npm install
```

---

## CLI usage

```bash
node index.js <query> [options]
```

| Option | Default | Description |
|---|---|---|
| `--max-pages <n>` | `3` | Number of result pages to fetch |
| `--min-price <n>` | — | Minimum price (JPY) |
| `--max-price <n>` | — | Maximum price (JPY) |
| `--sort <key>` | `end_asc` | Sort order (see below) |
| `--output, -o <file>` | — | Write results to a JSON file |

**Sort keys:** `end_asc` · `end_desc` · `price_asc` · `price_desc` · `bids_desc`

**Examples:**

```bash
node index.js "PSP 3000"
node index.js "PSP 3000" --max-pages 5 --min-price 1000 --max-price 10000
node index.js "gameboy" --sort price_asc --output gameboy.json
```

---

## Supported marketplaces

| Key | Marketplace |
|---|---|
| `yahoo-auctions` | Yahoo! Auctions Japan (default) |
| `mercari` | Mercari Japan |
| `paypay-flea-market` | PayPay Flea Market |
| `yahoo-shopping` | Yahoo! Shopping Japan |
| `rakuten` | Rakuten Ichiba |
| `amazon-jp` | Amazon Japan |
| `surugaya` | Surugaya |
| `zozotown` | ZOZOTOWN |
| `bookoff` | Bookoff |
| `joshin` | Joshin |

---

## Output format

```json
{
  "title": "Sony PSP-3000 Piano Black",
  "price": 3500,
  "currency": "JPY",
  "timeRemaining": "2d 4h 32m",
  "link": "https://buyee.jp/item/yahoo/auction/x000000000",
  "image": "https://auctions.afimg.jp/..."
}
```

When saved with `--output`, the file includes metadata:

```json
{
  "query": "PSP 3000",
  "scrapedAt": "2026-04-05T12:00:00.000Z",
  "options": { "maxPages": 3, "minPrice": null, "maxPrice": null, "sort": "end_asc" },
  "total": 42,
  "results": [...]
}
```

---

## Configuration

Defaults and request settings live in `config.json` — no code changes needed for common adjustments:

```json
{
  "defaults": { "maxPages": 3, "sort": "end_asc" },
  "request":  { "timeout": 15000, "retries": 3, "requestDelay": 1500 }
}
```

---

## Architecture

```
scraper.js       ← Buyee HTML parsing, URL building, per-marketplace selectors
  └─ ScraperBase ← HTTP, retries, User-Agent rotation, rate limiting (../shared/)

index.js         ← CLI
config.json      ← Defaults and request settings
```

All marketplace-specific logic (selectors, URL patterns) is isolated in the `SUB_SITES` object in `scraper.js`. Adding a new marketplace means adding one entry there — nothing else changes.
