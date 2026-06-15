import { useState, useEffect } from 'react';
import { Millennium, IconsModule, definePlugin, callable, DialogButton, Dropdown, Field, Focusable, appDetailsClasses } from '@steambrew/client';
import type { MilleniumWindowContext } from './types/millennium';
import { ApiResponse } from '../shared/types';
import { fmt, escapeHtml, ICONS, SYMBOLS } from '../shared/utils';

const fetchPrices = callable<[{ steam_app_id: string }], string>('fetch_prices');
const getApiKey = callable<[], string>('get_api_key');
const saveApiKey = callable<[{ api_key: string }], string>('save_api_key');
const getRegion = callable<[], string>('get_region');
const saveRegion = callable<[{ region: string }], string>('save_region');
const getPosition = callable<[], string>('get_position');
const savePosition = callable<[{ position: string }], string>('save_position');
const getAlert = callable<[{ app_id: string }], string>('get_alert');
const saveAlert = callable<[{ app_id: string; target: number; title: string }], string>('save_alert');
const removeAlert = callable<[{ app_id: string }], string>('remove_alert');
const checkAlerts = callable<[], string>('check_alerts');

let curAppId: number | null = null;
let observer: MutationObserver | null = null;
let fetching: number | null = null;
let hasKey: boolean | null = null;

let curTitle = '';
let curCurrency = 'EUR';
let lastBest: number | null = null;
let mainDoc: Document | null = null;

const ALERT_CHECK_INTERVAL = 6 * 60 * 60 * 1000;
const ALERT_CHECK_DELAY = 30 * 1000;

interface TriggeredAlert {
  app_id: string; title: string; price: number; currency: string;
  target: number; type: string; is_low: boolean; url: string;
}

const POSITIONS = ['tl', 'top', 'tr', 'bl', 'bottom', 'br'] as const;
type Position = typeof POSITIONS[number];
let position: Position = 'bottom';

async function loadPosition() {
  try {
    const r = JSON.parse(await getPosition());
    if (POSITIONS.includes(r.position)) position = r.position;
  } catch {}
}

const ID = 'niceprice-widget';
const CONTAINER = `.${appDetailsClasses.Header}`;
const GG_URL = 'https://gg.deals/api/';

const REGIONS = ['eu', 'us', 'gb', 'fr', 'de', 'pl', 'br', 'ca', 'au', 'ch', 'dk', 'no', 'se', 'be', 'es', 'fi', 'ie', 'it', 'nl'];

const openExt = (url: string) => window.open(`steam://openurl_external/${url}`);

function readColors(doc: Document) {
  const c = { bg: 'rgba(14,20,27,0.85)', text: '#fff', dim: 'rgba(255,255,255,0.6)', accent: '#1a9fff', border: 'rgba(255,255,255,0.1)' };
  try {
    const s = doc.defaultView?.getComputedStyle(doc.body);
    if (!s) return c;
    const bg = s.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      const m = bg.match(/(\d+),\s*(\d+),\s*(\d+)/);
      if (m) c.bg = `rgba(${m[1]},${m[2]},${m[3]},0.88)`;
    }
    const fg = s.color;
    if (fg && fg !== 'rgba(0, 0, 0, 0)') {
      c.text = fg;
      const m = fg.match(/(\d+),\s*(\d+),\s*(\d+)/);
      if (m) { c.dim = `rgba(${m[1]},${m[2]},${m[3]},0.6)`; c.border = `rgba(${m[1]},${m[2]},${m[3]},0.12)`; }
    }
    const a = doc.querySelector('a[href],button') as HTMLElement;
    if (a) { const ls = doc.defaultView?.getComputedStyle(a); if (ls && ls.color !== c.text) c.accent = ls.color; }
  } catch (e) { console.error('NicePrice: readColors failed', e); }
  return c;
}

