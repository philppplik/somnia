// Small structural check run after every remote update (ADR-005 risk: unclosed tags after merges).
// It reports problems; it never rewrites the source.
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '))
const RAW = new Set(['script', 'style', 'textarea'])
// optional end tags are legal in HTML, so these do not count as unclosed
const OPTIONAL_END = new Set(['p', 'li', 'dt', 'dd', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'option', 'colgroup', 'html', 'head', 'body'])

export function checkHtml(src) {
  const issues = []
  const stack = []
  const re = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|"[^"]*$|'[^']*$|[^'">])*)(>|$)/g
  let m
  while ((m = re.exec(src))) {
    if (m[0].startsWith('<!--')) { if (!m[0].endsWith('-->')) issues.push({ kind: 'unterminated-comment', at: m.index }); continue }
    const [, close, rawName, , end] = m
    const name = rawName.toLowerCase()
    if (end !== '>') { issues.push({ kind: 'unterminated-tag', tag: name, at: m.index }); break }
    if (close) {
      let i = stack.length - 1
      while (i >= 0 && stack[i].name !== name) i--
      if (i < 0) { issues.push({ kind: 'stray-close', tag: name, at: m.index }); continue }
      for (let j = stack.length - 1; j > i; j--) if (!OPTIONAL_END.has(stack[j].name)) issues.push({ kind: 'unclosed', tag: stack[j].name, at: stack[j].at })
      stack.length = i
    } else if (!VOID.has(name) && !m[0].endsWith('/>')) {
      stack.push({ name, at: m.index })
      if (RAW.has(name)) {
        const endRe = new RegExp(`</${name}\\s*>`, 'ig'); endRe.lastIndex = re.lastIndex
        const e = endRe.exec(src)
        if (!e) { issues.push({ kind: 'unclosed', tag: name, at: m.index }); stack.pop(); re.lastIndex = src.length }
        else re.lastIndex = e.index
      }
    }
  }
  for (const s of stack) if (!OPTIONAL_END.has(s.name)) issues.push({ kind: 'unclosed', tag: s.name, at: s.at })
  return issues
}
