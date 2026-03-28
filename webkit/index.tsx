import { callable } from '@steambrew/webkit';

const fetchPrices = callable<[{ steam_app_id: string }], string>('fetch_prices');

const ID = 'niceprice-store';
const STYLES = 'niceprice-store-css';
const SIDEBAR = 'div.rightcol.game_meta_data';

const ICONS = {
  tag: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#67c1f5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  retail: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#beee11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  key: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f5a623" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
  clock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8f98a0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
};

interface Prices { currentRetail: string|null; currentKeyshops: string|null; historicalRetail: string|null; historicalKeyshops: string|null; currency: string; }
interface Game { title: string; url: string; prices: Prices; }
interface Response { success: boolean; data: Record<string, Game|null>; error?: string; }

function fmt(val: string|null, cur: string): string {
  if (!val) return '';
  const n = parseFloat(val);
  if (isNaN(n)) return '';
  if (n === 0) return 'FREE';
  const sym: Record<string,string> = { EUR:'€', USD:'$', GBP:'£', PLN:'zł', BRL:'R$', CHF:'CHF', DKK:'kr', NOK:'kr', SEK:'kr', CAD:'CA$', AUD:'A$' };
  const s = sym[cur] || cur;
  return ['EUR','PLN','BRL','CHF','DKK','NOK','SEK'].includes(cur) ? `${n.toFixed(2)}${s}` : `${s}${n.toFixed(2)}`;
}

function injectStyles() {
  if (document.getElementById(STYLES)) return;
  const s = document.createElement('style');
  s.id = STYLES;
  s.textContent = `
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
  document.head.appendChild(s);
}

async function inject(appId: number) {
  injectStyles();
  const sidebar = document.querySelector(SIDEBAR);
  if (!sidebar) return;
  document.getElementById(ID)?.remove();

  const ref = sidebar.querySelector('[id*="steamdb"],[class*="steamdb"]') || sidebar.firstChild;
  const ph = document.createElement('div');
  ph.id = ID;
  ph.innerHTML = `<div class="nps-hdr">${ICONS.tag}<span class="nps-title">NicePrice</span><span class="nps-badge">GG.deals</span></div><div class="nps-msg">Loading...</div>`;
  sidebar.insertBefore(ph, ref);

  try {
    const resp: Response = JSON.parse(await fetchPrices({ steam_app_id: String(appId) }));

    if (!resp.success) {
      const el = document.getElementById(ID);
      if (!el) return;
      if (resp.error === 'no_api_key' || resp.error === 'invalid_api_key') {
        el.innerHTML = `<div class="nps-hdr">${ICONS.tag}<span class="nps-title">NicePrice</span></div><div class="nps-msg">${resp.error === 'no_api_key' ? 'API key required' : 'Invalid API key'} — <a href="https://gg.deals/api/" target="_blank">Get a free key</a></div>`;
      } else {
        el.querySelector('.nps-msg')!.textContent = resp.error === 'rate_limited' ? 'Rate limited' : 'Could not load';
      }
      return;
    }

    const game = resp.data?.[String(appId)];
    if (!game?.prices) { const el = document.getElementById(ID); if (el) el.querySelector('.nps-msg')!.textContent = 'No data'; return; }

    const { prices: p } = game;
    const cur = p.currency || 'EUR';
    const url = game.url || `https://gg.deals/steam-app/${appId}/`;

    let rows = '';
    const retail = fmt(p.currentRetail, cur);
    const keyshop = fmt(p.currentKeyshops, cur);
    rows += `<div class="nps-row"><span class="nps-row-icon">${ICONS.retail}</span><span class="nps-row-label">Best retail</span>${retail ? `<span class="nps-val retail">${retail}</span>` : '<span class="nps-na">N/A</span>'}</div>`;
    rows += `<div class="nps-row"><span class="nps-row-icon">${ICONS.key}</span><span class="nps-row-label">Best keyshop</span>${keyshop ? `<span class="nps-val keyshop">${keyshop}</span>` : '<span class="nps-na">N/A</span>'}</div>`;

    const hist = [fmt(p.historicalRetail, cur) && `Retail: ${fmt(p.historicalRetail, cur)}`, fmt(p.historicalKeyshops, cur) && `Key: ${fmt(p.historicalKeyshops, cur)}`].filter(Boolean);
    if (hist.length) rows += `<div class="nps-div"></div><div class="nps-row"><span class="nps-row-icon">${ICONS.clock}</span><span class="nps-row-label">Historical low</span><span class="nps-val hist">${hist.join(' / ')}</span></div>`;

    document.getElementById(ID)?.remove();
    const w = document.createElement('div');
    w.id = ID;
    w.innerHTML = `<div class="nps-hdr">${ICONS.tag}<span class="nps-title">NicePrice</span><span class="nps-badge">GG.deals</span></div><div class="nps-body"><div class="nps-rows">${rows}</div></div><div class="nps-ftr"><a href="${url}" target="_blank">View all deals on GG.deals →</a></div>`;
    const ref2 = sidebar.querySelector('[id*="steamdb"],[class*="steamdb"]') || sidebar.firstChild;
    sidebar.insertBefore(w, ref2);
  } catch {
    document.getElementById(ID)?.remove();
  }
}

export default async function WebkitMain() {
  const m = window.location.href.match(/store\.steampowered\.com\/app\/(\d+)/);
  if (!m) return;
  const id = parseInt(m[1], 10);
  if (isNaN(id) || id <= 0) return;
  await inject(id);
}
