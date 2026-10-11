import { createBridge } from './bridge.js';
import { fmt, stepKey, percent, canAccept, errorVars, errorKey, fieldErrorKey } from './logic.mjs';

const $ = (id) => document.getElementById(id);
const bridge = await createBridge();
const init = await bridge.init();
let S = init.strings; let opts = { ...init.options }; let phase = 'idle'; let screen = 'welcome';
let scrolledEnd = false; let lastErr = null; let lastSpoken = 0; let currentTab = 'license';
const updating = !!init.existingVersion;
const t = (k, v) => fmt(S[k] ?? k, v);
const motionOK = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

document.documentElement.lang = init.locale.split('-')[0] === 'pt' ? 'pt-BR' : init.locale;
document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n, { version: init.version }); });
document.querySelectorAll('[data-i18n-label]').forEach((n) => { const v = t(n.dataset.i18nLabel); n.setAttribute('aria-label', v); n.title = v; });
document.title = t('window.title');
$('welcome-foot').textContent = t('welcome.footer', { version: init.version });
$('h-update').textContent = t('update.title', { version: init.version });
$('btn-whatsnew').textContent = t('finish.whatsnew', { version: init.version });
$('finish-body').textContent = t('finish.body', { version: init.version });
$('opt-next').firstElementChild.textContent = t('options.install');
if (updating) $('options-sub').textContent = t('options.subtitle.update');

function say(msg) { const l = $('live'); l.textContent = ''; setTimeout(() => (l.textContent = msg), 30); }
function show(name, focusId) {
  screen = name;
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.dataset.screen !== name; });
  const first = focusId ? $(focusId) : document.querySelector(`#s-${name} h1`);
  if (first) first.focus({ preventScroll: true });
}
const startScreen = () => (updating ? 'update' : 'welcome');
function showStart() { show(startScreen(), updating ? 'btn-update' : 'btn-install'); }

// options
function syncOptionsToDom() {
  $('in-dir').value = opts.install_dir; $('o-startmenu').checked = opts.start_menu; $('o-desktop').checked = opts.desktop_shortcut;
  $('o-signin').checked = opts.launch_at_signin; $('o-assoc').checked = opts.file_associations; $('o-updates').checked = opts.auto_update_check;
}
function readOptionsFromDom() {
  opts = { install_dir: $('in-dir').value, start_menu: $('o-startmenu').checked, desktop_shortcut: $('o-desktop').checked,
    launch_at_signin: $('o-signin').checked, file_associations: $('o-assoc').checked, auto_update_check: $('o-updates').checked };
}
function fieldError(e) {
  const el = $('dir-error'); el.hidden = !e;
  if (e) { el.textContent = t(fieldErrorKey(e), { drive: e.drive }); $('in-dir').setAttribute('aria-invalid', 'true'); } else $('in-dir').removeAttribute('aria-invalid');
}
$('btn-browse').onclick = async () => { const p = await bridge.browse($('in-dir').value); if (p) { $('in-dir').value = p; fieldError(null); } };
$('in-dir').oninput = () => fieldError(null);
$('btn-options').onclick = () => { syncOptionsToDom(); show('options', 'in-dir'); };
$('opt-back').onclick = () => { readOptionsFromDom(); showStart(); };
$('opt-next').onclick = async () => {
  readOptionsFromDom(); const r = await bridge.validate(opts);
  if (!r.ok) { fieldError(r.error); $('in-dir').focus(); return; }
  fieldError(null); openLicense();
};

// license + privacy
function renderTab(which) {
  currentTab = which; const card = $('panel-text');
  $('tab-license').setAttribute('aria-selected', which === 'license'); $('tab-privacy').setAttribute('aria-selected', which === 'privacy');
  $('tab-license').tabIndex = which === 'license' ? 0 : -1; $('tab-privacy').tabIndex = which === 'privacy' ? 0 : -1;
  card.setAttribute('aria-labelledby', 'tab-' + which); card.textContent = '';
  if (which === 'license') { const pre = document.createElement('pre'); pre.textContent = init.licenseText; card.append(pre); }
  else {
    const h = document.createElement('h3'); h.textContent = t('tab.privacy'); const ul = document.createElement('ul');
    for (let i = 1; i <= 5; i++) { const li = document.createElement('li'); li.textContent = t('privacy.' + i); ul.append(li); }
    const a = document.createElement('button'); a.className = 'link'; a.type = 'button'; a.textContent = t('privacy.link'); a.onclick = () => bridge.openUrl('https://somnia.philipp-paulik.de/privacy/');
    card.append(h, ul, a);
  }
  card.scrollTop = 0; checkScroll();
}
function checkScroll() {
  const c = $('panel-text');
  if (currentTab === 'license') {
    if (c.scrollHeight - c.clientHeight - c.scrollTop <= 4) scrolledEnd = true;
    $('scroll-hint').hidden = scrolledEnd;
  } else $('scroll-hint').hidden = scrolledEnd;
  $('o-accept').disabled = !scrolledEnd; updateGate();
}
function updateGate() {
  const ok = canAccept(scrolledEnd, $('o-accept').checked); const b = $('lic-go');
  b.setAttribute('aria-disabled', String(!ok)); b.title = ok ? '' : t('license.gate');
}
function openLicense() { scrolledEnd = false; $('o-accept').checked = false; $('lic-go').firstElementChild.textContent = t(updating ? 'license.cta.update' : 'license.cta'); renderTab('license'); show('license', 'tab-license'); setTimeout(checkScroll, 0); }
$('panel-text').addEventListener('scroll', checkScroll);
$('o-accept').onchange = updateGate;
$('tab-license').onclick = () => renderTab('license'); $('tab-privacy').onclick = () => renderTab('privacy');
$('s-license').querySelector('.tabs').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const w = currentTab === 'license' ? 'privacy' : 'license'; renderTab(w); $('tab-' + w).focus(); }
});
$('lic-back').onclick = () => show('options', 'in-dir');
$('lic-go').onclick = () => { if ($('lic-go').getAttribute('aria-disabled') === 'true') return; begin(); };

