import { callable } from '@steambrew/webkit';
import { ApiResponse } from '../shared/types';
import { fmt, escapeHtml, ICONS } from '../shared/utils';

const fetchPrices = callable<[{ steam_app_id: string }], string>('fetch_prices');

const ID = 'niceprice-store';
const STYLES_ID = 'niceprice-store-css';
const SIDEBAR_SEL = 'div.rightcol.game_meta_data';

function ensureStyles() {
  if (document.getElementById(STYLES_ID)) return;
  const el = document.createElement('style');
  el.id = STYLES_ID;
  el.textContent = `
#${ID} { background:rgba(0,0,0,.2); margin-bottom:12px; border-radius:2px; overflow:hidden; }
.nps-hdr { display:flex; align-items:center; gap:6px; padding:8px 14px; background:rgba(102,192,244,.06); border-bottom:1px solid rgba(255,255,255,.06); }
.nps-title { color:#67c1f5; font-size:10px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; }
.nps-badge { margin-left:auto; font-size:9px; color:#556772; }
.nps-body { padding:10px 14px; }
.nps-rows { display:flex; flex-direction:column; gap:8px; }
.nps-row { display:flex; align-items:center; gap:8px; }
.nps-row-icon { display:flex; align-items:center; flex-shrink:0; }
.nps-row-label { font-size:11px; color:#8f98a0; flex:1; }
.nps-val { font-weight:700; white-space:nowrap; }
.nps-val.retail { color:#beee11; font-size:14px; }
.nps-val.keyshop { color:#f5a623; font-size:14px; }
.nps-val.hist { color:#8f98a0; font-size:11px; font-weight:600; }
.nps-na { font-size:11px; color:#556b7e; font-style:italic; }
.nps-div { height:1px; background:rgba(255,255,255,.06); margin:2px 0; }
.nps-ftr { padding:8px 14px; border-top:1px solid rgba(255,255,255,.04); background:rgba(0,0,0,.1); }
.nps-ftr a { color:#67c1f5; font-size:11px; text-decoration:none; }
.nps-ftr a:hover { color:#fff; }
.nps-msg { padding:10px 14px; color:#556b7e; font-size:12px; }
.nps-msg a { color:#67c1f5; }
`;
  document.head.appendChild(el);
}

function header(withBadge = true) {
  return `<div class="nps-hdr">${ICONS.tag}<span class="nps-title">NicePrice</span>${withBadge ? '<span class="nps-badge">GG.deals</span>' : ''}</div>`;
}

function findRef(sidebar: Element) {
  return sidebar.querySelector('[id*="steamdb"],[class*="steamdb"]') || sidebar.firstChild;
}

function priceRow(icon: string, label: string, value: string, cls: string) {
  if (value) return `<div class="nps-row"><span class="nps-row-icon">${icon}</span><span class="nps-row-label">${label}</span><span class="nps-val ${cls}">${value}</span></div>`;
  return `<div class="nps-row"><span class="nps-row-icon">${icon}</span><span class="nps-row-label">${label}</span><span class="nps-na">N/A</span></div>`;
}

async function inject(appId: number) {
  ensureStyles();
  const sidebar = document.querySelector(SIDEBAR_SEL);
  if (!sidebar) return;

  document.getElementById(ID)?.remove();
  const ph = document.createElement('div');
  ph.id = ID;
  ph.innerHTML = `${header()}<div class="nps-msg">Loading...</div>`;
  sidebar.insertBefore(ph, findRef(sidebar));

  try {
    const resp: ApiResponse = JSON.parse(await fetchPrices({ steam_app_id: String(appId) }));

    if (!resp.success) {
      const el = document.getElementById(ID);
      if (!el) return;
      if (resp.error === 'no_api_key' || resp.error === 'invalid_api_key') {
        const msg = resp.error === 'no_api_key' ? 'API key required' : 'Invalid API key';
        el.innerHTML = `${header(false)}<div class="nps-msg">${msg} — <a href="https://gg.deals/api/" target="_blank">Get a free key</a></div>`;
      } else {
        const msgEl = el.querySelector('.nps-msg');
        if (msgEl) msgEl.textContent = resp.error === 'rate_limited' ? 'Rate limited' : 'Could not load';
      }
      return;
    }

    const game = resp.data?.[String(appId)];
    if (!game?.prices) {
      const el = document.getElementById(ID);
      if (el) {
        const msgEl = el.querySelector('.nps-msg');
        if (msgEl) msgEl.textContent = 'No data';
      }
      return;
    }

    const { prices: p } = game;
    const cur = p.currency || 'EUR';
    const safeUrl = escapeHtml(game.url || `https://gg.deals/steam-app/${appId}/`);

    const retail = fmt(p.currentRetail, cur);
    const keyshop = fmt(p.currentKeyshops, cur);
    let rows = priceRow(ICONS.retail, 'Best retail', retail, 'retail');
    rows += priceRow(ICONS.key, 'Best keyshop', keyshop, 'keyshop');

    const histParts = [
      fmt(p.historicalRetail, cur) && `Retail: ${fmt(p.historicalRetail, cur)}`,
      fmt(p.historicalKeyshops, cur) && `Key: ${fmt(p.historicalKeyshops, cur)}`,
    ].filter(Boolean);
    if (histParts.length) {
      rows += `<div class="nps-div"></div><div class="nps-row"><span class="nps-row-icon">${ICONS.clock}</span><span class="nps-row-label">Historical low</span><span class="nps-val hist">${histParts.join(' / ')}</span></div>`;
    }

    document.getElementById(ID)?.remove();
    const w = document.createElement('div');
    w.id = ID;
    w.innerHTML = `${header()}<div class="nps-body"><div class="nps-rows">${rows}</div></div><div class="nps-ftr"><a href="${safeUrl}" target="_blank">View all deals on GG.deals →</a></div>`;
    sidebar.insertBefore(w, findRef(sidebar));
  } catch {
    document.getElementById(ID)?.remove();
  }
}

export default async function WebkitMain() {
  const tryInject = async () => {
    const m = window.location.href.match(/store\.steampowered\.com\/app\/(\d+)/);
    if (!m) return;
    const id = parseInt(m[1], 10);
    if (isNaN(id) || id <= 0) return;

    let retries = 0;
    while (!document.querySelector(SIDEBAR_SEL) && retries < 50) {
      await new Promise(r => setTimeout(r, 100));
      retries++;
    }

    inject(id);
  };

  await tryInject();

  let lastUrl = window.location.href;
  new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      document.getElementById(ID)?.remove();
      tryInject();
    }
  }).observe(document.body, { childList: true, subtree: true });
}
