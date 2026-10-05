// Rough numbers for the ADR: memory/update size and merge time for a large HTML file.
import * as Y from 'yjs'
const mk = () => { const d = new Y.Doc(); return [d, d.getText('f')] }
const [a, ta] = mk(), [b, tb] = mk()
const page = '<section><h2>Title</h2><p>Lorem ipsum dolor sit amet</p></section>\n'
ta.insert(0, page.repeat(5000)) // ~300 KB
Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
let t = performance.now()
for (let i = 0; i < 2000; i++) { ta.insert((i * 37) % ta.length, 'x'); tb.insert((i * 91) % tb.length, 'y') }
const edit = performance.now() - t
t = performance.now()
Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a))); Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
const merge = performance.now() - t
console.log(JSON.stringify({ chars: ta.length, converged: ta.toString() === tb.toString(), edits: 4000, editMs: Math.round(edit), mergeMs: Math.round(merge), fullStateKB: Math.round(Y.encodeStateAsUpdate(a).length / 1024) }))
