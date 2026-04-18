'use strict';

class ScraperBase {
  constructor(options = {}) {
    if (!options.httpClient) {
      throw new Error('ScraperBase: options.httpClient is required');
    }
    this._http         = options.httpClient;
    this.retries       = options.retries      ?? 3;
    this.retryDelay    = options.retryDelay   ?? 1000;
    this.requestDelay  = options.requestDelay ?? 1500;
    this.timeout       = options.timeout      ?? 15000;
    this.defaultHeaders = {
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection':      'keep-alive',
      'Cache-Control':   'no-cache',
      ...(options.headers || {}),
    };
  }

  // Returns a matched browser profile: UA string + sec-ch-ua client hints.
  // sec-ch-ua must match the UA string exactly or bot detection flags the mismatch.
  _pickBrowserProfile() {
    const profiles = [
      {
        'User-Agent':        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'sec-ch-ua':         '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile':  '?0',
        'sec-ch-ua-platform':'"Windows"',
      },
      {
        'User-Agent':        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'sec-ch-ua':         '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile':  '?0',
        'sec-ch-ua-platform':'"macOS"',
      },
      {
        'User-Agent':        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        'sec-ch-ua':         '"Google Chrome";v="132", "Chromium";v="132", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile':  '?0',
        'sec-ch-ua-platform':'"Windows"',
      },
      {
        'User-Agent':        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        'sec-ch-ua':         '"Google Chrome";v="132", "Chromium";v="132", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile':  '?0',
        'sec-ch-ua-platform':'"macOS"',
      },
      {
        'User-Agent':        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
        'sec-ch-ua':         null,  // Firefox does not send sec-ch-ua
        'sec-ch-ua-mobile':  null,
        'sec-ch-ua-platform':null,
      },
    ];
    return profiles[Math.floor(Math.random() * profiles.length)];
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Adds ±20 % randomness so requests don't fire at a perfectly regular cadence.
  _jitter(ms) {
    return Math.round(ms * (0.8 + Math.random() * 0.4));
  }

  async fetch(url, axiosOptions = {}) {
    let lastError;

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const { headers: extraHeaders, ...rest } = axiosOptions;
        const profile  = this._pickBrowserProfile();

        // Build sec-ch-ua block — omit null values (Firefox profile)
        const clientHints = {};
        if (profile['sec-ch-ua'])          clientHints['sec-ch-ua']          = profile['sec-ch-ua'];
        if (profile['sec-ch-ua-mobile'])   clientHints['sec-ch-ua-mobile']   = profile['sec-ch-ua-mobile'];
        if (profile['sec-ch-ua-platform']) clientHints['sec-ch-ua-platform'] = profile['sec-ch-ua-platform'];

        return await this._http.get(url, {
          timeout: this.timeout,
          ...rest,
          headers: {
            ...this.defaultHeaders,
            'User-Agent':    profile['User-Agent'],
            'sec-fetch-dest':'document',
            'sec-fetch-mode':'navigate',
            'sec-fetch-site':'none',
            'sec-fetch-user':'?1',
            ...clientHints,
            ...(extraHeaders || {}),
          },
        });
      } catch (err) {
        lastError = err;
        const status    = err.response?.status;
        const retryable = !err.response || status >= 500 || status === 429 || err.code === 'ECONNABORTED';
        if (!retryable || attempt === this.retries) break;

        const wait = this._jitter(this.retryDelay * Math.pow(2, attempt - 1));
        console.warn(`[ScraperBase] attempt ${attempt} failed — retrying in ${wait}ms (${err.message})`);
        await this._sleep(wait);
      }
    }

    throw lastError;
  }

  async waitBetweenRequests() {
    await this._sleep(this._jitter(this.requestDelay));
  }

  // Must be overridden by each site-specific subclass.
  async scrape(query, options = {}) {
    throw new Error('scrape() must be implemented by subclass');
  }
}

module.exports = ScraperBase;