const CSS = `
#${ID} { position:absolute; z-index:99; pointer-events:auto; }
#${ID}[data-pos="bottom"] { left:0; right:0; bottom:0; }
#${ID}[data-pos="top"] { left:0; right:0; top:0; }
#${ID}[data-pos="tl"] { top:12px; left:12px; max-width:calc(100% - 24px); }
#${ID}[data-pos="tr"] { top:12px; right:12px; max-width:calc(100% - 24px); }
#${ID}[data-pos="bl"] { bottom:12px; left:12px; max-width:calc(100% - 24px); }
#${ID}[data-pos="br"] { bottom:12px; right:12px; max-width:calc(100% - 24px); }
.np-bar { background:var(--np-bg); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); display:flex; align-items:center; }
/* compact corner card */
#${ID}[data-pos="tl"] .np-bar, #${ID}[data-pos="tr"] .np-bar, #${ID}[data-pos="bl"] .np-bar, #${ID}[data-pos="br"] .np-bar { border-radius:12px; overflow:hidden; border:1px solid var(--np-border); box-shadow:0 10px 34px rgba(0,0,0,.5); }
#${ID}[data-pos="tl"] .np-label, #${ID}[data-pos="tr"] .np-label, #${ID}[data-pos="bl"] .np-label, #${ID}[data-pos="br"] .np-label { display:none; }
/* move handle + position picker */
.np-ctrl { position:relative; display:flex; align-self:stretch; flex-shrink:0; }
.np-grip { display:flex; align-items:center; justify-content:center; width:30px; align-self:stretch; padding:0; background:transparent; border:none; border-right:1px solid var(--np-border); color:var(--np-dim); cursor:pointer; transition:color .15s, background .15s; }
.np-grip:hover { color:var(--np-text); background:rgba(128,128,128,.15); }
.np-picker { position:fixed; z-index:99999; padding:7px; border-radius:10px; background:var(--np-bg); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid var(--np-border); box-shadow:0 10px 34px rgba(0,0,0,.55); }
.np-picker[hidden] { display:none; }
.np-picker-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; }
.np-pos { display:flex; align-items:center; justify-content:center; width:30px; height:26px; padding:0; border-radius:6px; background:rgba(128,128,128,.12); border:1px solid transparent; color:var(--np-dim); cursor:pointer; transition:background .15s, color .15s, border-color .15s; }
.np-pos:hover { background:rgba(128,128,128,.28); color:var(--np-text); }
.np-pos.active { border-color:var(--np-accent); color:var(--np-accent); background:rgba(128,128,128,.16); }
.np-pos svg { display:block; }
.np-pos[data-pos="tl"] svg { transform:rotate(-45deg); }
.np-pos[data-pos="tr"] svg { transform:rotate(45deg); }
.np-pos[data-pos="br"] svg { transform:rotate(135deg); }
.np-pos[data-pos="bottom"] svg { transform:rotate(180deg); }
.np-pos[data-pos="bl"] svg { transform:rotate(-135deg); }
.np-label { flex-shrink:0; padding:8px 14px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--np-dim); border-right:1px solid var(--np-border); }
.np-deals { display:flex; align-items:stretch; flex:1; overflow-x:auto; scrollbar-width:none; }
.np-deals::-webkit-scrollbar { display:none; }
.np-deal { display:flex; align-items:center; gap:8px; padding:6px 16px; color:var(--np-text); border-right:1px solid var(--np-border); transition:background .15s; cursor:pointer; flex-shrink:0; }
.np-deal:hover { background:rgba(128,128,128,.15); }
.np-deal-icon { display:flex; align-items:center; }
.np-deal-info { display:flex; flex-direction:column; }
.np-deal-store { font-size:9px; color:var(--np-dim); text-transform:uppercase; letter-spacing:.5px; white-space:nowrap; }
.np-deal-price { font-size:16px; font-weight:700; color:var(--np-text); white-space:nowrap; }
.np-retail .np-deal-price { color:#beee11; }
.np-keyshop .np-deal-price { color:#f5a623; }
.np-hist { padding:6px 16px; display:flex; align-items:center; gap:8px; flex-shrink:0; border-right:1px solid var(--np-border); }
.np-hist-label { font-size:9px; color:var(--np-dim); opacity:.6; text-transform:uppercase; letter-spacing:.5px; }
.np-hist-value { font-size:11px; font-weight:600; color:var(--np-dim); white-space:nowrap; }
.np-msg { padding:8px 14px; color:var(--np-dim); font-size:11px; }
.np-link { flex-shrink:0; padding:8px 14px; font-size:10px; color:var(--np-accent); text-transform:uppercase; letter-spacing:.5px; font-weight:600; transition:color .15s; white-space:nowrap; margin-left:auto; cursor:pointer; }
.np-link:hover { color:var(--np-text); }
.np-setup { display:flex; align-items:center; gap:10px; padding:8px 14px; flex:1; }
.np-setup-text { font-size:11px; color:var(--np-dim); }
.np-setup-link { font-size:11px; color:var(--np-accent); cursor:pointer; text-decoration:underline; font-weight:600; }
.np-setup-link:hover { color:var(--np-text); }
/* price-alert bell */
.np-bell { display:flex; align-items:center; justify-content:center; width:30px; align-self:stretch; padding:0; background:transparent; border:none; border-right:1px solid var(--np-border); color:var(--np-dim); cursor:pointer; transition:color .15s, background .15s; }
.np-bell:hover { color:var(--np-text); background:rgba(128,128,128,.15); }
.np-bell.active { color:#67c1f5; }
.np-bell.active svg { fill:#67c1f5; }
/* alert popover */
.np-alert { position:fixed; z-index:99999; width:236px; padding:12px; border-radius:10px; background:var(--np-bg); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid var(--np-border); box-shadow:0 10px 34px rgba(0,0,0,.55); color:var(--np-text); }
.np-alert[hidden] { display:none; }
.np-alert-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:var(--np-accent); margin-bottom:4px; }
.np-alert-game { font-size:12px; color:var(--np-dim); margin-bottom:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.np-alert-row { display:flex; align-items:center; gap:6px; margin-bottom:10px; }
.np-alert-row .lbl { font-size:11px; color:var(--np-dim); white-space:nowrap; }
.np-alert-input { flex:1; min-width:0; padding:6px 8px; font-size:13px; background:rgba(0,0,0,.25); border:1px solid var(--np-border); border-radius:4px; color:var(--np-text); outline:none; }
.np-alert-cur { font-size:13px; color:var(--np-dim); }
.np-alert-actions { display:flex; gap:6px; }
.np-alert-save, .np-alert-remove { flex:1; padding:7px; font-size:11px; font-weight:600; border-radius:4px; cursor:pointer; border:1px solid var(--np-border); background:rgba(128,128,128,.15); color:var(--np-text); transition:all .15s; }
.np-alert-save { background:var(--np-accent); border-color:var(--np-accent); color:#fff; }
.np-alert-save:hover { filter:brightness(1.12); }
.np-alert-remove:hover { background:rgba(240,74,74,.2); color:#f04a4a; border-color:rgba(240,74,74,.4); }
.np-alert-status { font-size:11px; margin-top:8px; color:var(--np-dim); }
/* toasts */
#niceprice-toasts { position:fixed; right:16px; bottom:16px; z-index:100000; display:flex; flex-direction:column; gap:8px; pointer-events:none; }
.np-toast { pointer-events:auto; display:flex; align-items:center; gap:10px; width:300px; padding:12px 14px; border-radius:10px; background:var(--np-bg, rgba(14,20,27,.96)); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid var(--np-border, rgba(255,255,255,.12)); box-shadow:0 12px 40px rgba(0,0,0,.6); color:var(--np-text, #fff); cursor:pointer; transform:translateX(120%); opacity:0; transition:transform .3s ease, opacity .3s ease; }
.np-toast.np-toast-in { transform:translateX(0); opacity:1; }
.np-toast:hover { filter:brightness(1.08); }
.np-toast-icon { color:#67c1f5; display:flex; flex-shrink:0; }
.np-toast-title { font-size:13px; font-weight:700; margin-bottom:2px; }
.np-toast-price { color:#67c1f5; }
.np-toast-sub { font-size:11px; color:var(--np-dim, rgba(255,255,255,.6)); display:flex; align-items:center; gap:6px; }
.np-toast-low { color:#beee11; font-weight:600; }
`;

