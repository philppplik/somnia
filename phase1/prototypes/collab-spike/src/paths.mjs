import path from 'node:path'
/** Project-relative POSIX paths only. Used for every remote-supplied file name. */
export function assertSafePath(p) {
  if (typeof p !== 'string' || !p || p.length > 260) throw new Error('invalid path')
  if (p.includes('\0') || p.includes('\\') || p.startsWith('/') || /^[a-zA-Z]:/.test(p)) throw new Error('invalid path')
  const parts = p.split('/')
  if (parts.some(s => s === '' || s === '.' || s === '..')) throw new Error('invalid path')
  return p
}
/** Resolve inside root or throw. */
export function resolveInside(root, p) {
  assertSafePath(p)
  const abs = path.resolve(root, ...p.split('/'))
  if (abs !== root && !abs.startsWith(path.resolve(root) + path.sep)) throw new Error('path escapes project')
  return abs
}