// install
let started = false;
function begin() {
  if (started) return; started = true; $('lic-go').setAttribute('aria-disabled', 'true'); $('btn-install').setAttribute('aria-disabled', 'true');
  renderProgress({ step: 0, fraction: null }, true); show('progress', 'h-progress'); phase = 'preparing'; bridge.start(opts);
}
$('btn-install').onclick = () => { if ($('btn-install').getAttribute('aria-disabled') === 'true') return; syncOptionsToDom(); readOptionsFromDom(); openLicense(); };
$('btn-update').onclick = () => { syncOptionsToDom(); readOptionsFromDom(); openLicense(); };
$('btn-update-cancel').onclick = requestClose;

function renderProgress(p, preparing) {
  const pc = percent(p.fraction); const bar = $('bar');
  $('step-label').textContent = preparing ? t('progress.preparing') : (p.step === 4 ? t('progress.finishing') : t(stepKey(p.step)));
  bar.classList.toggle('indet', pc === null);
  if (pc === null) { bar.removeAttribute('aria-valuenow'); $('pct').textContent = ''; $('fill').style.removeProperty('--p'); }
  else { bar.setAttribute('aria-valuenow', pc); $('pct').textContent = pc + '%'; $('fill').style.setProperty('--p', pc / 100); }
  $('step-count').textContent = t('progress.stepof', { n: Math.min((p.step || 0) + 1, 5), total: 5 });
  const cancellable = p.cancellable !== false; $('prog-cancel').setAttribute('aria-disabled', String(!cancellable));
  if (Date.now() - lastSpoken > 5000) { lastSpoken = Date.now(); say($('step-label').textContent); } // polite, max every 5 s
}
$('prog-cancel').onclick = () => { if ($('prog-cancel').getAttribute('aria-disabled') === 'true') { say(t('progress.finishing')); return; } askCancel(); };

bridge.onEvent((e) => {
  if (e.type === 'phase') phase = e.phase;
  else if (e.type === 'progress') { phase = e.step >= 4 ? 'finishing' : 'installing'; if (screen !== 'progress' && screen !== 'error') show('progress'); renderProgress(e); }
  else if (e.type === 'success') { phase = 'success'; started = false; show('finish', 'btn-start'); say(t('finish.title')); }
  else if (e.type === 'error') { phase = 'error'; started = false; showError(e.error); }
  else if (e.type === 'cancelled') { phase = 'cancelled'; started = false; closeConfirm(); show('cancelled', 'can-resume'); }
});