function detectAppId(): number | null {
  try {
    const p = window.MainWindowBrowserManager?.m_lastLocation?.pathname;
    if (p) { const m = p.match(/\/app\/(\d+)/); if (m) return parseInt(m[1], 10); }
  } catch {}
  return null;
}

function wireClicks(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>('[data-url]').forEach(d =>
    d.addEventListener('click', () => d.dataset.url && openExt(d.dataset.url))
  );
}

const POS_TITLES: Record<Position, string> = {
  tl: 'Top left', top: 'Top', tr: 'Top right', bl: 'Bottom left', bottom: 'Bottom', br: 'Bottom right',
};

const PICKER_ID = 'niceprice-picker';
const ALERT_ID = 'niceprice-alert';
const TOAST_HOST_ID = 'niceprice-toasts';
const COLOR_VARS = ['--np-bg', '--np-text', '--np-dim', '--np-accent', '--np-border'];

function controlsHtml() {
  return `<div class="np-ctrl"><button class="np-grip" title="Move NicePrice">${ICONS.move}</button><button class="np-bell" title="Price alert">${ICONS.bell}</button></div>`;
}

function placePopover(pop: HTMLElement, anchor: HTMLElement, doc: Document) {
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  const vw = doc.defaultView?.innerWidth ?? pw;
  const vh = doc.defaultView?.innerHeight ?? ph;
  let top = r.bottom + 8;
  if (top + ph > vh - 8) top = r.top - 8 - ph;
  top = Math.max(8, Math.min(top, vh - ph - 8));
  const left = Math.max(8, Math.min(r.left, vw - pw - 8));
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}

