import { parse, serializeOuter, type DefaultTreeAdapterMap } from 'parse5';
type Node = DefaultTreeAdapterMap['node'];
type El = DefaultTreeAdapterMap['element'];
const isEl = (n: Node): n is El => 'tagName' in n;
const isText = (n: Node): n is DefaultTreeAdapterMap['textNode'] => n.nodeName === '#text';
const attr = (e: El, name: string) => e.attrs.find(a => a.name === name)?.value ?? '';
const SKIP = new Set(['script', 'style', 'head', 'template', 'noscript']);
const BLOCK_RAW = new Set(['table', 'form', 'iframe', 'svg', 'video', 'audio', 'canvas', 'details']);
const children = (n: Node): Node[] => ('childNodes' in n ? (n.childNodes as Node[]) : []);
const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/([*_`\[\]])/g, '\\$1');
const squash = (t: string) => t.replace(/\s+/g, ' ');

function inline(nodes: Node[]): string {
  let out = '';
  for (const n of nodes) {
    if (isText(n)) { out += esc(squash(n.value)); continue; }
    if (!isEl(n) || SKIP.has(n.tagName)) continue;
    const inner = () => inline(children(n));
    switch (n.tagName) {
      case 'strong': case 'b': { const t = inner().trim(); out += t ? `**${t}**` : ''; break; }
      case 'em': case 'i': { const t = inner().trim(); out += t ? `*${t}*` : ''; break; }
      case 'code': out += '`' + children(n).map(c => (isText(c) ? c.value : '')).join('').replace(/`/g, "'") + '`'; break;
      case 'br': out += '  \n'; break;
      case 'a': { const href = attr(n, 'href'); const t = inner(); out += href ? `[${t}](${href.replace(/\)/g, '%29').replace(/ /g, '%20')})` : t; break; }
      case 'img': out += `![${esc(attr(n, 'alt'))}](${attr(n, 'src').replace(/\)/g, '%29').replace(/ /g, '%20')})`; break;
      default: out += BLOCK_RAW.has(n.tagName) ? serializeOuter(n) : inner();
    }
  }
  return out;
}

function list(el: El, ordered: boolean, depth: number): string {
  let i = Number(attr(el, 'start')) || 1;
  const pad = '  '.repeat(depth);
  return children(el).filter(isEl).filter(c => c.tagName === 'li').map(li => {
    const inlineKids: Node[] = [], nested: string[] = [];
    for (const c of children(li)) {
      if (isEl(c) && (c.tagName === 'ul' || c.tagName === 'ol')) nested.push(list(c, c.tagName === 'ol', depth + 1));
      else inlineKids.push(c);
    }
    const marker = ordered ? `${i++}.` : '-';
    return [`${pad}${marker} ${inline(inlineKids).trim()}`, ...nested].join('\n');
  }).join('\n');
}

function blocks(nodes: Node[]): string[] {
  const out: string[] = [];
  let run: Node[] = [];
  const flush = () => { const t = inline(run).trim(); if (t) out.push(t); run = []; };
  for (const n of nodes) {
    if (isText(n)) { run.push(n); continue; }
    if (!isEl(n)) continue;
    const tag = n.tagName;
    if (SKIP.has(tag)) continue;
    if (/^h[1-6]$/.test(tag)) { flush(); out.push(`${'#'.repeat(Number(tag[1]))} ${inline(children(n)).trim()}`); }
    else if (tag === 'p') { flush(); const t = inline(children(n)).trim(); if (t) out.push(t); }
    else if (tag === 'ul' || tag === 'ol') { flush(); out.push(list(n, tag === 'ol', 0)); }
    else if (tag === 'blockquote') { flush(); out.push(blocks(children(n)).join('\n\n').split('\n').map(l => `> ${l}`.trimEnd()).join('\n')); }
    else if (tag === 'pre') { flush(); const code = children(n).map(c => (isText(c) ? c.value : isEl(c) ? children(c).map(k => (isText(k) ? k.value : '')).join('') : '')).join('').replace(/\n$/, ''); out.push('```\n' + code + '\n```'); }
    else if (tag === 'hr') { flush(); out.push('---'); }
    else if (BLOCK_RAW.has(tag)) { flush(); out.push(serializeOuter(n)); }
    else if (['div', 'section', 'article', 'main', 'header', 'footer', 'nav', 'aside', 'figure', 'figcaption', 'li', 'body', 'html'].includes(tag)) { flush(); out.push(...blocks(children(n))); }
    else run.push(n);
  }
  flush();
  return out;
}

/** Convert an HTML document to Markdown. Unsupported blocks (tables, forms, svg...) stay as raw HTML so nothing is lost. Scripts and styles are dropped. */
export function htmlToMarkdown(html: string): string {
  const doc = parse(html);
  const body = children(doc).filter(isEl).flatMap(h => children(h)).filter(isEl).find(e => e.tagName === 'body');
  return blocks(body ? children(body) : []).join('\n\n').trim() + '\n';
}
