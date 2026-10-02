/* AI Radar — каталог AI-сайтів на публічному API freeserp.ai (index=sites, ніша AI). Без збірки, без залежностей. */
(() => {
  'use strict';

  const API = 'https://freeserp.ai/api.php';
  const PROXY = 'api/freeserp'; // відносний шлях, працює і в підпапці
  const AGENT = 'AIRadar/1.0';
  const PAGE_SIZE = 24;
  const NEWS_SIZE = 48;
  const MAX_COMPARE = 4;
  const LS_KEY = 'airadar.compare.v1';
  const LS_THEME = 'airadar.theme';
  const CACHE_TTL = 5 * 60 * 1000;      // відповіді API вважаємо свіжими 5 хвилин
  const REFRESH_AFTER = 10 * 60 * 1000; // повернулись до вкладки після 10+ хвилин: оновлюємо дані

  // Ніші, які API рахує справжніми AI-продуктами (інші разом з ai_startups=1 дають порожню видачу).
  const CATS = [
    'AI Agents & Autonomous', 'Code & Dev Tools', 'AI Infrastructure & API', 'AI Automation & Workflows',
    'LLM & Prompt Tools', 'AI Search & Answers', 'AI Website Builder', 'No-code / App Builder',
    'Image Generation', 'Video Generation', 'Voice & Text-to-Speech', 'Data & Analytics',
    'Research & Science', 'Design & UI', 'AI Chatbot & Assistant'
  ];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
  const fmtNum = (n) => Number(n || 0).toLocaleString('uk-UA');
  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
  const fmtDay = (d) => {
    if (!d) return '—';
    const sameYear = d.slice(0, 4) === String(new Date().getFullYear());
    return new Date(d + 'T00:00:00').toLocaleDateString('uk-UA', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const prefersReduced = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  // Ніші сайту: спершу справжні AI-ніші зі списку, потім решта (API повертає й «шумові», як E-commerce).
  const nichesOf = (r) => { const all = r.ai_categories || []; return [...all.filter((c) => CATS.includes(c)), ...all.filter((c) => !CATS.includes(c))]; };
  const tile = (domain, cls = '') => `<span class="tile ${cls}" aria-hidden="true">${esc((String(domain || '?').match(/[a-z0-9а-яіїєґ]/i) || ['?'])[0])}</span>`;

  // Зсув ISO-дати (YYYY-MM-DD) на N днів назад, у UTC, щоб уникнути проблем із часовими поясами.
  const shiftIso = (iso, days) => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  };
  const diffDays = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 864e5);
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  /* ---------- API ---------- */
  const cache = new Map();
  const seen = new Map(); // domain -> record
  let inflight = null;

  async function api(params, { signal } = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) qs.set(k, v);
    });
    qs.set('agent', AGENT);
    const key = qs.toString();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < CACHE_TTL) return hit.json;
    const json = await request(key, signal);
    if (!json.ok) throw new Error(json.error || 'API error');
    (json.results || []).forEach((r) => seen.set(r.domain, r));
    cache.set(key, { t: Date.now(), json });
    return json;
  }

  // Запит до API. Спочатку через проксі того ж домену (api/freeserp: Netlify/Vercel rewrite або server.js),
  // бо freeserp.ai зараз віддає Access-Control-Allow-Origin двічі ("*, *") і браузер блокує прямі запити.
  // Якщо проксі немає (напр. GitHub Pages) — пробуємо напряму.
  let mode = null; // 'proxy' | 'direct'
  let probe = null; // перший запит вирішує, чи є проксі; решта чекає на вердикт
  async function request(qs, signal) {
    const attempt = async (base) => {
      const res = await fetch(`${base}?${qs}`, { signal });
      if (!res.ok) {
        const err = new Error(`API ${res.status}`);
        err.noProxy = res.status === 404 || res.status === 405; // проксі немає на цьому хостингу
        throw err;
      }
      if (!(res.headers.get('content-type') || '').includes('json')) {
        const err = new Error('Not JSON');
        err.noProxy = true;
        throw err;
      }
      return res.json();
    };
    if (location.protocol === 'file:') return attempt(API);
    if (mode === null) {
      if (!probe) {
        probe = attempt(PROXY).then(
          (json) => { mode = 'proxy'; return json; },
          (e) => {
            probe = null;
            if (e.noProxy) { mode = 'direct'; return null; }
            throw e;
          }
        );
        const first = await probe;
        if (first) return first;
      } else {
        try { await probe; } catch { /* вердикту немає, пробуємо проксі */ }
      }
    }
    return attempt(mode === 'direct' ? API : PROXY);
  }

  // Підказка для стану помилки. Прямий режим означає, що проксі на хостингу немає, а браузер блокує API через CORS.
  const errorHint = () => (mode === 'direct' || location.protocol === 'file:'
    ? 'Браузер блокує прямі запити до freeserp.ai (CORS). Запустіть проєкт командою node server.js або задеплойте на Netlify чи Vercel: там працює проксі.'
    : 'API тимчасово недоступне або немає з’єднання. Спробуйте ще раз.');

  // Скасовуємо попередній запит, коли користувач швидко змінює фільтри.
  async function apiLatest(params) {
    if (inflight) inflight.abort();
    inflight = new AbortController();
    const ctrl = inflight;
    try {
      return await api(params, { signal: ctrl.signal });
    } finally {
      if (inflight === ctrl) inflight = null;
    }
  }

  // Остання дата went_live в індексі та кілька найновіших сайтів.
  // Індекс може відставати від сьогодні, тому «новинки» рахуємо від цієї дати.
  let latestLive = null;
  let latestBatch = [];
  let latestAt = 0;
  async function getLatestLive() {
    if (latestLive && Date.now() - latestAt < CACHE_TTL) return latestLive;
    const j = await api({ ai_startups: 1, sort: 'went_live', order: 'desc', size: 6 });
    latestBatch = j.results || [];
    latestLive = (latestBatch[0] && latestBatch[0].went_live) || todayIso();
    latestAt = Date.now();
    return latestLive;
  }
  const isFresh = (r) => Boolean(latestLive && r.went_live && diffDays(latestLive, r.went_live) <= 3);

  /* ---------- Тема, навбар, меню ---------- */
  function initTheme() {
    const root = document.documentElement;
    if (!root.getAttribute('data-theme')) {
      const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
    }
    $('#themeBtn').addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(LS_THEME, next); } catch { /* приватний режим */ }
    });
  }

  function placeIndicator(first = false) {
    const ind = $('#navInd');
    const active = $('.nav a.is-active');
    if (!ind || !active || !active.offsetWidth) return;
    if (first) ind.classList.add('no-anim');
    ind.style.width = `${active.offsetWidth}px`;
    ind.style.transform = `translateX(${active.offsetLeft}px)`;
    ind.classList.add('is-ready');
    if (first) requestAnimationFrame(() => requestAnimationFrame(() => ind.classList.remove('no-anim')));
  }

  function setMenu(open) {
    const shell = $('#navShell');
    shell.classList.toggle('nav-open', open);
    $('#menuBtn').setAttribute('aria-expanded', String(open));
  }

  function wireNavbar() {
    initTheme();
    $('#menuBtn').addEventListener('click', () => setMenu(!$('#navShell').classList.contains('nav-open')));
    $('#nav').addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('click', (e) => { if (!e.target.closest('#navShell')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    const onScroll = () => $('#navShell').classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    window.addEventListener('resize', () => placeIndicator());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeIndicator());
  }

  /* ---------- Порівняння (localStorage) ---------- */
  let compare = [];
  try { compare = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { compare = []; }
  if (!Array.isArray(compare)) compare = [];
  const saveCompare = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(compare)); } catch { /* приватний режим */ } };
  const inCompare = (d) => compare.some((r) => r.domain === d);

  function toggleCompare(domain) {
    if (inCompare(domain)) {
      compare = compare.filter((r) => r.domain !== domain);
    } else {
      if (compare.length >= MAX_COMPARE) { alert(`Можна порівнювати до ${MAX_COMPARE} сайтів. Приберіть один із порівняння.`); return; }
      const r = seen.get(domain);
      if (!r) return;
      compare.push({
        domain: r.domain, url: r.url, title: r.title, ai_summary: r.ai_summary, ai_categories: r.ai_categories || [],
        ai_source: r.ai_source, dr: r.dr, went_live: r.went_live, tld: r.tld, webserver: r.webserver
      });
    }
    saveCompare();
    syncCompareUI();
  }

  function syncCompareUI() {
    const b = $('#cmpBadge');
    b.textContent = compare.length;
    b.hidden = compare.length === 0;
    $$('[data-cmp]').forEach((btn) => {
      const on = inCompare(btn.dataset.cmp);
      btn.classList.toggle('is-on', on);
      btn.innerHTML = on ? `${icon('check')}У порівнянні` : `${icon('plus')}Порівняти`;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    // панель вибраних
    const tray = $('#tray');
    $('#trayStack').innerHTML = compare.map((r) => tile(r.domain)).join('');
    $('#trayText').textContent = `Вибрано ${compare.length} з ${MAX_COMPARE}`;
    tray.dataset.open = String(compare.length > 0 && currentView !== 'compare');
    if (currentView === 'compare') renderCompare();
    requestAnimationFrame(() => placeIndicator());
  }

  /* ---------- Картки ---------- */
  function drRing(dr, i) {
    const C = 2 * Math.PI * 19.5;
    if (dr == null) {
      return `<span class="dr dr--none" title="Domain Rating ще не пораховано"><svg viewBox="0 0 46 46" aria-hidden="true"><circle class="dr__track" cx="23" cy="23" r="19.5"/></svg><b>—</b></span>`;
    }
    const v = Math.max(0, Math.min(100, Number(dr)));
    const off = (C * (1 - v / 100)).toFixed(2);
    return `<span class="dr ${v >= 40 ? 'dr--hi' : ''}" title="Domain Rating ${esc(v)} зі 100" style="--i:${i}">
      <svg viewBox="0 0 46 46" aria-hidden="true"><circle class="dr__track" cx="23" cy="23" r="19.5"/><circle class="dr__val" cx="23" cy="23" r="19.5" style="--c:${C.toFixed(2)};--off:${off}"/></svg><b>${esc(v)}</b></span>`;
  }

  function cardHtml(r, i = 0) {
    const cats = nichesOf(r).slice(0, 3).map((c) => `<span class="chip">${esc(c)}</span>`).join('');
    const fresh = isFresh(r) ? '<span class="chip chip--new">Нове</span>' : '';
    const stack = r.ai_source && r.ai_source !== 'not_ai' ? `<span class="chip chip--plain">${esc(String(r.ai_source).replace(/^gen:/, ''))}</span>` : '';
    const long = (r.ai_summary || '').length > 220;
    const reveal = i < 12 ? ' reveal' : '';
    return `
      <article class="card${reveal}" style="--i:${i}">
        <div class="card__head">
          ${tile(r.domain, 'tile--lg')}
          <div class="card__id">
            <a class="card__domain" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${esc(r.domain)}</a>
            <p class="card__title">${esc(r.title || '')}</p>
          </div>
          ${drRing(r.dr, i)}
        </div>
        <p class="card__sum">${esc(r.ai_summary || 'Опис відсутній.')}</p>
        ${long ? '<button type="button" class="more" data-more>Показати більше</button>' : ''}
        <div class="chips-row">${fresh}${cats}${stack}</div>
        <div class="card__foot">
          <span title="Дата, коли зонд уперше підтвердив сайт живим">Live з ${esc(fmtDate(r.went_live))}</span>
          <button type="button" class="cmp-btn" data-cmp="${esc(r.domain)}" aria-pressed="false">${icon('plus')}Порівняти</button>
        </div>
      </article>`;
  }

  const skeletons = (n) => Array.from({ length: n }, () => '<div class="skel" aria-hidden="true"></div>').join('');
  const stateHtml = (title, text, retry) =>
    `<div class="state"><strong>${esc(title)}</strong><span>${esc(text)}</span>${retry ? '<button type="button" class="btn btn--primary" data-retry>Спробувати ще раз</button>' : ''}</div>`;

  /* ---------- Чипи ніш ---------- */
  function buildChips(el) {
    el.innerHTML = ['', ...CATS].map((c) =>
      `<button type="button" class="pill" data-cat="${esc(c)}" aria-pressed="false">${c ? esc(c) : 'Усі ніші'}</button>`).join('');
  }
  function markChips(el, value) {
    let active = null;
    $$('.pill', el).forEach((b) => {
      const on = b.dataset.cat === value;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
      if (on) active = b;
    });
    if (active && el.scrollTo) el.scrollTo({ left: Math.max(0, active.offsetLeft - 40), behavior: prefersReduced() ? 'auto' : 'smooth' });
  }

  /* ---------- Роутінг ---------- */
  let currentView = 'catalog';
  let lastPath = null;
  let retryFn = null;

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, query = ''] = raw.split('?');
    return { path: ['catalog', 'new', 'compare', 'plan'].includes(path) ? path : 'catalog', params: new URLSearchParams(query) };
  }

  function go(path, params) {
    const qs = params && [...params].length ? '?' + params.toString() : '';
    const next = `#/${path}${qs}`;
    if (location.hash === next) route(); else location.hash = next;
  }

  function route() {
    const { path, params } = parseHash();
    const pathChanged = lastPath !== null && lastPath !== path;
    lastPath = path;

    const render = () => {
      currentView = path;
      $$('.view').forEach((v) => { v.hidden = v.id !== `view-${path}`; });
      $$('[data-nav]').forEach((a) => {
        const on = a.dataset.nav === path;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      document.title = { catalog: 'Каталог', new: 'Новинки', compare: 'Порівняння', plan: 'План сайту' }[path] + ' — AI Radar';
      if (path === 'catalog') initCatalog(params);
      if (path === 'new') initNews(params);
      if (path === 'compare') renderCompare();
      $('#tray').dataset.open = String(compare.length > 0 && path !== 'compare');
      placeIndicator(true);
      if (pathChanged) window.scrollTo({ top: 0 });
    };

    // Плавний перехід між сторінками (View Transitions API), лише коли змінюється розділ.
    if (pathChanged && document.startViewTransition && !prefersReduced()) document.startViewTransition(render);
    else render();
  }

  /* ---------- Каталог ---------- */
  const catState = { q: '', cat: '', dr: 0, sort: 'relevance:desc', startups: true, page: 1 };

  function readCatalogParams(p) {
    catState.q = p.get('q') || '';
    catState.cat = p.get('cat') || '';
    catState.dr = Math.min(60, Math.max(0, parseInt(p.get('dr') || '0', 10) || 0));
    catState.sort = p.get('sort') || 'relevance:desc';
    catState.startups = p.get('all') !== '1';
    catState.page = Math.max(1, parseInt(p.get('page') || '1', 10) || 1);
  }

  function catalogToParams(s) {
    const p = new URLSearchParams();
    if (s.q) p.set('q', s.q);
    if (s.cat) p.set('cat', s.cat);
    if (s.dr) p.set('dr', s.dr);
    if (s.sort !== 'relevance:desc' && s.sort !== 'relevance') p.set('sort', s.sort);
    if (!s.startups) p.set('all', '1');
    if (s.page > 1) p.set('page', s.page);
    return p;
  }

  function syncCatalogForm() {
    const q = $('#fQ');
    if (document.activeElement !== q) q.value = catState.q;
    markChips($('#catChips'), catState.cat);
    $('#fDr').value = catState.dr;
    $('#fDrOut').textContent = catState.dr;
    const sortVal = catState.sort === 'relevance:desc' ? 'relevance' : catState.sort;
    $('#fSort').value = [...$('#fSort').options].some((o) => o.value === sortVal) ? sortVal : 'relevance';
    $('#fStartups').checked = catState.startups;
  }

  function initCatalog(params) {
    readCatalogParams(params);
    syncCatalogForm();
    loadCatalog();
  }

  async function loadCatalog() {
    const grid = $('#catGrid');
    const meta = $('#catMeta');
    const pager = $('#catPager');
    grid.innerHTML = skeletons(6);
    pager.innerHTML = '';
    meta.textContent = 'Завантажую…';
    retryFn = loadCatalog;

    const [sort, order] = catState.sort.split(':');
    const params = {
      ai_startups: catState.startups ? 1 : '',
      category: catState.startups ? '' : 'ai',
      q: catState.q.trim(),
      ai_categories: catState.cat,
      dr_min: catState.dr || '',
      sort: sort === 'relevance' ? '' : sort,
      order: sort === 'relevance' ? '' : order,
      size: PAGE_SIZE,
      from: (catState.page - 1) * PAGE_SIZE
    };

    try {
      const data = await apiLatest(params);
      const total = data.total || 0;
      const pages = Math.max(1, Math.ceil(Math.min(total, 10000) / PAGE_SIZE));
      meta.innerHTML = total
        ? `<span>Знайдено <b>${fmtNum(total)}</b></span><span>Сторінка <b>${catState.page}</b> з ${fmtNum(pages)}</span>`
        : '';
      if (!data.results.length) {
        grid.innerHTML = stateHtml('Нічого не знайдено', 'Спробуйте інший запит, іншу нішу або зніміть обмеження за DR.');
        return;
      }
      grid.innerHTML = data.results.map((r, i) => cardHtml(r, i)).join('');
      syncCompareUI();
      pager.innerHTML = `
        <button type="button" class="btn btn--quiet btn--sm" data-page="${catState.page - 1}" ${catState.page <= 1 ? 'disabled' : ''}>${icon('left')}Назад</button>
        <span>${catState.page} з ${fmtNum(pages)}</span>
        <button type="button" class="btn btn--quiet btn--sm" data-page="${catState.page + 1}" ${catState.page >= pages ? 'disabled' : ''}>Далі${icon('right')}</button>`;
    } catch (e) {
      if (e.name === 'AbortError') return;
      meta.textContent = '';
      grid.innerHTML = stateHtml('Не вдалося завантажити дані', errorHint(), true);
    }
  }

  function pushCatalog(resetPage = true) {
    if (resetPage) catState.page = 1;
    go('catalog', catalogToParams(catState));
  }

  function wireCatalog() {
    buildChips($('#catChips'));
    let t;
    $('#fQ').addEventListener('input', (e) => {
      catState.q = e.target.value;
      clearTimeout(t);
      t = setTimeout(() => pushCatalog(), 350);
    });
    $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(t); pushCatalog(); });
    $('#filters').addEventListener('submit', (e) => e.preventDefault());
    $('#catChips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      catState.cat = b.dataset.cat;
      pushCatalog();
    });
    $('#fSort').addEventListener('change', (e) => { catState.sort = e.target.value === 'relevance' ? 'relevance:desc' : e.target.value; pushCatalog(); });
    $('#fStartups').addEventListener('change', (e) => { catState.startups = e.target.checked; pushCatalog(); });
    let t2;
    $('#fDr').addEventListener('input', (e) => {
      catState.dr = Number(e.target.value);
      $('#fDrOut').textContent = e.target.value;
      clearTimeout(t2);
      t2 = setTimeout(() => pushCatalog(), 300);
    });
    $('#fReset').addEventListener('click', () => {
      Object.assign(catState, { q: '', cat: '', dr: 0, sort: 'relevance:desc', startups: true, page: 1 });
      syncCatalogForm();
      go('catalog');
    });
    $('#catPager').addEventListener('click', (e) => {
      const b = e.target.closest('[data-page]');
      if (!b || b.disabled) return;
      catState.page = Number(b.dataset.page);
      pushCatalog(false);
      const top = $('#filters');
      if (top && top.scrollIntoView) top.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
    });
  }

  /* ---------- Новинки ---------- */
  const newsState = { days: 7, cat: '', from: 0, items: [], total: 0 };

  function initNews(params) {
    const days = parseInt(params.get('days') || '7', 10);
    newsState.days = [3, 7, 14, 30].includes(days) ? days : 7;
    newsState.cat = params.get('cat') || '';
    newsState.from = 0;
    newsState.items = [];
    $$('#newPeriod button').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.days) === newsState.days));
    markChips($('#newChips'), newsState.cat);
    loadNews(false);
  }

  async function loadNews(append) {
    const list = $('#newList');
    const meta = $('#newMeta');
    const more = $('#newMore');
    retryFn = () => loadNews(append);
    if (!append) { list.innerHTML = `<div class="grid">${skeletons(6)}</div>`; meta.textContent = 'Завантажую…'; more.innerHTML = ''; }
    else more.innerHTML = '<span>Завантажую…</span>';

    try {
      const latest = await getLatestLive();
      const data = await apiLatest({
        ai_startups: 1,
        ai_categories: newsState.cat,
        from_date: shiftIso(latest, newsState.days),
        sort: 'went_live',
        order: 'desc',
        size: NEWS_SIZE,
        from: newsState.from
      });
      newsState.total = data.total || 0;
      newsState.items = append ? newsState.items.concat(data.results) : data.results;
      const stale = diffDays(todayIso(), latest) > 2
        ? `<span>Найсвіжіші дані в індексі від ${esc(fmtDate(latest))}, тому період рахується від цієї дати</span>`
        : '';
      meta.innerHTML = `<span>Нових стартапів за ${newsState.days} дн.: <b>${fmtNum(newsState.total)}</b></span>${stale}`;
      if (!newsState.items.length) {
        list.innerHTML = `<div class="grid">${stateHtml('Поки що порожньо', 'За цей період у цій ніші нічого не знайдено. Збільште період або змініть нішу.')}</div>`;
        more.innerHTML = '';
        return;
      }
      // групуємо за датою запуску
      const groups = new Map();
      newsState.items.forEach((r) => {
        const k = r.went_live || 'unknown';
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(r);
      });
      let n = 0;
      list.innerHTML = [...groups].map(([day, rows]) =>
        `<h2 class="day">${esc(fmtDate(day))}<span>${rows.length}</span></h2><div class="grid">${rows.map((r) => cardHtml(r, append ? 99 : n++)).join('')}</div>`).join('');
      syncCompareUI();
      const loaded = newsState.items.length;
      const canMore = loaded < newsState.total && loaded < 10000;
      more.innerHTML = canMore
        ? `<button type="button" class="btn btn--quiet" id="newMoreBtn">Показати ще <span style="color:var(--faint)">${fmtNum(loaded)} з ${fmtNum(newsState.total)}</span></button>`
        : '';
    } catch (e) {
      if (e.name === 'AbortError') return;
      meta.textContent = '';
      more.innerHTML = '';
      list.innerHTML = `<div class="grid">${stateHtml('Не вдалося завантажити новинки', errorHint(), true)}</div>`;
    }
  }

  function wireNews() {
    buildChips($('#newChips'));
    $('#newPeriod').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-days]');
      if (!b) return;
      const p = new URLSearchParams({ days: b.dataset.days });
      if (newsState.cat) p.set('cat', newsState.cat);
      go('new', p);
    });
    $('#newChips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      const p = new URLSearchParams({ days: newsState.days });
      if (b.dataset.cat) p.set('cat', b.dataset.cat);
      go('new', p);
    });
    $('#newMore').addEventListener('click', (e) => {
      if (!e.target.closest('#newMoreBtn')) return;
      newsState.from = newsState.items.length;
      loadNews(true);
    });
  }

  /* ---------- Порівняння ---------- */
  function renderCompare() {
    const box = $('#cmpBox');
    if (!compare.length) {
      box.innerHTML = `<div class="state"><strong>Порівняння порожнє</strong><span>Додайте 2–4 сайти кнопкою «Порівняти» в каталозі або в новинках.</span><a class="btn btn--primary" href="#/catalog">До каталогу</a></div>`;
      return;
    }
    const maxDr = Math.max(...compare.map((r) => r.dr ?? -1));
    const multi = compare.length > 1;
    const th = compare.map((r) => `
      <th scope="col">
        <div class="cmp-head">
          ${tile(r.domain, 'tile--lg')}
          <a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${esc(r.domain)}</a>
          <button type="button" class="btn btn--quiet btn--sm" data-rm="${esc(r.domain)}">${icon('close')}Прибрати</button>
        </div>
      </th>`).join('');
    const row = (label, fn) => `<tr><th scope="row">${label}</th>${compare.map((r) => `<td>${fn(r)}</td>`).join('')}</tr>`;
    const drCell = (r) => {
      if (r.dr == null) return '—';
      const best = multi && r.dr === maxDr;
      return `<div class="dr-bar ${best ? 'best' : ''}"><b>${esc(r.dr)}${best ? '<span class="best-tag">Найвищий</span>' : ''}</b><div class="bar"><i style="--w:${Math.min(100, r.dr)}%"></i></div></div>`;
    };
    const nicheCell = (r) => nichesOf(r).length ? `<div class="chips-row">${nichesOf(r).map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : '—';
    const cards = compare.map((r) => `
      <article class="cmp-card">
        <header class="cmp-card__head">
          ${tile(r.domain, 'tile--lg')}
          <div class="cmp-card__id">
            <a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${esc(r.domain)}</a>
            <span>${esc(r.title || '—')}</span>
          </div>
          <button type="button" class="icon-btn" data-rm="${esc(r.domain)}" aria-label="Прибрати ${esc(r.domain)}">${icon('close')}</button>
        </header>
        <dl class="cmp-card__list">
          <div><dt>Domain Rating</dt><dd>${drCell(r)}</dd></div>
          <div><dt>Ніші</dt><dd>${nicheCell(r)}</dd></div>
          <div><dt>Стек</dt><dd>${esc(String(r.ai_source || '—').replace(/^gen:/, ''))}</dd></div>
          <div><dt>Live з</dt><dd>${esc(fmtDate(r.went_live))}</dd></div>
          <div><dt>Домен</dt><dd>${esc(r.tld ? '.' + r.tld : '—')}</dd></div>
          <div><dt>Сервер</dt><dd>${esc(r.webserver || '—')}</dd></div>
          <div class="cmp-card__sum"><dt>Опис</dt><dd>${esc(r.ai_summary || '—')}</dd></div>
        </dl>
      </article>`).join('');
    box.innerHTML = `
      <div class="cmp-cards">${cards}</div>
      <div class="cmp-wrap">
        <table class="cmp">
          <thead><tr><th></th>${th}</tr></thead>
          <tbody>
            ${row('Назва', (r) => esc(r.title || '—'))}
            ${row('Domain Rating', (r) => {
              if (r.dr == null) return '—';
              const best = multi && r.dr === maxDr;
              return `<div class="dr-bar ${best ? 'best' : ''}"><b>${esc(r.dr)}${best ? '<span class="best-tag">Найвищий</span>' : ''}</b><div class="bar"><i style="--w:${Math.min(100, r.dr)}%"></i></div></div>`;
            })}
            ${row('Ніші', (r) => nichesOf(r).length ? `<div class="chips-row">${nichesOf(r).map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : '—')}
            ${row('Стек', (r) => esc(String(r.ai_source || '—').replace(/^gen:/, '')))}
            ${row('Live з', (r) => esc(fmtDate(r.went_live)))}
            ${row('Домен верхнього рівня', (r) => esc(r.tld ? '.' + r.tld : '—'))}
            ${row('Сервер', (r) => esc(r.webserver || '—'))}
            ${row('Опис', (r) => esc(r.ai_summary || '—'))}
          </tbody>
        </table>
      </div>
      <p class="cmp-actions"><button type="button" class="btn btn--quiet btn--sm" id="cmpClear">Очистити порівняння</button></p>`;
  }

  function wireCompare() {
    $('#cmpBox').addEventListener('click', (e) => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { toggleCompare(rm.dataset.rm); return; }
      if (e.target.closest('#cmpClear')) { compare = []; saveCompare(); syncCompareUI(); }
    });
    $('#trayClear').addEventListener('click', () => { compare = []; saveCompare(); syncCompareUI(); });
  }

  /* ---------- Hero: метрики, «Щойно виявлені», статус у футері ---------- */
  function renderMetrics(items) {
    $('#stats').innerHTML = items.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('');
  }

  function renderLive() {
    const list = $('#liveList');
    const rows = latestBatch.slice(0, 5);
    if (!rows.length) { list.innerHTML = ''; return; }
    $('#liveDate').textContent = fmtDay(latestLive);
    list.innerHTML = rows.map((r, i) => `
      <li><a class="live__row reveal" style="--i:${i}" href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">
        ${tile(r.domain)}
        <div class="live__txt"><div class="live__name">${esc(r.domain)}</div><div class="live__sub">${esc(nichesOf(r)[0] || r.title || '')}</div></div>
        <span class="live__go">${icon('out')}</span>
      </a></li>`).join('');
  }

  function renderFooterStatus(latest) {
    const dot = $('#footStatus .dot');
    const text = $('#footStatusText');
    if (!latest) {
      text.textContent = 'Статус даних недоступний';
      return;
    }
    const stale = diffDays(todayIso(), latest) > 2;
    dot.className = `dot ${stale ? 'dot--stale' : ''}`;
    text.textContent = stale ? `Найсвіжіші дані в індексі від ${fmtDate(latest)}` : `Дані оновлено ${fmtDate(latest)}`;
  }

  async function loadHero() {
    renderMetrics([['AI-стартапів в індексі', '…'], ['Найсвіжіші дані', '…'], ['Нових сайтів за 7 днів', '…']]);
    $('#liveList').innerHTML = Array.from({ length: 4 }, () => '<li><div class="live__skel skeleton"></div></li>').join('');
    const [stats, latest] = await Promise.allSettled([api({ stats: 1 }), getLatestLive()]);
    const s = stats.status === 'fulfilled' ? stats.value : null;
    const l = latest.status === 'fulfilled' ? latest.value : null;
    renderMetrics([
      ['AI-стартапів в індексі', s && s.ai_startups ? fmtNum(s.ai_startups.total) : '—'],
      ['Найсвіжіші дані', l ? fmtDay(l) : '—'],
      ['Нових сайтів за 7 днів', s && s.new ? fmtNum(s.new.last_7d) : '—']
    ]);
    if (l) renderLive();
    else $('#liveList').innerHTML = `<li><div class="live__row"><span></span><div class="live__sub">${esc(mode === 'direct' ? 'Немає доступу до API (CORS), див. README' : 'Список тимчасово недоступний')}</div></div></li>`;
    renderFooterStatus(l);
    syncCompareUI();
  }

  /* ---------- Спільні події ---------- */
  function wireGlobal() {
    document.addEventListener('click', (e) => {
      const cmp = e.target.closest('[data-cmp]');
      if (cmp) { toggleCompare(cmp.dataset.cmp); return; }
      const more = e.target.closest('[data-more]');
      if (more) {
        const sum = more.previousElementSibling;
        const open = sum.classList.toggle('is-open');
        more.textContent = open ? 'Згорнути' : 'Показати більше';
        return;
      }
      if (e.target.closest('[data-retry]') && retryFn) retryFn();
    });

    // М’яка підсвітка картки за курсором
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest && e.target.closest('.card');
      if (!card || e.pointerType === 'touch') return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });

    // «/» — швидкий перехід до пошуку
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      e.preventDefault();
      if (currentView !== 'catalog') go('catalog');
      $('#fQ').focus();
    });

    // Повернулись до вкладки після тривалої перерви: скидаємо кеш і перезавантажуємо дані
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > REFRESH_AFTER) {
        cache.clear();
        latestLive = null;
        loadHero();
        route();
      }
      hiddenAt = 0;
    });

    window.addEventListener('hashchange', route);
  }

  /* ---------- Старт ---------- */
  wireNavbar();
  wireCatalog();
  wireNews();
  wireCompare();
  wireGlobal();
  syncCompareUI();
  loadHero();
  route();
})();
