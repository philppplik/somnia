// Pure helpers (unit-tested in node, no DOM).
export function fmt(tpl, vars = {}) { return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)); }
export function formatBytes(n) {
  if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB';
  if (n >= 1048576) return Math.round(n / 1048576) + ' MB';
  return Math.max(1, Math.round(n / 1024)) + ' KB';
}
export const STEP_KEYS = ['unpack', 'shortcuts', 'assoc', 'updater', 'finish'];
export function stepKey(i) { return 'progress.step.' + STEP_KEYS[Math.min(Math.max(i, 0), STEP_KEYS.length - 1)]; }
/** null fraction = indeterminate; never invent a value. */
export function percent(f) { return f == null ? null : Math.round(Math.min(Math.max(f, 0), 1) * 100); }
export function canAccept(scrolledToEnd, ticked) { return !!(scrolledToEnd && ticked); }
export function errorVars(err) {
  const v = { code: err.code || '' };
  if (err.kind === 'disk_full') { v.required = formatBytes(err.required); v.free = formatBytes(err.free); v.drive = err.drive; }
  if (err.kind === 'no_write_permission' || err.kind === 'leftover_files') v.path = err.path;
  return v;
}
const KEYS = { download: 'error.download', disk_full: 'error.disk', no_write_permission: 'error.permission', app_running: 'error.running', corrupt_payload: 'error.corrupt', leftover_files: 'error.leftover', web_view2_missing: 'error.webview2', generic: 'error.generic' };
export function errorKey(kind) { return KEYS[kind] || KEYS.generic; }
export function fieldErrorKey(e) { return { empty: 'field.empty', not_absolute: 'field.notabsolute', unwritable: 'field.unwritable', no_space: 'field.nospace' }[e.field] || 'error.generic'; }