function autoClose(pop: HTMLElement, anchor: HTMLElement, doc: Document) {
  const close = (ev: Event) => {
    const t = ev.target as Node;
    if (!pop.contains(t) && !anchor.contains(t)) { pop.hidden = true; doc.removeEventListener('mousedown', close); }
  };
  doc.addEventListener('mousedown', close);
}

function applyPos(el: HTMLElement, doc: Document) {
  el.dataset.pos = position;
  const picker = doc.getElementById(PICKER_ID);
  picker?.querySelectorAll<HTMLElement>('.np-pos').forEach(b => b.classList.toggle('active', b.dataset.pos === position));
}

function buildPicker(el: HTMLElement, doc: Document): HTMLElement {
  doc.getElementById(PICKER_ID)?.remove();
  const cells = POSITIONS.map(p => `<button class="np-pos" data-pos="${p}" title="${POS_TITLES[p]}">${ICONS.arrow}</button>`).join('');
  const picker = doc.createElement('div');
  picker.id = PICKER_ID;
  picker.className = 'np-picker';
  picker.hidden = true;
  picker.innerHTML = `<div class="np-picker-grid">${cells}</div>`;
  COLOR_VARS.forEach(v => picker.style.setProperty(v, el.style.getPropertyValue(v)));
  doc.body.appendChild(picker);
  return picker;
}

