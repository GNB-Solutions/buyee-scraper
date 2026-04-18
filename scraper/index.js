#!/usr/bin/env node
'use strict';

// Usage:
//   node index.js "PSP 3000"
//   node index.js "PSP 3000" --max-pages 5 --min-price 1000 --max-price 10000 --sort price_asc
//   node index.js "PSP 3000" --output results.json

const fs           = require('fs');
const path         = require('path');
const BuyeeScraper = require('./scraper');
const config       = require('./config.json');

// ANSI colour codes
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const CYAN   = '\x1b[36m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const DIM    = '\x1b[2m';

function fmt(n) {
  return n == null ? 'N/A' : n.toLocaleString();
}

function parseArgs(argv) {
  const args = argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  const query = args[0];
  const opts  = {
    maxPages: config.defaults.maxPages,
    minPrice: config.defaults.minPrice,
    maxPrice: config.defaults.maxPrice,
    sort:     config.defaults.sort,
    output:   null,
  };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--max-pages': opts.maxPages = parseInt(args[++i], 10);  break;
      case '--min-price': opts.minPrice = parseFloat(args[++i]);    break;
      case '--max-price': opts.maxPrice = parseFloat(args[++i]);    break;
      case '--sort':      opts.sort     = args[++i];                break;
      case '--output':
      case '-o':          opts.output   = args[++i];                break;
      default: console.warn(`Unknown flag: ${args[i]}`);
    }
  }

  return { query, opts };
}

function printHelp() {
  console.log(`
Buyee Scraper

Usage:
  node index.js <query> [options]

Options:
  --max-pages <n>      Pages to scrape (default: ${config.defaults.maxPages})
  --min-price <n>      Min price filter (JPY)
  --max-price <n>      Max price filter (JPY)
  --sort <key>         Sort order (default: ${config.defaults.sort})
  --output, -o <file>  Write results to JSON file

Sort keys:
${Object.entries(config.sortOptions).map(([k, v]) => `  ${k.padEnd(12)} ${v}`).join('\n')}

Examples:
  node index.js "PSP 3000"
  node index.js "PSP 3000" --max-pages 5 --min-price 1000 --max-price 10000
  node index.js "gameboy" --sort price_asc --output gameboy.json
`);
}

function printTable(items) {
  if (items.length === 0) {
    console.log(`\n${YELLOW}No results found.${RESET}\n`);
    return;
  }

  const W_TITLE = 52;
  const W_PRICE =  9;
  const W_TIME  = 14;
  const sep     = '─'.repeat(4 + W_TITLE + W_PRICE + 2 + W_TIME);

  console.log(`\n${CYAN}${sep}${RESET}`);
  console.log(
    `${BOLD}${'#'.padEnd(4)}${'Title'.padEnd(W_TITLE)}${'Price'.padStart(W_PRICE)}  ${'Time Left'.padEnd(W_TIME)}${RESET}`
  );
  console.log(`${CYAN}${sep}${RESET}`);

  items.forEach((item, i) => {
    const num   = String(i + 1).padEnd(4);
    const title = (item.title.length > W_TITLE - 1
      ? item.title.slice(0, W_TITLE - 4) + '…'
      : item.title
    ).padEnd(W_TITLE);
    const price = (item.price != null ? `¥${fmt(item.price)}` : 'N/A').padStart(W_PRICE);
    const time  = (item.timeRemaining || '—').slice(0, W_TIME).padEnd(W_TIME);
    console.log(`${num}${title}${GREEN}${price}${RESET}  ${DIM}${time}${RESET}`);
  });

  console.log(`${CYAN}${sep}${RESET}`);
}

function printSummary(items, query, opts) {
  const prices   = items.map(i => i.price).filter(p => p != null);
  const total    = items.length;
  const avg      = prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : null;
  const cheapest = prices.length ? Math.min(...prices) : null;
  const priciest = prices.length ? Math.max(...prices) : null;

  console.log(`\n${BOLD}Summary${RESET}`);
  console.log(`  Query      : ${CYAN}${query}${RESET}`);
  console.log(`  Pages      : ${opts.maxPages}`);
  if (opts.minPrice != null) console.log(`  Min price  : ¥${fmt(opts.minPrice)}`);
  if (opts.maxPrice != null) console.log(`  Max price  : ¥${fmt(opts.maxPrice)}`);
  console.log(`  Total items: ${BOLD}${total}${RESET}`);
  if (avg      != null) console.log(`  Avg price  : ${YELLOW}¥${fmt(avg)}${RESET}`);
  if (cheapest != null) console.log(`  Cheapest   : ${GREEN}¥${fmt(cheapest)}${RESET}`);
  if (priciest != null) console.log(`  Most exp.  : ${RED}¥${fmt(priciest)}${RESET}`);
  console.log('');
}

async function main() {
  const { query, opts } = parseArgs(process.argv);
  console.log(`\n${BOLD}[Buyee Scraper]${RESET} Searching for: ${CYAN}"${query}"${RESET}`);

  const scraper = new BuyeeScraper();
  let results;

  try {
    results = await scraper.scrape(query, opts);
  } catch (err) {
    console.error(`\n${RED}${err.message}${RESET}`);
    process.exit(1);
  }

  printTable(results);
  printSummary(results, query, opts);

  if (opts.output) {
    const outPath = path.resolve(opts.output);
    fs.writeFileSync(outPath, JSON.stringify({
      query,
      scrapedAt: new Date().toISOString(),
      options:   opts,
      total:     results.length,
      results,
    }, null, 2), 'utf8');
    console.log(`${GREEN}Saved to: ${outPath}${RESET}\n`);
  }
}

main();
