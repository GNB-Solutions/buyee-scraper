'use strict';

// ── State ──────────────────────────────────────────────────────────────────

let activeScraper   = null;   // scraper config object from /api/scrapers
let activeSubSite   = null;   // selected sub-site id
let scrapers        = [];     // full list from server
let activeSource    = null;   // EventSource while running
let collectedItems  = [];     // all items received this run
let jpyToGbp        = null;   // exchange rate: 1 JPY → GBP
let activeProfileId = null;   // current trainer profile id
let profiles        = [];     // trainer profiles from /api/profiles

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  setupNavTabs();
  setupSidebarToggle();
  await Promise.all([loadScrapers(), loadProfiles(), loadRate()]);
  setupSearchForm();
  setupClientForm();
  setupProfileBar();
  setupInsightsPanel();
  setupAgentModal();
});

// ── Sidebar toggle ─────────────────────────────────────────────────────────

function setupSidebarToggle() {
  const btn     = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  if (!btn || !sidebar) return;
  btn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });
}

// ── Navigation ─────────────────────────────────────────────────────────────

function setupNavTabs() {
  document.querySelectorAll('.nav__tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.view;
      document.querySelectorAll('.nav__tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => {
        v.hidden = true;
        v.classList.remove('active');
      });
      tab.classList.add('active');
      const view = document.getElementById(`view-${target}`);
      view.hidden = false;
      view.classList.add('active');
    });
  });
}

// ── Exchange rate ──────────────────────────────────────────────────────────

async function loadRate() {
  try {
    const res  = await fetch('/api/rates');
    const data = await res.json();
    jpyToGbp = data.jpyToGbp ?? null;
  } catch {
    jpyToGbp = null;
  }
}

// ── Load scrapers from server ──────────────────────────────────────────────

async function loadScrapers() {
  try {
    const res = await fetch('/api/scrapers');
    scrapers = await res.json();
  } catch {
    scrapers = [];
  }

  buildSidebar(scrapers);
  buildSitesGrid(scrapers);

  const first = scrapers.find(s => s.status === 'live');
  if (first) selectScraper(first.id);
}

// ── Sidebar ────────────────────────────────────────────────────────────────

function buildSidebar(list) {
  const el = document.getElementById('sidebar-list');
  el.innerHTML = list.map(s => `
    <button
      class="sidebar-item${s.status === 'soon' ? ' soon' : ''}"
      data-id="${s.id}"
      ${s.status === 'soon' ? 'disabled title="Coming soon"' : ''}
    >
      <span class="sidebar-item__dot"></span>
      <span class="sidebar-item__name">${s.name}</span>
      ${s.status === 'soon' ? '<span class="sidebar-item__soon-tag">Soon</span>' : ''}
      <img class="sidebar-item__favicon"
           src="${esc(s.favicon || '')}"
           alt=""
           onerror="this.style.display='none'"
      />
    </button>
  `).join('');

  el.querySelectorAll('.sidebar-item:not(.soon)').forEach(btn => {
    btn.addEventListener('click', () => selectScraper(btn.dataset.id));
  });
}

function selectScraper(id) {
  activeScraper = scrapers.find(s => s.id === id);
  if (!activeScraper) return;

  document.querySelectorAll('.sidebar-item').forEach(b => {
    b.classList.toggle('active', b.dataset.id === id);
  });

  applyTheme(activeScraper);

  document.getElementById('scraper-title').textContent = activeScraper.name;

  const favicon = document.getElementById('panel-favicon');
  if (favicon) {
    favicon.src = activeScraper.favicon || '';
    favicon.style.display = activeScraper.favicon ? '' : 'none';
  }

  const link = document.getElementById('scraper-link');
  link.href        = activeScraper.url;
  link.textContent = `Visit ${activeScraper.url.replace('https://', '')} ↗`;

  buildSubSiteBar(activeScraper);
  resetResults();
}

function applyTheme(scraper) {
  const root = document.documentElement;
  root.style.setProperty('--brand',       scraper.color      || '#2563EB');
  root.style.setProperty('--brand-dark',  scraper.colorDark  || '#1D4ED8');
  root.style.setProperty('--brand-light', scraper.colorLight || '#EFF6FF');
}