function wirePosition(el: HTMLElement, doc: Document) {
  const grip = el.querySelector<HTMLElement>('.np-grip');
  if (!grip) return;
  const picker = buildPicker(el, doc);

  grip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!picker.hidden) { picker.hidden = true; return; }
    picker.hidden = false;
    placePopover(picker, grip, doc);
    autoClose(picker, grip, doc);
  });

  picker.querySelectorAll<HTMLElement>('.np-pos').forEach(b =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = b.dataset.pos as Position | undefined;
      if (!p || !POSITIONS.includes(p)) return;
      position = p;
      applyPos(el, doc);
      picker.hidden = true;
      savePosition({ position: p }).catch(() => {});
    })
  );
}

function curSymbol() {
  return SYMBOLS[curCurrency] || curCurrency || '';
}

function buildAlert(el: HTMLElement, doc: Document, existing: number | null): HTMLElement {
  doc.getElementById(ALERT_ID)?.remove();
  const prefill = existing ?? lastBest;
  const value = prefill != null ? String(prefill.toFixed(2)) : '';
  const pop = doc.createElement('div');
  pop.id = ALERT_ID;
  pop.className = 'np-alert';
  pop.hidden = true;
  pop.innerHTML =
    `<div class="np-alert-title">Price alert</div>` +
    `<div class="np-alert-game">${escapeHtml(curTitle || 'This game')}</div>` +
    `<div class="np-alert-row"><span class="lbl">Notify below</span><input class="np-alert-input" type="text" inputmode="decimal" value="${value}" placeholder="0.00" /><span class="np-alert-cur">${escapeHtml(curSymbol())}</span></div>` +
    `<div class="np-alert-actions"><button class="np-alert-save">${existing != null ? 'Update' : 'Set alert'}</button>${existing != null ? '<button class="np-alert-remove">Remove</button>' : ''}</div>` +
    `<div class="np-alert-status"></div>`;
  COLOR_VARS.forEach(v => pop.style.setProperty(v, el.style.getPropertyValue(v)));
  doc.body.appendChild(pop);
  return pop;
}

function setBellState(el: HTMLElement, active: boolean) {
  el.querySelector<HTMLElement>('.np-bell')?.classList.toggle('active', active);
}

function wireAlert(el: HTMLElement, doc: Document) {
  const bell = el.querySelector<HTMLElement>('.np-bell');
  if (!bell) return;

  if (curAppId != null) {
    getAlert({ app_id: String(curAppId) })
      .then(raw => { const r = JSON.parse(raw); setBellState(el, !!r.has); })
      .catch(() => {});
  }

  bell.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (curAppId == null) return;
    const open = doc.getElementById(ALERT_ID);
    if (open && !open.hidden) { open.hidden = true; return; }

    let existing: number | null = null;
    try { const r = JSON.parse(await getAlert({ app_id: String(curAppId) })); if (r.has) existing = Number(r.target); } catch {}

    const appIdAtOpen = curAppId;
    const pop = buildAlert(el, doc, existing);
    const input = pop.querySelector<HTMLInputElement>('.np-alert-input');
    const status = pop.querySelector<HTMLElement>('.np-alert-status');
    const saveBtn = pop.querySelector<HTMLButtonElement>('.np-alert-save');
    const removeBtn = pop.querySelector<HTMLButtonElement>('.np-alert-remove');

    saveBtn?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const target = parseFloat((input?.value || '').replace(',', '.'));
      if (isNaN(target) || target < 0) { if (status) status.textContent = '✗ Enter a valid price'; return; }
      try {
        const r = JSON.parse(await saveAlert({ app_id: String(appIdAtOpen), target, title: curTitle }));
        if (r.success) {
          setBellState(el, true);
          if (status) status.textContent = `✓ Alert set below ${fmt(String(target), curCurrency)}`;
          setTimeout(() => { pop.hidden = true; }, 1200);
          runAlertCheck();
        } else if (status) status.textContent = '✗ Could not save';
      } catch { if (status) status.textContent = '✗ Error'; }
    });

    removeBtn?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      try { await removeAlert({ app_id: String(appIdAtOpen) }); } catch {}
      setBellState(el, false);
      pop.hidden = true;
    });

    pop.hidden = false;
    placePopover(pop, bell, doc);
    autoClose(pop, bell, doc);
    input?.focus();
  });
}

