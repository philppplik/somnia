// Bridge to the native shell. In WebView2: JSON messages over chrome.webview. In a plain
// browser (design review / tests) a mock is used; select failures with ?mock=ok|disk|net|perm|running|update.
const wv = window.chrome && window.chrome.webview;
let nextId = 1; const pending = new Map(); const listeners = [];
function dispatch(m) {
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  else if (m.event) listeners.forEach((l) => l(m.event));
}
function call(method, args) {
  return new Promise((res) => { const id = nextId++; pending.set(id, res); wv.postMessage(JSON.stringify({ id, method, args })); });
}
async function mockBridge() {
  const flag = new URLSearchParams(location.search).get('mock') || 'ok';
  const locale = new URLSearchParams(location.search).get('lang') || 'en';
  const tables = {};
  const load = async (c) => (tables[c] ||= await (await fetch(`../core/locales/${c}.json`)).json());
  const lic = await fetch('../../../LICENSE').then((r) => (r.ok ? r.text() : 'MIT License')).catch(() => 'MIT License');
  const emit = (e) => setTimeout(() => listeners.forEach((l) => l(e)), 0);
  let cancelled = false;
  return {
    async init() {
      return { version: '12.2.0', locale, strings: await load(locale), existingVersion: flag === 'update' ? '12.1.5' : null,
        options: { install_dir: '%LOCALAPPDATA%\\Somnia', start_menu: true, desktop_shortcut: true, launch_at_signin: false, file_associations: false, auto_update_check: true }, licenseText: lic };
    },
    async validate(o) { return o.install_dir.trim() ? { ok: true } : { ok: false, error: { field: 'empty' } }; },
    async browse() { return null; },
    async start() {
      cancelled = false; emit({ type: 'phase', phase: 'preparing' });
      const fails = { disk: { kind: 'disk_full', required: 412e6, free: 90e6, drive: 'C:', code: 'SOM-DSK-02' }, net: { kind: 'download', code: 'SOM-NET-01' }, perm: { kind: 'no_write_permission', path: 'C:\\Program Files\\Somnia', code: 'SOM-PRM-03' }, running: { kind: 'app_running', code: 'SOM-RUN-04' } };
      if (fails[flag]) return emit({ type: 'error', error: fails[flag] });
      let i = 0; const tick = () => { if (cancelled) return; if (i < 5) { emit({ type: 'progress', step: i, fraction: i === 0 ? null : i / 5, cancellable: i < 4 }); i++; setTimeout(tick, 400); } else emit({ type: 'success' }); }; tick();
    },
    async cancel() { cancelled = true; emit({ type: 'cancelled' }); },
    async launch() {}, async close() {}, async openLog() {}, async openUrl() {},
  };
}
export async function createBridge() {
  if (!wv) { const b = await mockBridge(); b.mock = true; b.onEvent = (cb) => listeners.push(cb); return b; }
  window.__somniaDispatch = dispatch; // the shell calls this via evaluate_script
  // borderless window: dragging the top strip (outside controls) moves it
  document.addEventListener('mousedown', (e) => { if (e.button === 0 && e.clientY < 44 && !e.target.closest('button')) wv.postMessage(JSON.stringify({ method: 'drag', args: [] })); });
  const b = {}; for (const m of ['init', 'validate', 'browse', 'start', 'cancel', 'launch', 'close', 'openLog', 'openUrl']) b[m] = (...a) => call(m, a);
  b.onEvent = (cb) => listeners.push(cb); return b;
}
