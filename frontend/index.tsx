import { useState, useEffect } from 'react';
import { Millennium, IconsModule, definePlugin, callable, DialogButton, Dropdown, Field, Focusable, appDetailsClasses } from '@steambrew/client';
import type { MilleniumWindowContext } from './types/millennium';
import { ApiResponse } from '../shared/types';
import { fmt, escapeHtml, ICONS } from '../shared/utils';

const fetchPrices = callable<[{ steam_app_id: string }], string>('fetch_prices');
const getApiKey = callable<[], string>('get_api_key');
const saveApiKey = callable<[{ api_key: string }], string>('save_api_key');
const getRegion = callable<[], string>('get_region');
const saveRegion = callable<[{ region: string }], string>('save_region');

let curAppId: number | null = null;
let observer: MutationObserver | null = null;
let fetching: number | null = null;
let hasKey: boolean | null = null;

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
#${ID} { position:absolute; bottom:0; left:0; right:0; z-index:99; pointer-events:auto; }
.np-bar { background:var(--np-bg); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); display:flex; align-items:center; }
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

  if (hasKey === false) {
    w.innerHTML = `<div class="np-bar"><span class="np-label">Prices</span><div class="np-setup"><span class="np-setup-text">API key required —</span><span class="np-setup-link" data-url="${escapeHtml(GG_URL)}">Get your free key on GG.deals</span><span class="np-setup-text">then add it in NicePrice settings</span></div></div>`;
    container.appendChild(w);
    wireClicks(w);
    fetching = null;
    return;
  }

  w.innerHTML = `<div class="np-bar"><span class="np-label">Prices</span><span class="np-msg">Loading...</span></div>`;
  container.appendChild(w);

  try {
    const resp: ApiResponse = JSON.parse(await fetchPrices({ steam_app_id: String(appId) }));
    if (curAppId !== appId) { fetching = null; return; }
    const el = doc.getElementById(ID);
    if (!el) { fetching = null; return; }

    if (!resp.success) {
      if (resp.error === 'no_api_key' || resp.error === 'invalid_api_key') {
        hasKey = false;
        el.innerHTML = `<div class="np-bar"><span class="np-label">Prices</span><div class="np-setup"><span class="np-setup-text">${resp.error === 'no_api_key' ? 'API key required —' : 'Invalid API key —'}</span><span class="np-setup-link" data-url="${escapeHtml(GG_URL)}">Get your free key</span><span class="np-setup-text">then add it in settings</span></div></div>`;
        wireClicks(el);
      } else {
        el.innerHTML = `<div class="np-bar"><span class="np-label">Prices</span><span class="np-msg">${resp.error === 'rate_limited' ? 'Rate limited, try later' : 'Could not load prices'}</span></div>`;
      }
      fetching = null; return;
    }

    const game = resp.data?.[String(appId)];
    if (!game?.prices) {
      el.innerHTML = `<div class="np-bar"><span class="np-label">Prices</span><span class="np-msg">No price data</span></div>`;
      fetching = null; return;
    }

    const { prices: p } = game;
    const cur = p.currency || 'EUR';
    const safeUrl = escapeHtml(game.url || `https://gg.deals/steam-app/${appId}/`);
    let html = '';

    const retail = fmt(p.currentRetail, cur);
    if (retail) html += `<div class="np-deal np-retail" data-url="${safeUrl}"><span class="np-deal-icon">${ICONS.retail}</span><div class="np-deal-info"><span class="np-deal-store">Best Retail</span><span class="np-deal-price">${retail}</span></div></div>`;

    const keyshop = fmt(p.currentKeyshops, cur);
    if (keyshop) html += `<div class="np-deal np-keyshop" data-url="${safeUrl}"><span class="np-deal-icon">${ICONS.key}</span><div class="np-deal-info"><span class="np-deal-store">Best Keyshop</span><span class="np-deal-price">${keyshop}</span></div></div>`;

    const hist = [fmt(p.historicalRetail, cur), fmt(p.historicalKeyshops, cur)].filter(Boolean);
    if (hist.length) html += `<div class="np-hist"><span class="np-deal-icon">${ICONS.clock}</span><span class="np-hist-label">Low</span><span class="np-hist-value">${hist.join(' / ')}</span></div>`;

    if (!html) {
      el.innerHTML = `<div class="np-bar"><span class="np-label">Prices</span><span class="np-msg">No deals available</span></div>`;
    } else {
      el.innerHTML = `<div class="np-bar"><span class="np-label">Prices</span><div class="np-deals">${html}</div><span class="np-link" data-url="${safeUrl}">GG.deals →</span></div>`;
      wireClicks(el);
    }
  } catch (e) {
    console.error('NicePrice: inject failed', e);
    const el = doc.getElementById(ID);
    if (el) el.innerHTML = `<div class="np-bar"><span class="np-label">Prices</span><span class="np-msg">Failed to load</span></div>`;
  }
  fetching = null;
}

function handlePage(doc: Document) {
  const id = detectAppId();
  if (id && (id !== curAppId || !doc.getElementById(ID))) inject(doc, id);
  else if (!id && curAppId) { doc.getElementById(ID)?.remove(); curAppId = null; }
}

function setup(doc: Document) {
  if (observer) { observer.disconnect(); observer = null; }
  curAppId = null; fetching = null;

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
  Millennium.AddWindowCreateHook?.((ctx: MilleniumWindowContext) => {
    if (!ctx?.m_strName?.startsWith('SP ')) return;
    const doc = ctx.m_popup?.document;
    if (!doc?.body) return;
    setup(doc);
  });
  return {
    title: 'NicePrice',
    icon: <IconsModule.Settings />,
    content: <Settings />,
  };
});