function renderBar(el: HTMLElement, doc: Document, inner: string) {
  el.innerHTML = `<div class="np-bar">${controlsHtml()}${inner}</div>`;
  wirePosition(el, doc);
  wireAlert(el, doc);
  applyPos(el, doc);
  wireClicks(el);
}

function showToast(doc: Document, item: TriggeredAlert) {
  let host = doc.getElementById(TOAST_HOST_ID);
  if (!host) { host = doc.createElement('div'); host.id = TOAST_HOST_ID; doc.body.appendChild(host); }
  const t = doc.createElement('div');
  t.className = 'np-toast';
  const colors = readColors(doc);
  t.style.setProperty('--np-bg', colors.bg);
  t.style.setProperty('--np-text', colors.text);
  t.style.setProperty('--np-dim', colors.dim);
  t.style.setProperty('--np-border', colors.border);
  const price = fmt(String(item.price), item.currency);
  const target = fmt(String(item.target), item.currency);
  const low = item.is_low ? '<span class="np-toast-low">Lowest ever</span>' : '';
  t.innerHTML =
    `<div class="np-toast-icon">${ICONS.bell}</div>` +
    `<div class="np-toast-body"><div class="np-toast-title">${escapeHtml(item.title)} <span class="np-toast-price">${price}</span></div>` +
    `<div class="np-toast-sub">Below your ${target} target ${low}</div></div>`;
  t.addEventListener('click', () => openExt(item.url));
  host.appendChild(t);
  setTimeout(() => t.classList.add('np-toast-in'), 20);
  setTimeout(() => { t.classList.remove('np-toast-in'); setTimeout(() => t.remove(), 320); }, 10000);
}

async function runAlertCheck() {
  const doc = mainDoc;
  if (!doc?.body) return;
  try {
    const r = JSON.parse(await checkAlerts());
    if (r.success && Array.isArray(r.triggered)) {
      (r.triggered as TriggeredAlert[]).forEach((it, i) => setTimeout(() => showToast(doc, it), i * 400));
    }
  } catch (e) {
    console.error('NicePrice: alert check failed', e);
  }
}

const labelHtml = '<span class="np-label">Prices</span>';
const msgInner = (t: string) => `${labelHtml}<span class="np-msg">${t}</span>`;
const setupInner = (prefix: string) =>
  `${labelHtml}<div class="np-setup"><span class="np-setup-text">${prefix}</span><span class="np-setup-link" data-url="${escapeHtml(GG_URL)}">Get your free key on GG.deals</span><span class="np-setup-text">then add it in NicePrice settings</span></div>`;

async function checkKey(): Promise<boolean> {
  try { const r = JSON.parse(await getApiKey()); hasKey = (r.api_key || '').length > 0; } catch { hasKey = false; }
  return hasKey ?? false;
}

async function waitContainer(doc: Document): Promise<HTMLElement | null> {
  try {
    const nodes = await Millennium.findElement(doc, CONTAINER, 3000);
    return (nodes?.[0] as HTMLElement) || null;
  } catch {
    return null;
  }
}

