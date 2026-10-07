const NAMED = new Set(('black white red green blue yellow orange purple pink gray grey brown cyan magenta lime navy teal maroon olive silver aqua fuchsia gold indigo violet coral crimson transparent currentcolor').split(' '));

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Normalise a paint value. Returns null if not understood. url(#id) references are kept verbatim. */
export function normalizePaint(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const l = s.toLowerCase();
  if (l === 'none') return 'none';
  let m = /^#([0-9a-f]{3})$/.exec(l);
  if (m) return '#' + [...m[1]].map((c) => c + c).join('');
  if (/^#([0-9a-f]{6}|[0-9a-f]{8})$/.test(l)) return l;
  if ((m = /^#([0-9a-f]{4})$/.exec(l))) return '#' + [...m[1]].map((c) => c + c).join('');
  m = /^rgba?\(\s*([^)]+)\)$/.exec(l);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const ch = parts.slice(0, 3).map((p) => (p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p)));
      if (ch.some((n) => Number.isNaN(n))) return null;
      let out = '#' + ch.map(hex2).join('');
      if (parts[3] !== undefined) {
        const a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
        if (!Number.isNaN(a) && a < 1) out += hex2(a * 255);
      }
      return out;
    }
    return null;
  }
  if (/^url\(\s*#[^)]+\)/.test(l)) return s.replace(/\s+/g, ' ');
  if (NAMED.has(l)) return l === 'currentcolor' ? 'currentColor' : l;
  return null;
}
