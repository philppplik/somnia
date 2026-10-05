// Only the host process has this module wired to a folder. Guests never get a filesystem handle.
import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveInside } from './paths.mjs'
import { checkHtml } from './html-check.mjs'

/** Write every file in the shared doc to root. Skips (and reports) unsafe paths. */
export async function saveProject(files, root) {
  const written = [], skipped = []
  for (const [p, text] of files.entries()) {
    let abs
    try { abs = resolveInside(path.resolve(root), p) } catch { skipped.push(p); continue }
    await fs.mkdir(path.dirname(abs), { recursive: true })
    const tmp = abs + '.somnia-tmp'
    await fs.writeFile(tmp, text.toString(), 'utf8')
    await fs.rename(tmp, abs) // atomic replace: a crash never leaves half a file
    written.push(p)
  }
  return { written, skipped }
}

/** Load a folder into the shared doc (host start-up). Only text files below maxBytes. */
export async function loadProject(session, root, { maxBytes = 1_000_000 } = {}) {
  const out = []
  async function walk(dir, rel) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(path.join(dir, e.name), r)
      else if (e.isFile() && /\.(html?|css|js|mjs|json|md|svg|txt)$/i.test(e.name)) {
        const st = await fs.stat(path.join(dir, e.name)); if (st.size > maxBytes) continue
        session.file(r).insert(0, await fs.readFile(path.join(dir, e.name), 'utf8')); out.push(r)
      }
    }
  }
  await walk(root, '')
  return out
}

/** Watch a session's HTML files and call onIssues(path, issues) when a remote update leaves structure broken. */
export function watchValidity(session, onIssues) {
  session.doc.on('afterTransaction', tr => {
    if (tr.origin !== session) return // only remote updates
    for (const [p, t] of session.files.entries()) {
      if (!/\.html?$/i.test(p)) continue
      const issues = checkHtml(t.toString())
      if (issues.length) onIssues(p, issues)
    }
  })
}