async function inject(doc: Document, appId: number) {
  if (curAppId === appId && doc.getElementById(ID)) return;
  if (fetching === appId) return;

  doc.getElementById(ID)?.remove();
  fetching = appId;

  const container = await waitContainer(doc);
  if (!container || detectAppId() !== appId) { fetching = null; return; }

  curAppId = appId;
  container.style.position = 'relative';

  const w = doc.createElement('div');
  w.id = ID;
  const colors = readColors(doc);
  w.style.setProperty('--np-bg', colors.bg);
  w.style.setProperty('--np-text', colors.text);
  w.style.setProperty('--np-dim', colors.dim);
  w.style.setProperty('--np-accent', colors.accent);
  w.style.setProperty('--np-border', colors.border);

  container.appendChild(w);

  if (hasKey === false) {
    renderBar(w, doc, setupInner('API key required'));
    fetching = null;
    return;
  }

  renderBar(w, doc, msgInner('Loading...'));

  try {
    const resp: ApiResponse = JSON.parse(await fetchPrices({ steam_app_id: String(appId) }));
    if (curAppId !== appId) { fetching = null; return; }
    const el = doc.getElementById(ID);
    if (!el) { fetching = null; return; }

    if (!resp.success) {
      if (resp.error === 'no_api_key' || resp.error === 'invalid_api_key') {
        hasKey = false;
        renderBar(el, doc, setupInner(resp.error === 'no_api_key' ? 'API key required' : 'Invalid API key'));
      } else {
        renderBar(el, doc, msgInner(resp.error === 'rate_limited' ? 'Rate limited, try later' : 'Could not load prices'));
      }
      fetching = null; return;
    }

    const game = resp.data?.[String(appId)];
    if (!game?.prices) {
      renderBar(el, doc, msgInner('No price data'));
      fetching = null; return;
    }

    const { prices: p } = game;
    const cur = p.currency || 'EUR';
    const safeUrl = escapeHtml(game.url || `https://gg.deals/steam-app/${appId}/`);

    curTitle = game.title || curTitle;
    curCurrency = cur;
    const nums = [parseFloat(p.currentRetail || ''), parseFloat(p.currentKeyshops || '')].filter(n => !isNaN(n));
    lastBest = nums.length ? Math.min(...nums) : null;

    let html = '';

    const retail = fmt(p.currentRetail, cur);
    if (retail) html += `<div class="np-deal np-retail" data-url="${safeUrl}"><span class="np-deal-icon">${ICONS.retail}</span><div class="np-deal-info"><span class="np-deal-store">Best Retail</span><span class="np-deal-price">${retail}</span></div></div>`;

    const keyshop = fmt(p.currentKeyshops, cur);
    if (keyshop) html += `<div class="np-deal np-keyshop" data-url="${safeUrl}"><span class="np-deal-icon">${ICONS.key}</span><div class="np-deal-info"><span class="np-deal-store">Best Keyshop</span><span class="np-deal-price">${keyshop}</span></div></div>`;

    const hist = [fmt(p.historicalRetail, cur), fmt(p.historicalKeyshops, cur)].filter(Boolean);
    if (hist.length) html += `<div class="np-hist"><span class="np-deal-icon">${ICONS.clock}</span><span class="np-hist-label">Low</span><span class="np-hist-value">${hist.join(' / ')}</span></div>`;

    if (!html) {
      renderBar(el, doc, msgInner('No deals available'));
    } else {
      renderBar(el, doc, `${labelHtml}<div class="np-deals">${html}</div><span class="np-link" data-url="${safeUrl}">GG.deals →</span>`);
    }
  } catch (e) {
    console.error('NicePrice: inject failed', e);
    const el = doc.getElementById(ID);
    if (el) renderBar(el, doc, msgInner('Failed to load'));
  }
  fetching = null;
}

function handlePage(doc: Document) {
  const id = detectAppId();
  if (id && (id !== curAppId || !doc.getElementById(ID))) inject(doc, id);
  else if (!id && curAppId) { doc.getElementById(ID)?.remove(); doc.getElementById(PICKER_ID)?.remove(); curAppId = null; }
}

function setup(doc: Document) {
  if (observer) { observer.disconnect(); observer = null; }
  curAppId = null; fetching = null;
  mainDoc = doc;

  if (!doc.getElementById('np-styles')) {
    const s = doc.createElement('style'); s.id = 'np-styles'; s.textContent = CSS;
    doc.head.appendChild(s);
  }

  handlePage(doc);
  observer = new MutationObserver(() => handlePage(doc));
  if (doc.body) observer.observe(doc.body, { childList: true, subtree: true });
}

