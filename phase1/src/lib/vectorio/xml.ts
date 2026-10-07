/** Minimal, dependency-free XML reader sufficient for SVG. No DTD/entity expansion beyond the 5 predefined + numeric. */

export interface XmlElement { name: string; attrs: Record<string, string>; children: XmlElement[]; text: string }

export class XmlError extends Error {}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENT[e] ?? m;
  });

export function parseXml(src: string): XmlElement {
  let i = 0;
  if (src.charCodeAt(0) === 0xfeff) i = 1;
  const root: XmlElement = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlElement[] = [root];
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    const cur = stack[stack.length - 1];
    if (lt > i) cur.text += decodeEntities(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); if (e < 0) throw new XmlError('unterminated comment'); i = e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt); if (e < 0) throw new XmlError('unterminated CDATA'); cur.text += src.slice(lt + 9, e); i = e + 3; continue; }
    if (src.startsWith('<?', lt)) { const e = src.indexOf('?>', lt); if (e < 0) throw new XmlError('unterminated PI'); i = e + 2; continue; }
    if (src.startsWith('<!', lt)) { // DOCTYPE, possibly with an internal subset in [...]
      let depth = 0, j = lt + 2;
      for (; j < src.length; j++) { const ch = src[j]; if (ch === '[') depth++; else if (ch === ']') depth--; else if (ch === '>' && depth <= 0) break; }
      if (j >= src.length) throw new XmlError('unterminated declaration');
      i = j + 1; continue;
    }
    if (src[lt + 1] === '/') {
      const e = src.indexOf('>', lt); if (e < 0) throw new XmlError('unterminated end tag');
      const name = src.slice(lt + 2, e).trim();
      const top = stack.pop();
      if (!top || top.name !== name || stack.length === 0) throw new XmlError(`mismatched </${name}>`);
      i = e + 1; continue;
    }
    // start tag
    let j = lt + 1;
    const nameM = /[^\s/>]+/y; nameM.lastIndex = j;
    const nm = nameM.exec(src); if (!nm) throw new XmlError('bad tag');
    const el: XmlElement = { name: nm[0], attrs: {}, children: [], text: '' };
    j = nameM.lastIndex;
    const attrRe = /\s*([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
    for (;;) {
      attrRe.lastIndex = j;
      const a = attrRe.exec(src);
      if (!a) break;
      el.attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? '');
      j = attrRe.lastIndex;
    }
    while (j < src.length && /\s/.test(src[j])) j++;
    let selfClose = false;
    if (src[j] === '/') { selfClose = true; j++; }
    if (src[j] !== '>') throw new XmlError(`malformed tag <${el.name}>`);
    cur.children.push(el);
    if (!selfClose) stack.push(el);
    i = j + 1;
  }
  if (stack.length !== 1) throw new XmlError(`unclosed <${stack[stack.length - 1].name}>`);
  const top = root.children[0];
  if (!top) throw new XmlError('empty document');
  return top;
}

export const escapeAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
