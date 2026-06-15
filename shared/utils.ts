export const SYMBOLS: Record<string, string> = {
    EUR:'€', USD:'$', GBP:'£', PLN:'zł', BRL:'R$', CHF:'CHF', DKK:'kr', NOK:'kr', SEK:'kr', CAD:'CA$', AUD:'A$',
};

export const SUFFIX_CURRENCIES = ['EUR','PLN','BRL','CHF','DKK','NOK','SEK'];

export function fmt(val: string|null, cur: string): string {
    if (!val) return '';
    const n = parseFloat(val);
    if (isNaN(n)) return '';
    if (n === 0) return 'FREE';
    const sym = SYMBOLS[cur] || cur;
    return SUFFIX_CURRENCIES.includes(cur) ? `${n.toFixed(2)}${sym}` : `${sym}${n.toFixed(2)}`;
}

export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export const ICONS = {
  tag: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="4" width="22" height="16" rx="3" fill="#67c1f5" fill-opacity="0.15" stroke="#67c1f5" stroke-width="1.5"/><path d="M7 15V9l4 6V9" stroke="#67c1f5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 9h2.5a2 2 0 1 1 0 4H14.5V9zm0 6v-2h3" stroke="#67c1f5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  retail: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#beee11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  key: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f5a623" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8f98a0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  move: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
  arrow: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
  bell: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
}