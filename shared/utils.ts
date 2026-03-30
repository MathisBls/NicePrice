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
  tag: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#67c1f5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  retail: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#beee11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  key: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f5a623" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8f98a0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', 
}