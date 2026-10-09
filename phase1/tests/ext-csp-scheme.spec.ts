/**
 * Extension CSP harness (L2). Serves the host page with the REAL prod CSP from tauri.conf.json and serves
 * worker/panel documents with per-response CSP headers, which is how the somnia-ext:// scheme handler behaves natively.
 * Chromium cannot intercept custom schemes through page.route, so the scheme is modelled as same-origin path
 * https://app.somnia.test/__ext/... (frame-src/worker-src 'self' stands in for 'somnia-ext:').
 * This proves the policies and the bridge protocol. It does NOT prove native IPC denial; that is the L3 self-test.
 * Run: npx playwright test -c playwright.ext-csp.config.ts
 */
import {test, expect, type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {WORKER_SOURCE} from '../src/lib/extensions/workerSource';
import {REFERENCE_WORKER_CSP, REFERENCE_PANEL_CSP, parseCsp} from '../src/lib/extensions/cspPolicy';
import {RAW_WORKER_PROBE, PANEL_PROBE_SCRIPT} from '../src/lib/extensions/selftest';

const ORIGIN = 'https://app.somnia.test';
const PROD_CSP = (JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8')).app.security.csp as string);
const WORKER_CSP = process.env.SOMNIA_EXT_WORKER_CSP ?? REFERENCE_WORKER_CSP;
const PANEL_CSP = process.env.SOMNIA_EXT_PANEL_CSP ?? REFERENCE_PANEL_CSP;

const HOST_JS = `
window.__log=[];window.__apiCalls=[];window.__reports=[];
const files={'index.html':'<p>x</p>'};
const answer=(m)=>{window.__apiCalls.push(m.method);return m.method==='project.listFiles'?{ok:true,value:Object.keys(files)}:{ok:false,error:'unsupported '+m.method};};
window.startWorker=(url)=>new Promise((resolve)=>{const w=new Worker(url);const msgs=[];w.onmessage=e=>{const m=e.data;msgs.push(m);
 if(m.type==='api.call')w.postMessage({type:'api.result',requestId:m.requestId,...answer(m)});
 if(m.type==='activated'||m.type==='probe.report')resolve({msgs});};
 w.onerror=e=>resolve({error:String(e.message||'worker error'),msgs});window.__w=w;setTimeout(()=>resolve({timeout:true,msgs}),4000);});
window.startBlobWorker=(src)=>new Promise((resolve)=>{try{const u=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));const w=new Worker(u);w.onmessage=e=>resolve({ok:true,m:e.data});w.onerror=()=>resolve({error:'worker error'});setTimeout(()=>resolve({timeout:true}),2500);}catch(e){resolve({error:String(e)});}});
// Panel bridge. mode 'legacy' mirrors ExtensionPanel.tsx at 1d014e1 (trusts e.source===iframe.contentWindow forever).
// mode 'port' is the reference model: one MessagePort handed to the first document only; any later load invalidates the session.
window.mountPanel=(url,mode,sandbox='allow-scripts')=>new Promise((resolve)=>{
 const f=document.createElement('iframe');f.setAttribute('sandbox',sandbox);f.id='panel';let loads=0;let live=true;const events=[];window.__panel={events,get live(){return live;}};
 const handle=(m,reply)=>{if(!live){events.push('denied:'+m.method);reply({ok:false,error:'session invalidated'});return;}events.push('allowed:'+m.method);reply(answer(m));};
 if(mode==='legacy'){window.addEventListener('message',e=>{if(e.source!==f.contentWindow)return;const m=e.data;if(!m)return;
  if(m.type==='probe.report'){window.__reports.push(m);return;}
  if(m.type==='api.call')handle(m,x=>f.contentWindow.postMessage({type:'api.result',requestId:m.requestId,...x},'*'));});}
 f.onload=()=>{loads++;if(mode==='port'){if(loads>1){live=false;events.push('invalidated-on-load-'+loads);return;}
  const ch=new MessageChannel();ch.port1.onmessage=e=>{const m=e.data;if(m&&m.type==='api.call')handle(m,x=>ch.port1.postMessage({type:'api.result',requestId:m.requestId,...x}));};
  f.contentWindow.postMessage({type:'somnia.init'},'*',[ch.port2]);window.addEventListener('message',e=>{if(e.source===f.contentWindow&&e.data&&e.data.type==='probe.report')window.__reports.push(e.data);});}
  resolve(loads);};
 f.src=url;document.body.appendChild(f);});
window.panelCall=(method)=>{const f=document.getElementById('panel');return new Promise(r=>{r('n/a');});};
`;

const bridgeScript = (mode: 'legacy' | 'port') => mode === 'legacy'
  ? `<script>(()=>{let n=0;const p=new Map();addEventListener('message',e=>{const m=e.data||{};if(m.type!=='api.result')return;const r=p.get(m.requestId);if(!r)return;p.delete(m.requestId);m.ok?r.res(m.value):r.rej(new Error(m.error));});window.__call=(method,args)=>new Promise((res,rej)=>{const id=++n;p.set(id,{res,rej});parent.postMessage({type:'api.call',requestId:id,method,args},'*');});})();</script>`
  : `<script>(()=>{let n=0,port=null;const p=new Map();const q=[];addEventListener('message',e=>{if(e.data&&e.data.type==='somnia.init'&&e.ports[0]&&!port){port=e.ports[0];port.onmessage=ev=>{const m=ev.data||{};const r=p.get(m.requestId);if(!r)return;p.delete(m.requestId);m.ok?r.res(m.value):r.rej(new Error(m.error));};q.splice(0).forEach(f=>f());}});window.__call=(method,args)=>new Promise((res,rej)=>{const id=++n;p.set(id,{res,rej});const go=()=>port.postMessage({type:'api.call',requestId:id,method,args});port?go():q.push(go);});})();</script>`;

const panelDoc = (mode: 'legacy' | 'port', body: string) =>
  `<!doctype html><html><head><meta charset="utf-8">${bridgeScript(mode)}</head><body>${body}</body></html>`;

async function setup(page: Page) {
  const evilHits: string[] = [];
  await page.route('https://evil.test/**', r => { evilHits.push(r.request().url()); return r.fulfill({status: 200, contentType: 'text/plain', body: 'x'}); });
  await page.route(`${ORIGIN}/**`, async r => {
    const u = new URL(r.request().url());
    const html = (body: string, csp?: string) => r.fulfill({status: 200, contentType: 'text/html', headers: csp ? {'Content-Security-Policy': csp} : {}, body});
    if (u.pathname === '/') return html('<!doctype html><title>host</title><body><script src="/host.js"></script></body>', PROD_CSP);
    if (u.pathname === '/host.js') return r.fulfill({status: 200, contentType: 'text/javascript', body: HOST_JS});
    if (u.pathname === '/__ext/worker.js') return r.fulfill({status: 200, contentType: 'text/javascript', headers: {'Content-Security-Policy': WORKER_CSP}, body: WORKER_SOURCE});
    if (u.pathname === '/__ext/raw-worker.js') return r.fulfill({status: 200, contentType: 'text/javascript', headers: {'Content-Security-Policy': WORKER_CSP}, body: RAW_WORKER_PROBE('https://evil.test')});
    if (u.pathname.startsWith('/__ext/panel')) {
      const mode = (u.searchParams.get('mode') ?? 'port') as 'legacy' | 'port';
      const nav = u.searchParams.get('nav');
      const body = nav ? `<p id="nav-target">second document</p>${bridgeScript(mode)}<script>try{window.__call('project.listFiles',[]).catch(()=>{});}catch(e){}parent.postMessage({type:'api.call',requestId:99,method:'project.listFiles',args:[]},'*');</script>`
        : `<div id="out"></div><script>${PANEL_PROBE_SCRIPT('https://evil.test')}</script>`;
      return html(panelDoc(mode, body), PANEL_CSP);
    }
    if (u.pathname === '/__redirect') return r.fulfill({status: 302, headers: {Location: `${ORIGIN}/__ext/panel?mode=${u.searchParams.get('mode')}&nav=1`}, body: ''});
    return r.fulfill({status: 404, body: ''});
  });
  return evilHits;
}

test.describe('worker under the prod host CSP via scheme model', () => {
  test('policy sanity: harness really uses prod CSP', () => {
    expect(parseCsp(PROD_CSP).get('worker-src')).toBeTruthy();
    expect(parseCsp(PROD_CSP).get('script-src')).not.toContain("'unsafe-eval'");
  });

  test('control: blob worker is blocked by prod CSP (reproduces the native bug)', async ({page}) => {
    await setup(page); await page.goto(ORIGIN + '/');
    const r = await page.evaluate(() => (window as any).startBlobWorker('postMessage(1)'));
    expect(r.ok).not.toBe(true);
  });

  test('real bootstrap starts, evals extension code and round-trips the API', async ({page}) => {
    await setup(page); await page.goto(ORIGIN + '/');
    const r = await page.evaluate(async () => {
      const res = await (window as any).startWorker('/__ext/worker.js');
      (window as any).__w.postMessage({type: 'activate', code: "const f=await somnia.project.listFiles();await somnia.commands.register('x',async()=>{});globalThis.__files=f.length;"});
      await new Promise(r => setTimeout(r, 600));
      return {err: res.error, calls: (window as any).__apiCalls, msgs: res.msgs.map((m: any) => m.type)};
    });
    expect(r.err).toBeUndefined();
    expect(r.calls).toContain('project.listFiles');
  });

  test('worker without hardening: every network path is blocked by CSP, violations are reported', async ({page}) => {
    const evil = await setup(page); await page.goto(ORIGIN + '/');
    const r = await page.evaluate(async () => { const x = await (window as any).startWorker('/__ext/raw-worker.js'); return x.msgs.find((m: any) => m.type === 'probe.report'); });
    expect(r, 'worker produced a report').toBeTruthy();
    expect(r.started).toBe(true);
    expect(r.evalWorks).toBe(true);
    expect(r.network_blocked).toBe(true);
    expect(r.attempts).toEqual(expect.objectContaining({fetch: 'blocked', xhr: 'blocked', websocket: 'blocked', importScripts: 'blocked'}));
    expect(r.violations.some((v: any) => v.directive.startsWith('connect-src'))).toBe(true);
    expect(evil).toEqual([]);
  });
});

test.describe('panel under the prod host CSP via scheme model', () => {
  for (const mode of ['port'] as const) {
    test(`panel runs inline script, round-trips the API, is network/DOM isolated (${mode})`, async ({page}) => {
      const evil = await setup(page); await page.goto(ORIGIN + '/');
      await page.evaluate(m => (window as any).mountPanel(`/__ext/panel?mode=${m}`, m), mode);
      await expect.poll(() => page.evaluate(() => (window as any).__reports.length)).toBeGreaterThan(0);
      const rep = await page.evaluate(() => (window as any).__reports[0]);
      expect(rep.started).toBe(true);
      expect(rep.api_roundtrip).toBe(true);
      expect(rep.attempts, JSON.stringify(rep)).toEqual(expect.objectContaining({fetch: 'blocked'}));
      expect(rep.network_blocked, JSON.stringify(rep)).toBe(true);
      expect(rep.dom_blocked).toBe(true);
      expect(rep.attempts.formSubmit).not.toBe('open');
      expect(rep.attempts).toEqual(expect.objectContaining({fetch: 'blocked', xhr: 'blocked', websocket: 'blocked', img: 'blocked', base: 'blocked', scriptSrc: 'blocked'}));
      const dirs = rep.violations.map((v: any) => v.directive.split('-')[0] + '-' + (v.directive.split('-')[1] ?? ''));
      expect(dirs.join(' ')).toMatch(/connect-src/);
      expect(evil).toEqual([]);
    });
  }

  test('control: srcdoc panel is blocked under the prod CSP (reproduces the native bug)', async ({page}) => {
    await setup(page); await page.goto(ORIGIN + '/');
    const ran = await page.evaluate(() => new Promise<boolean>(res => {
      const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts');
      f.srcdoc = '<script>parent.postMessage("ran","*")<\/script>';
      const on = (e: MessageEvent) => { if (e.data === 'ran') res(true); }; addEventListener('message', on);
      document.body.appendChild(f); setTimeout(() => res(false), 1500);
    }));
    expect(ran).toBe(false);
  });
});

/**
 * Navigation. The panel CSP does not stop self-navigation; the host frame-src ('self' blob: + scheme) bounds targets.
 * These are targeted NEGATIVE tests on targets and the one invariant that matters: after the panel's document is replaced,
 * the old session has no host API authority. No claim of arbitrary HTTP exfiltration is made.
 */
test.describe('panel navigation', () => {
  const targets: Record<string, (mode: string) => string> = {
    'same-app page': () => `${ORIGIN}/`,
    'scheme target (another ext doc)': m => `${ORIGIN}/__ext/panel?mode=${m}&nav=1`,
    'redirect chain into ext doc': m => `${ORIGIN}/__redirect?mode=${m}`,
    'blob: url': () => 'BLOB',
    'external https (frame-src must refuse)': () => 'https://evil.test/x',
  };
  async function navigateAndCall(page: Page, mode: 'legacy' | 'port', target: string) {
    await setup(page);
    await page.goto(ORIGIN + '/');
    await page.evaluate(m => (window as any).mountPanel(`/__ext/panel?mode=${m}`, m), mode);
    await expect.poll(() => page.evaluate(() => (window as any).__reports.length)).toBeGreaterThan(0);
    await page.evaluate(() => { (window as any).__panel.events.length = 0; });
    const frame = page.frames().find(f => f.url().includes('/__ext/panel'))!;
    await frame.evaluate(t => {
      const url = t === 'BLOB' ? URL.createObjectURL(new Blob(['<script>parent.postMessage({type:"api.call",requestId:98,method:"project.listFiles",args:[]},"*")<\/script>'], {type: 'text/html'})) : t;
      try { location.href = url; } catch { /* blocked synchronously */ }
    }, target).catch(() => {});
    await page.waitForTimeout(800);
    // Whatever document the frame holds now (or if navigation was refused, the old one): ask the host bridge to run an API call from it.
    await page.evaluate(() => { const f = document.getElementById('panel') as HTMLIFrameElement; try { f.contentWindow!.postMessage({type: 'somnia.probe'}, '*'); } catch {} });
    const after = page.frames().find(f => f.parentFrame() !== null);
    const navigated = !!after && !after.url().includes('mode=' + mode) || (after?.url().includes('nav=1') ?? false);
    return {navigated, url: after?.url() ?? '', host: await page.evaluate(() => ({live: (window as any).__panel.live, events: [...(window as any).__panel.events]}))};
  }

  for (const [name, mk] of Object.entries(targets)) {
    test(`port bridge: after navigation to ${name} the old session is dead and the new document gets no authority`, async ({page}) => {
      const r = await navigateAndCall(page, 'port', mk('port'));
      // If the frame really navigated, the host must have invalidated; if the engine refused, the session may stay live (same document).
      if (r.navigated) { expect(r.host.live).toBe(false); }
      expect(r.host.events.filter(e => e.startsWith('allowed:'))).toEqual([]);
    });
  }

  test('external https target is refused by frame-src (frame stays on the ext document)', async ({page}) => {
    const evil = await setup(page);
    const r = await navigateAndCall(page, 'port', 'https://evil.test/x');
    expect(r.url).not.toContain('evil.test');
    expect(evil).toEqual([]);
  });

  test('KNOWN-BAD: legacy source-only bridge keeps authority for a navigated frame (documents the review finding)', async ({page}) => {
    test.fail(true, 'ExtensionPanel at 1d014e1 checks only e.source===contentWindow; the WindowProxy survives navigation');
    await setup(page);
    await page.goto(ORIGIN + '/');
    await page.evaluate(() => (window as any).mountPanel('/__ext/panel?mode=legacy', 'legacy'));
    await expect.poll(() => page.evaluate(() => (window as any).__reports.length)).toBeGreaterThan(0);
    await page.evaluate(() => { (window as any).__panel.events.length = 0; (window as any).__legacyPending = true; });
    const frame = page.frames().find(f => f.url().includes('/__ext/panel'))!;
    await frame.evaluate(t => { location.href = t; }, `${ORIGIN}/__ext/panel?mode=legacy&nav=1`);
    await page.waitForTimeout(800);
    const nav = page.frames().find(f => f.url().includes('nav=1'))!;
    await nav.evaluate(() => { (window as any).__call('project.listFiles', []).catch(() => {}); });
    await page.waitForTimeout(400);
    const events = await page.evaluate(() => (window as any).__panel.events as string[]);
    expect(events.filter(e => e.startsWith('allowed:'))).toEqual([]); // fails today: the second document is served
  });
});