// errors
const ICONS = {
  net: '<svg viewBox="0 0 24 24"><path d="M2 8.8a15 15 0 0 1 4-2.4M22 8.8a15 15 0 0 0-9.5-3.7M5 12.9a10 10 0 0 1 3.2-2M19 12.9a10 10 0 0 0-3.4-2.1M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M2 2l20 20"/></svg>',
  disk: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2L12 3zM12 10v5M12 18h.01"/></svg>' };
const ICON_FOR = { download: ['net', ''], disk_full: ['disk', 'orange'], no_write_permission: ['warn', 'orange'] };
function showError(err) {
  lastErr = err; const [ic, tone] = ICON_FOR[err.kind] || ['warn', '']; $('err-icon').innerHTML = ICONS[ic]; $('err-icon').className = 'icon ' + tone; $('err-icon').setAttribute('aria-label', t(errorKey(err.kind))); $('err-icon').removeAttribute('aria-hidden'); $('err-icon').setAttribute('role', 'img');
  const k = errorKey(err.kind); const v = errorVars(err);
  $('h-error').textContent = t(k); $('err-body').textContent = t(k + '.body', v);
  $('err-code').textContent = err.code ? t('error.code', { code: err.code }) : ''; $('err-code').hidden = !err.code;
  const dirFix = err.kind === 'disk_full' || err.kind === 'no_write_permission';
  $('err-secondary').textContent = dirFix ? t('button.choosefolder') : t('button.cancel'); $('err-secondary').dataset.mode = dirFix ? 'folder' : 'cancel';
  $('err-retry').hidden = err.kind === 'corrupt_payload'; $('err-log').hidden = err.kind !== 'generic';
  if (err.kind === 'corrupt_payload') { $('err-secondary').textContent = t('button.close'); $('err-secondary').dataset.mode = 'close'; }
  show('error', err.kind === 'corrupt_payload' ? 'err-secondary' : 'err-retry');
}
$('err-retry').onclick = () => { if (started) return; started = true; renderProgress({ step: 0, fraction: null }, true); show('progress', 'h-progress'); bridge.start(opts); };
$('err-secondary').onclick = () => { const m = $('err-secondary').dataset.mode; if (m === 'folder') { syncOptionsToDom(); show('options', 'in-dir'); } else if (m === 'close') bridge.close(); else { bridge.cancel(); } };
$('err-log').onclick = () => bridge.openLog();
$('can-resume').onclick = () => { started = false; phase = 'idle'; showStart(); };
$('can-close').onclick = () => bridge.close();

// finish
$('btn-start').onclick = () => { $('btn-start').setAttribute('aria-disabled', 'true'); if ($('o-launch').checked) bridge.launch(); bridge.close(); };
$('btn-finish-close').onclick = () => bridge.close();
$('btn-whatsnew').onclick = () => bridge.openUrl('https://github.com/philppplik/somnia/releases');

// cancel confirmation: same path for X, Esc and Cancel button
let prevFocus = null;
function askCancel() {
  const mid = phase === 'preparing' || phase === 'installing';
  if (phase === 'finishing') { say(t('progress.finishing')); return; }
  prevFocus = document.activeElement;
  $('cf-title').textContent = t(mid ? 'cancel.mid.title' : 'cancel.pre.title'); $('cf-body').textContent = t(mid ? 'cancel.mid.body' : 'cancel.pre.body');
  $('cf-stop').textContent = t(mid ? 'cancel.stop' : 'cancel.leave'); $('cf-stop').dataset.mid = mid; $('confirm').hidden = false; $('cf-keep').focus();
}
function closeConfirm() { if (!$('confirm').hidden) { $('confirm').hidden = true; if (prevFocus && prevFocus.isConnected) prevFocus.focus(); } }
$('cf-keep').onclick = closeConfirm;
$('cf-stop').onclick = () => { if ($('cf-stop').dataset.mid === 'true') { $('confirm').hidden = true; bridge.cancel(); } else bridge.close(); };
function requestClose() {
  if (!$('confirm').hidden) { closeConfirm(); return; }
  if (['preparing', 'installing', 'finishing'].includes(phase) || screen === 'options' || screen === 'license' || screen === 'welcome' || screen === 'update') askCancel();
  else bridge.close();
}
$('btn-close').onclick = requestClose;

// keyboard: Esc = close, Enter on license = accept, focus trap inside the window
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); requestClose(); return; }
  if (e.key === 'Enter' && screen === 'license' && e.target.tagName !== 'BUTTON' && $('lic-go').getAttribute('aria-disabled') === 'false') { e.preventDefault(); $('lic-go').click(); }
  if (e.key === 'Tab') {
    const root = $('confirm').hidden ? $('window') : $('confirm');
    const f = [...root.querySelectorAll('button,input,[tabindex="0"]')].filter((n) => !n.disabled && !n.hidden && n.tabIndex >= 0 && n.offsetParent !== null && !n.closest('[hidden]'));
    if (!f.length) return; const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
});
document.addEventListener('visibilitychange', () => { document.querySelector('.wash').style.animationPlayState = document.hidden ? 'paused' : 'running'; });

syncOptionsToDom(); showStart();

// Design-review hook, mock bridge only (never active inside the installer).
if (bridge.mock) {
  const go = new URLSearchParams(location.search).get('screen');
  const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
  if (go) {
    if (go !== 'welcome') $(updating ? 'btn-update' : 'btn-options').click();
    if (['license', 'progress', 'error', 'finish'].includes(go)) { await tick(); $('opt-next').click(); await tick(); }
    if (go === 'privacy') { $('btn-options').click(); await tick(); $('opt-next').click(); await tick(); $('tab-privacy').click(); }
    if (['progress', 'error', 'finish'].includes(go)) { const c = $('panel-text'); c.scrollTop = c.scrollHeight; await tick(); $('o-accept').click(); await tick(); $('lic-go').click(); }
  }
}