function buildSubSiteBar(scraper) {
  const tabs = document.getElementById('subsite-tabs');

  if (!scraper.subSites || scraper.subSites.length === 0) {
    tabs.innerHTML = '';
    activeSubSite = null;
    return;
  }

  activeSubSite = scraper.defaultSubSite || scraper.subSites[0].id;

  tabs.innerHTML = scraper.subSites.map(ss => `
    <button class="subsite-tab${ss.id === activeSubSite ? ' active' : ''}" data-id="${esc(ss.id)}">
      ${esc(ss.label)}
    </button>
  `).join('');

  tabs.querySelectorAll('.subsite-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeSubSite = btn.dataset.id;
      tabs.querySelectorAll('.subsite-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.id === activeSubSite)
      );
      resetResults();
    });
  });
}

// ── Sites grid (request page) ──────────────────────────────────────────────

function buildSitesGrid(list) {
  const el = document.getElementById('sites-grid');
  el.innerHTML = list.map(s => `
    <div class="site-card site-card--${s.status}">
      <span class="site-card__status">${s.status === 'live' ? 'Live' : 'Coming soon'}</span>
      <div class="site-card__name">${s.name}</div>
      <div class="site-card__desc">${s.description}</div>
      ${s.fields && s.fields.length ? `
        <div class="site-card__fields">
          ${s.fields.map(f => `<span class="site-card__field">${f}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');
}

// ── Trainer: Profiles ──────────────────────────────────────────────────────

async function loadProfiles() {
  try {
    const res = await fetch('/api/profiles');
    profiles  = await res.json();
  } catch { profiles = []; }
  renderProfileSelect();
}

function renderProfileSelect() {
  const sel     = document.getElementById('profile-select');
  const current = sel.value;
  sel.innerHTML = '<option value="">No profile</option>' +
    profiles.map(p =>
      `<option value="${esc(p.id)}">${esc(p.name)}</option>`
    ).join('');
  if (profiles.find(p => p.id === current)) sel.value = current;
  onProfileChange();
}

function setupProfileBar() {
  document.getElementById('profile-select').addEventListener('change', onProfileChange);

  document.getElementById('profile-delete-btn').addEventListener('click', async () => {
    if (!activeProfileId) return;
    const prof = profiles.find(p => p.id === activeProfileId);
    if (!confirm(`Delete profile "${prof?.name}"? This also removes all its ratings.`)) return;
    await fetch(`/api/profiles/${activeProfileId}`, { method: 'DELETE' });
    activeProfileId = null;
    await loadProfiles();
  });
}

function syncRatingColumn() {
  const table = document.querySelector('.results-table');
  if (table) table.classList.toggle('show-ratings', !!activeProfileId);
}

function onProfileChange() {
  const sel   = document.getElementById('profile-select');
  activeProfileId = sel.value || null;
  const profile   = profiles.find(p => p.id === activeProfileId);

  document.getElementById('profile-delete-btn').hidden = !activeProfileId;
  document.getElementById('insights-btn').hidden       = !activeProfileId;
  hideElement('insights-panel');
  syncRatingColumn();

  if (profile) {
    if (profile.query)              document.getElementById('f-query').value    = profile.query;
    if (profile.filters?.minPrice)  document.getElementById('f-min').value      = profile.filters.minPrice;
    if (profile.filters?.maxPrice)  document.getElementById('f-max').value      = profile.filters.maxPrice;
    if (profile.filters?.sort)      document.getElementById('f-sort').value     = profile.filters.sort;
    if (profile.filters?.pages)     document.getElementById('f-pages').value    = profile.filters.pages;
  }
}

// ── Trainer: Insights ──────────────────────────────────────────────────────

function setupInsightsPanel() {
  document.getElementById('insights-btn').addEventListener('click', async () => {
    if (!activeProfileId) return;
    await refreshInsights();
    showElement('insights-panel');
  });

  document.getElementById('insights-close').addEventListener('click', () => {
    hideElement('insights-panel');
  });
}

async function refreshInsights() {
  if (!activeProfileId) return;
  try {
    const res  = await fetch(`/api/trainer/insights/${activeProfileId}`);
    const data = await res.json();

    document.getElementById('insights-count').textContent =
      `${data.totalRatings} rating${data.totalRatings !== 1 ? 's' : ''}`;

    renderKeywordTags('insights-positive', data.positive, 'pos');
    renderKeywordTags('insights-negative', data.negative, 'neg');
  } catch { /* ignore */ }
}

function renderKeywordTags(containerId, entries, type) {
  const el = document.getElementById(containerId);
  if (!entries || !entries.length) {
    el.innerHTML = `<span style="color:var(--text-3);font-size:.78rem">None yet</span>`;
    return;
  }
  el.innerHTML = entries.map(({ word, score }) =>
    `<span class="keyword-tag keyword-tag--${type}">
      ${esc(word)}<span class="keyword-tag__score">&nbsp;${score > 0 ? '+' : ''}${score}</span>
    </span>`
  ).join('');
}

// ── Trainer: Rating ────────────────────────────────────────────────────────

async function submitRating(item, rating, upBtn, downBtn) {
  if (!activeProfileId) return;

  // Toggle off if clicking already-active button
  if (rating ===  1 && upBtn.classList.contains('active-up'))   rating = 0;
  if (rating === -1 && downBtn.classList.contains('active-down')) rating = 0;

  upBtn.classList.remove('active-up');
  downBtn.classList.remove('active-down');
  if (rating ===  1) upBtn.classList.add('active-up');
  if (rating === -1) downBtn.classList.add('active-down');

  try {
    await fetch('/api/rate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ profileId: activeProfileId, item, rating }),
    });
  } catch { /* ignore */ }
}

// ── Search form ────────────────────────────────────────────────────────────

function setupSearchForm() {
  const form    = document.getElementById('search-form');
  const stopBtn = document.getElementById('stop-btn');

  form.addEventListener('submit', e => {
    e.preventDefault();
    startScrape();
  });

  stopBtn.addEventListener('click', () => stopScrape());

  document.getElementById('export-btn').addEventListener('click', exportJSON);
}

function startScrape() {
  if (!activeScraper) return;

  const query    = document.getElementById('f-query').value.trim();
  const maxPages = document.getElementById('f-pages').value;
  const minPrice = document.getElementById('f-min').value;
  const maxPrice = document.getElementById('f-max').value;
  const sort     = document.getElementById('f-sort').value;

  if (!query) return;

  resetResults();
  setSearching(true);

  const params = new URLSearchParams({ query, maxPages, sort });
  if (minPrice)        params.set('minPrice', minPrice);
  if (maxPrice)        params.set('maxPrice', maxPrice);
  if (activeSubSite)   params.set('subSite', activeSubSite);
  if (activeProfileId) params.set('profileId', activeProfileId);

  const url = `/api/scrape/${activeScraper.id}?${params}`;
  activeSource = new EventSource(url);

  activeSource.addEventListener('item', e => {
    const item = JSON.parse(e.data);
    collectedItems.push(item);
    appendRow(item, collectedItems.length);
    updateStats();
    showElement('results-wrap');
    showElement('stats-strip');
  });

  activeSource.addEventListener('page', e => {
    const { page } = JSON.parse(e.data);
    const maxPg = parseInt(maxPages, 10);
    setProgress(`Scraped page ${page} of ${maxPg}…`, page / maxPg);
  });

  activeSource.addEventListener('done', e => {
    const { total } = JSON.parse(e.data);
    finishScrape(total);
  });

  activeSource.addEventListener('error', e => {
    let msg = 'An error occurred during scraping.';
    try { msg = JSON.parse(e.data).message; } catch {}
    showError(msg);
    finishScrape(0);
  });

  activeSource.onerror = () => {
    if (activeSource.readyState === EventSource.CLOSED) {
      finishScrape(collectedItems.length);
    }
  };
}

function stopScrape() {
  if (activeSource) { activeSource.close(); activeSource = null; }
  finishScrape(collectedItems.length, true);
}

function finishScrape(total, stopped = false) {
  if (activeSource) { activeSource.close(); activeSource = null; }
  setSearching(false);

  const label = stopped
    ? `Stopped — ${total} item${total !== 1 ? 's' : ''} collected`
    : `Done — ${total} item${total !== 1 ? 's' : ''} found`;

  setProgress(label, 1, true);
  setTimeout(() => hideElement('status-bar'), 2000);

  if (total === 0 && !stopped) showElement('state-empty');
  if (total > 0)               showElement('export-btn');
  if (total > 0 && activeProfileId) {
    showElement('insights-btn');
    sortTableByTrainerScore();
  }

  updateStats();
}

// ── Results table ──────────────────────────────────────────────────────────

function appendRow(item, index) {
  const tbody = document.getElementById('results-body');
  const tr    = document.createElement('tr');

  // Trainer score tinting
  if (item.trainerScore != null) {
    if (item.trainerScore > 0) tr.classList.add('score-pos');
    if (item.trainerScore < 0) tr.classList.add('score-neg');
  }

  const imgCell = item.image
    ? `<img class="result-img" src="${esc(item.image)}" alt="" loading="lazy" onerror="this.replaceWith(placeholder())">`
    : `<div class="result-img-placeholder">📦</div>`;

  let priceHtml = `<span style="color:var(--text-3)">—</span>`;
  if (item.price != null) {
    const gbp = jpyToGbp ? (item.price * jpyToGbp).toFixed(2) : null;
    priceHtml = `<span class="result-price">
      <span class="ccy">${esc(item.currency || 'JPY')}</span>${item.price.toLocaleString()}
      ${gbp ? `<span class="result-price__gbp">£${gbp}</span>` : ''}
    </span>`;
  }

  tr.innerHTML = `
    <td class="col-img">${imgCell}</td>
    <td class="col-title">
      <a class="result-title-link" href="${esc(item.link)}" target="_blank" rel="noopener">
        <div class="result-title">${esc(item.title)}</div>
      </a>
      ${(item.romaji || toRomaji(item.title)) ? `<div class="result-romaji">${esc(item.romaji || toRomaji(item.title))}</div>` : ''}
    </td>
    <td class="col-rate"><div class="rate-cell">
      <button class="rate-btn" title="Good find" aria-label="Thumbs up">👍</button>
      <button class="rate-btn" title="Not relevant" aria-label="Thumbs down">👎</button>
    </div></td>
    <td class="col-price">${priceHtml}</td>
    <td class="col-time"><span class="result-time">${esc(parseTimeRemaining(item.timeRemaining || '—'))}</span></td>
  `;

  const [upBtn, downBtn] = tr.querySelectorAll('.rate-btn');
  upBtn.addEventListener('click',   () => submitRating(item,  1, upBtn, downBtn));
  downBtn.addEventListener('click', () => submitRating(item, -1, upBtn, downBtn));


  tbody.appendChild(tr);
}

function placeholder() {
  const d = document.createElement('div');
  d.className = 'result-img-placeholder';
  d.textContent = '📦';
  return d;
}

// ── Stats strip ────────────────────────────────────────────────────────────

function updateStats() {
  const items  = collectedItems;
  const prices = items.map(i => i.price).filter(p => p != null);
  const n      = items.length;

  document.getElementById('stat-count').textContent = `${n} item${n !== 1 ? 's' : ''}`;

  if (prices.length) {
    const avg  = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
    const low  = Math.min(...prices);
    const high = Math.max(...prices);
    document.getElementById('stat-avg').textContent  = `Avg ¥${avg.toLocaleString()}`;
    document.getElementById('stat-low').textContent  = `Low ¥${low.toLocaleString()}`;
    document.getElementById('stat-high').textContent = `High ¥${high.toLocaleString()}`;
  } else {
    document.getElementById('stat-avg').textContent  = 'Avg —';
    document.getElementById('stat-low').textContent  = 'Low —';
    document.getElementById('stat-high').textContent = 'High —';
  }
}

// ── Progress ───────────────────────────────────────────────────────────────

function setProgress(label, fraction, done = false) {
  showElement('progress-wrap');
  document.getElementById('progress-label').textContent = label;
  document.getElementById('progress-bar').classList.toggle('done', done);
}

// ── UI state helpers ───────────────────────────────────────────────────────

function setSearching(on) {
  document.getElementById('search-btn').disabled = on;
  document.getElementById('stop-btn').hidden     = !on;
}

function resetResults() {
  collectedItems = [];
  document.getElementById('results-body').innerHTML = '';
  hideElement('results-wrap');
  hideElement('stats-strip');
  hideElement('state-empty');
  hideElement('state-error');
  hideElement('progress-wrap');
  hideElement('export-btn');
  hideElement('insights-panel');
  document.getElementById('progress-bar').classList.remove('done');
}

function showError(msg) {
  const el = document.getElementById('state-error');
  el.textContent = `Error: ${msg}`;
  showElement('state-error');
}

function showElement(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}
function hideElement(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}

// ── Trainer: re-sort table by score after scrape completes ────────────────

function sortTableByTrainerScore() {
  const tbody = document.getElementById('results-body');
  const rows  = Array.from(tbody.querySelectorAll('tr'));
  if (!rows.length) return;

  // Pair each row with its score from collectedItems (same order)
  const scored = rows.map((row, i) => ({
    row,
    score: collectedItems[i]?.trainerScore ?? 0,
  }));

  scored.sort((a, b) => b.score - a.score);
  scored.forEach(({ row }) => tbody.appendChild(row));
}

// ── Export ─────────────────────────────────────────────────────────────────

function exportJSON() {
  const query   = document.getElementById('f-query').value.trim();
  const payload = {
    query,
    site:       activeScraper?.id,
    exportedAt: new Date().toISOString(),
    total:      collectedItems.length,
    results:    collectedItems,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${activeScraper?.id ?? 'scrape'}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Client request form ────────────────────────────────────────────────────

function setupClientForm() {
  const form     = document.getElementById('client-form');
  const success  = document.getElementById('form-success');
  const resetBtn = document.getElementById('form-reset-btn');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const submitBtn = document.getElementById('cf-submit');
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Sending…';

    const body = {
      name:    document.getElementById('cf-name').value.trim(),
      email:   document.getElementById('cf-email').value.trim(),
      company: document.getElementById('cf-company').value.trim(),
      website: document.getElementById('cf-website').value.trim(),
      fields:  document.getElementById('cf-fields').value.trim(),
      volume:  document.getElementById('cf-volume').value,
      notes:   document.getElementById('cf-notes').value.trim(),
    };

    try {
      const res = await fetch('/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Server error');
      form.hidden    = true;
      success.hidden = false;
    } catch {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Send request';
      alert('Something went wrong. Please try again.');
    }
  });

  resetBtn.addEventListener('click', () => {
    form.reset();
    form.hidden    = false;
    success.hidden = true;
    const btn = document.getElementById('cf-submit');
    btn.disabled    = false;
    btn.textContent = 'Send request';
  });
}

// ── Japanese → Romaji ─────────────────────────────────────────────────────

const KANA_TABLE = {
  // ── Katakana compounds ──
  'キャ':'kya','キュ':'kyu','キョ':'kyo',
  'シャ':'sha','シュ':'shu','ショ':'sho',
  'チャ':'cha','チュ':'chu','チョ':'cho',
  'ニャ':'nya','ニュ':'nyu','ニョ':'nyo',
  'ヒャ':'hya','ヒュ':'hyu','ヒョ':'hyo',
  'ミャ':'mya','ミュ':'myu','ミョ':'myo',
  'リャ':'rya','リュ':'ryu','リョ':'ryo',
  'ギャ':'gya','ギュ':'gyu','ギョ':'gyo',
  'ジャ':'ja', 'ジュ':'ju', 'ジョ':'jo',
  'ヂャ':'dya','ヂュ':'dyu','ヂョ':'dyo',
  'ビャ':'bya','ビュ':'byu','ビョ':'byo',
  'ピャ':'pya','ピュ':'pyu','ピョ':'pyo',
  'ファ':'fa', 'フィ':'fi', 'フェ':'fe', 'フォ':'fo',
  'ウィ':'wi', 'ウェ':'we', 'ウォ':'wo',
  'ヴァ':'va', 'ヴィ':'vi', 'ヴェ':'ve', 'ヴォ':'vo',
  'ティ':'ti', 'ディ':'di', 'トゥ':'tu', 'ドゥ':'du',
  // ── Katakana singles ──
  'ア':'a', 'イ':'i', 'ウ':'u', 'エ':'e', 'オ':'o',
  'カ':'ka','キ':'ki','ク':'ku','ケ':'ke','コ':'ko',
  'サ':'sa','シ':'shi','ス':'su','セ':'se','ソ':'so',
  'タ':'ta','チ':'chi','ツ':'tsu','テ':'te','ト':'to',
  'ナ':'na','ニ':'ni','ヌ':'nu','ネ':'ne','ノ':'no',
  'ハ':'ha','ヒ':'hi','フ':'fu','ヘ':'he','ホ':'ho',
  'マ':'ma','ミ':'mi','ム':'mu','メ':'me','モ':'mo',
  'ヤ':'ya','ユ':'yu','ヨ':'yo',
  'ラ':'ra','リ':'ri','ル':'ru','レ':'re','ロ':'ro',
  'ワ':'wa','ヲ':'wo','ン':'n',
  'ガ':'ga','ギ':'gi','グ':'gu','ゲ':'ge','ゴ':'go',
  'ザ':'za','ジ':'ji','ズ':'zu','ゼ':'ze','ゾ':'zo',
  'ダ':'da','ヂ':'ji','ヅ':'zu','デ':'de','ド':'do',
  'バ':'ba','ビ':'bi','ブ':'bu','ベ':'be','ボ':'bo',
  'パ':'pa','ピ':'pi','プ':'pu','ペ':'pe','ポ':'po',
  'ヴ':'vu',
  'ァ':'a', 'ィ':'i', 'ゥ':'u', 'ェ':'e', 'ォ':'o',
  'ャ':'ya','ュ':'yu','ョ':'yo',
  'ー':'-',
  // ── Hiragana compounds ──
  'きゃ':'kya','きゅ':'kyu','きょ':'kyo',
  'しゃ':'sha','しゅ':'shu','しょ':'sho',
  'ちゃ':'cha','ちゅ':'chu','ちょ':'cho',
  'にゃ':'nya','にゅ':'nyu','にょ':'nyo',
  'ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo',
  'みゃ':'mya','みゅ':'myu','みょ':'myo',
  'りゃ':'rya','りゅ':'ryu','りょ':'ryo',
  'ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo',
  'じゃ':'ja', 'じゅ':'ju', 'じょ':'jo',
  'びゃ':'bya','びゅ':'byu','びょ':'byo',
  'ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo',
  'てぃ':'ti', 'でぃ':'di',
  // ── Hiragana singles ──
  'あ':'a', 'い':'i', 'う':'u', 'え':'e', 'お':'o',
  'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
  'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
  'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
  'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
  'は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
  'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
  'や':'ya','ゆ':'yu','よ':'yo',
  'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
  'わ':'wa','を':'wo','ん':'n',
  'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
  'ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
  'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do',
  'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
  'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po',
  'ぁ':'a', 'ぃ':'i', 'ぅ':'u', 'ぇ':'e', 'ぉ':'o',
  'ゃ':'ya','ゅ':'yu','ょ':'yo',
};

// Small tsu / double-consonant markers
const GEMINATE = new Set(['ッ', 'っ']);
// N / ん/ン handled specially for apostrophe
const N_KANA   = new Set(['ン', 'ん']);

function toRomaji(str) {
  if (!str) return null;
  if (!/[\u3040-\u309F\u30A0-\u30FF]/.test(str)) return null;

  let out = '';
  let i   = 0;

  while (i < str.length) {
    const ch = str[i];

    // Geminate (っ/ッ): duplicate first consonant of the next syllable
    if (GEMINATE.has(ch)) {
      const next2 = KANA_TABLE[str[i + 1] + str[i + 2]];
      const next1 = KANA_TABLE[str[i + 1]];
      const syl   = next2 ?? next1;
      if (syl && /^[bcdfghjklmnpqrstvwyz]/.test(syl)) out += syl[0];
      i++;
      continue;
    }

    // N/ん/ン: add apostrophe before vowels, y, or another n to avoid ambiguity
    if (N_KANA.has(ch)) {
      out += 'n';
      const next = str[i + 1];
      if (next && /^[\u3041-\u309Eあいうえおやゆよ\u30A1-\u30FEアイウエオヤユヨn]/.test(next)) {
        out += "'";
      }
      i++;
      continue;
    }

    // Compound (two-char) lookup first
    const two = KANA_TABLE[str[i] + str[i + 1]];
    if (two !== undefined) { out += two; i += 2; continue; }

    // Single-char lookup
    const one = KANA_TABLE[ch];
    if (one !== undefined) { out += one; i++; continue; }

    // Pass through anything else (Latin, numbers, spaces, kanji…)
    out += ch;
    i++;
  }

  out = out.trim();
  if (!out || out === str) return null;

  // Only show if there's actual romaji content (not just passthrough kanji)
  if (!/[a-z]/i.test(out)) return null;

  return out.charAt(0).toUpperCase() + out.slice(1);
}

// ── Japanese time → English ────────────────────────────────────────────────

function parseTimeRemaining(str) {
  if (!str || str === '—') return str;
  if (!/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(str)) return str;

  if (/終了|落札済/.test(str)) return 'Ended';

  // Strip 残り (remaining) prefix
  const s = str.replace(/残り/g, '').trim();

  const days  = s.match(/(\d+)\s*日/);
  const hours = s.match(/(\d+)\s*時間/);
  const mins  = s.match(/(\d+)\s*分/);
  const secs  = s.match(/(\d+)\s*秒/);

  const parts = [];
  if (days)  parts.push(`${days[1]}d`);
  if (hours) parts.push(`${hours[1]}h`);
  if (mins)  parts.push(`${mins[1]}m`);
  if (secs && !days && !hours) parts.push(`${secs[1]}s`);

  return parts.length ? parts.join(' ') : str;
}

// ── Agent: Inline profile creator ─────────────────────────────────────────

const pcState = {
  tab:         'describe',
  imageB64:    null,
  imageMime:   null,
  posKeywords: [],
  negKeywords: [],
};

function setupAgentModal() {
  // Open / cancel
  document.getElementById('profile-new-btn').addEventListener('click', openProfileCreate);
  document.getElementById('pc-cancel-btn').addEventListener('click',  closeProfileCreate);

  // Tabs
  document.querySelectorAll('.profile-create__tab').forEach(tab => {
    tab.addEventListener('click', () => switchPcTab(tab.dataset.tab));
  });

  // Image drop zone
  const drop      = document.getElementById('pc-drop');
  const fileInput = document.getElementById('pc-file-input');
  document.getElementById('pc-browse-btn').addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handlePcImage(fileInput.files[0]));
  drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', ()  => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag-over'); handlePcImage(e.dataTransfer.files[0]); });

  // Actions
  document.getElementById('pc-generate-btn').addEventListener('click', runProfileGenerate);
  document.getElementById('pc-retry-btn').addEventListener('click',    resetPcResult);
  document.getElementById('pc-save-btn').addEventListener('click',     saveProfileFromAgent);

  // Keyword add inputs
  document.getElementById('pc-add-pos').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const val = e.target.value.trim().toLowerCase();
    if (val && !pcState.posKeywords.includes(val)) {
      pcState.posKeywords.push(val);
      renderPcKeywords();
    }
    e.target.value = '';
  });
  document.getElementById('pc-add-neg').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const val = e.target.value.trim().toLowerCase();
    if (val && !pcState.negKeywords.includes(val)) {
      pcState.negKeywords.push(val);
      renderPcKeywords();
    }
    e.target.value = '';
  });

  pollOllamaStatus();
  setInterval(pollOllamaStatus, 60_000);
}

function openProfileCreate() {
  document.getElementById('profile-create').hidden = false;
  document.getElementById('pc-text').focus();
}

function closeProfileCreate() {
  document.getElementById('profile-create').hidden = true;
  pcState.tab = 'describe'; pcState.imageB64 = null; pcState.imageMime = null;
  pcState.posKeywords = []; pcState.negKeywords = [];
  resetPcResult();
  switchPcTab('describe');
}

function switchPcTab(tab) {
  pcState.tab = tab;
  document.querySelectorAll('.profile-create__tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );
  document.getElementById('pc-tab-describe').hidden = tab !== 'describe';
  document.getElementById('pc-tab-photo').hidden    = tab !== 'photo';
  document.getElementById('pc-tab-manual').hidden   = tab !== 'manual';

  const genBtn = document.getElementById('pc-generate-btn');
  genBtn.textContent = tab === 'manual' ? 'Save' : 'Generate';
}

function handlePcImage(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1024;
      const scale  = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      pcState.imageB64  = dataUrl.split(',')[1];
      pcState.imageMime = 'image/jpeg';
      const preview = document.getElementById('pc-img-preview');
      preview.src    = dataUrl;
      preview.hidden = false;
      document.getElementById('pc-drop').querySelector('.pc-drop__hint').hidden = true;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function runProfileGenerate() {
  if (pcState.tab === 'manual') { saveManualProfile(); return; }

  const body = { scraper: activeScraper?.id, subSite: activeSubSite };
  if (pcState.tab === 'describe') {
    body.text = document.getElementById('pc-text').value.trim();
    if (!body.text) return;
  } else {
    if (!pcState.imageB64) return;
    body.image    = pcState.imageB64;
    body.mimeType = pcState.imageMime;
  }

  document.getElementById('pc-input-actions').hidden = true;
  document.getElementById('pc-loading').hidden        = false;

  try {
    const res = await fetch('/api/agent/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }
    const result = await res.json();
    pcState.posKeywords = result.positiveKeywords || [];
    pcState.negKeywords = result.negativeKeywords || [];
    showPcResult(result);
  } catch (err) {
    document.getElementById('pc-loading').hidden        = false;
    document.getElementById('pc-input-actions').hidden  = false;
    document.getElementById('pc-loading').hidden        = true;
    alert(`Generation failed: ${err.message}`);
  }
}

function showPcResult(result) {
  document.getElementById('pc-loading').hidden = true;
  document.getElementById('pc-result-name').value  = result.name  || '';
  document.getElementById('pc-result-query').value = result.query || '';
  const reasoning = document.getElementById('pc-reasoning');
  reasoning.textContent = result.reasoning || '';
  reasoning.hidden      = !result.reasoning;
  renderPcKeywords();
  document.getElementById('pc-result').hidden = false;
}

function renderPcKeywords() {
  renderPcTags('pc-pos-tags', pcState.posKeywords, 'pos');
  renderPcTags('pc-neg-tags', pcState.negKeywords, 'neg');
}

function renderPcTags(containerId, keywords, type) {
  const el = document.getElementById(containerId);
  el.innerHTML = keywords.map((kw, i) =>
    `<span class="pc-kw-tag pc-kw-tag--${type}" style="animation-delay:${i * 35}ms">
      ${esc(kw)}<button class="pc-kw-tag__remove" data-kw="${esc(kw)}" data-type="${type}" aria-label="Remove">×</button>
    </span>`
  ).join('');
  el.querySelectorAll('.pc-kw-tag__remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const kw   = btn.dataset.kw;
      const type = btn.dataset.type;
      if (type === 'pos') pcState.posKeywords = pcState.posKeywords.filter(k => k !== kw);
      else                pcState.negKeywords = pcState.negKeywords.filter(k => k !== kw);
      renderPcKeywords();
    });
  });
}

function resetPcResult() {
  document.getElementById('pc-result').hidden         = true;
  document.getElementById('pc-loading').hidden        = true;
  document.getElementById('pc-input-actions').hidden  = false;
}

async function saveProfileFromAgent() {
  const name  = document.getElementById('pc-result-name').value.trim();
  const query = document.getElementById('pc-result-query').value.trim();
  if (!name || !query) { alert('Name and query are required.'); return; }

  const saveBtn = document.getElementById('pc-save-btn');
  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving…';

  try {
    const res = await fetch('/api/agent/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, query,
        positiveKeywords: pcState.posKeywords,
        negativeKeywords: pcState.negKeywords,
        scraper: activeScraper?.id,
        subSite: activeSubSite,
        filters: { sort: document.getElementById('f-sort').value, pages: document.getElementById('f-pages').value },
      }),
    });
    if (!res.ok) throw new Error('Failed to save profile');
    const profile = await res.json();

    await loadProfiles();
    document.getElementById('profile-select').value = profile.id;
    onProfileChange();
    closeProfileCreate();
    startScrape();
  } catch (err) {
    alert(`Could not save: ${err.message}`);
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save & search';
  }
}

async function saveManualProfile() {
  const name = document.getElementById('pc-manual-name').value.trim();
  if (!name) { document.getElementById('pc-manual-name').focus(); return; }
  const query = document.getElementById('f-query').value.trim();
  if (!query) { alert('Run a search first, then save it as a profile.'); return; }

  try {
    const res = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, scraper: activeScraper?.id, subSite: activeSubSite, query,
        filters: {
          minPrice: document.getElementById('f-min').value   || null,
          maxPrice: document.getElementById('f-max').value   || null,
          sort:     document.getElementById('f-sort').value,
          pages:    document.getElementById('f-pages').value,
        },
        lotMode: false,
      }),
    });
    const profile = await res.json();
    await loadProfiles();
    document.getElementById('profile-select').value = profile.id;
    onProfileChange();
    closeProfileCreate();
  } catch {
    alert('Could not save profile.');
  }
}

// ── Ollama status dot ──────────────────────────────────────────────────────

async function pollOllamaStatus() {
  const dot = document.getElementById('ollama-dot');
  if (!dot) return;
  try {
    const res  = await fetch('/api/agent/health');
    const data = await res.json();
    if (!data.ok) {
      dot.className = 'ollama-dot ollama-dot--off';
      dot.title     = 'AI offline — start Ollama';
    } else if (!data.ready) {
      dot.className = 'ollama-dot ollama-dot--warn';
      dot.title     = `AI: model not pulled (run: ollama pull ${data.model})`;
    } else {
      dot.className = 'ollama-dot ollama-dot--ready';
      dot.title     = `AI ready (${data.model})`;
    }
  } catch {
    dot.className = 'ollama-dot ollama-dot--off';
    dot.title     = 'AI offline';
  }
}

// ── Utility ────────────────────────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