function Settings() {
  const [key, setKey] = useState('');
  const [region, setRegion] = useState('eu');
  const [status, setStatus] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      getApiKey().then((raw: string) => {
        try { const r = JSON.parse(raw); if (r.api_key) setKey(r.api_key); } catch {}
      }),
      getRegion().then((raw: string) => {
        try { const r = JSON.parse(raw); if (r.region) setRegion(r.region); } catch {}
      }),
    ]).finally(() => setLoaded(true));
  }, []);

  const save = async () => {
    setStatus('Saving...');
    try {
      const r = JSON.parse(await saveApiKey({ api_key: key.trim() }));
      await saveRegion({ region });
      hasKey = key.trim().length > 0;
      curAppId = null;
      setStatus(r.success ? (key.trim() ? '✓ Saved' : '✓ Removed') : '✗ Failed');
    } catch { setStatus('✗ Error'); }
    setTimeout(() => setStatus(''), 3000);
  };

  const mask = (k: string) => k.length <= 8 ? k : k.slice(0, 4) + '•'.repeat(k.length - 8) + k.slice(-4);

  const btnStyle = {
    padding: '8px 16px', fontSize: 12, fontWeight: 600,
    borderRadius: 2, cursor: 'pointer',
    width: 'auto', minWidth: 0,
  };

  if (!loaded) return <div style={{ padding: 16, color: '#c6d4df' }}>Loading...</div>;

  return (
    <div style={{ padding: 16 }}>
      <Field label="GG.deals API Key" description={key ? `Current: ${mask(key)}` : 'No key configured'} bottomSeparator="standard" childrenLayout="below">
        <input
          type="password"
          value={key}
          onChange={(e: { target: { value: string } }) => setKey(e.target.value)}
          style={{ width: '100%', padding: '8px 10px', fontSize: 13, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(128,128,128,0.3)', borderRadius: 2, color: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
        />
      </Field>

      <Field label="Region" description="Determines the currency for prices" bottomSeparator="standard" childrenLayout="below">
        <Dropdown
          rgOptions={REGIONS.map(r => ({ data: r, label: r.toUpperCase() }))}
          selectedOption={region}
          onChange={(opt) => setRegion(opt.data)}
        />
      </Field>

      <Focusable style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 12 }}>
        <DialogButton onClick={save} style={btnStyle}>Save</DialogButton>
        <DialogButton onClick={() => openExt(GG_URL)} style={btnStyle}>Get a free key</DialogButton>
      </Focusable>

      {status && (
        <div style={{
          fontSize: 12, marginBottom: 12, padding: '6px 10px', borderRadius: 2,
          background: status[0] === '✓' ? 'rgba(36,166,90,0.15)' : 'rgba(240,74,74,0.15)',
          color: status[0] === '✓' ? '#24a65a' : '#f04a4a',
        }}>
          {status}
        </div>
      )}

      <Field label="How to get your key:" bottomSeparator="none" childrenLayout="below">
        <div style={{ fontSize: 11, color: '#8f98a0', lineHeight: 1.5 }}>
          <div>1. Click "Get a free key" above</div>
          <div>2. Create a GG.deals account (free)</div>
          <div>3. Confirm your email</div>
          <div>4. Copy your API key and paste it here</div>
        </div>
      </Field>
    </div>
  );
}

export default definePlugin(() => {
  checkKey();
  loadPosition();
  Millennium.AddWindowCreateHook?.((ctx: MilleniumWindowContext) => {
    if (!ctx?.m_strName?.startsWith('SP ')) return;
    const doc = ctx.m_popup?.document;
    if (!doc?.body) return;
    setup(doc);
  });
  setTimeout(runAlertCheck, ALERT_CHECK_DELAY);
  setInterval(runAlertCheck, ALERT_CHECK_INTERVAL);
  return {
    title: 'NicePrice',
    icon: <IconsModule.Settings />,
    content: <Settings />,
  };
});
