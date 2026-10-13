/** Native-response render model. Rust tests cover Wry's rewritten URI parser;
 * this browser gate covers the real panel document and MessagePort session under
 * production CSP. It is not a Windows/WebView2 executable smoke test. */
import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
import {buildSync} from 'esbuild';
import {panelDocument,LIGHT_PANEL_THEME,DARK_PANEL_THEME} from '../src/lib/extensions/panelHtml';
import {REFERENCE_PANEL_CSP} from '../src/lib/extensions/cspPolicy';
const config=JSON.parse(readFileSync('./src-tauri/tauri.conf.json','utf8'));
const manifest=JSON.parse(readFileSync('./examples/data-workbench/somnia-extension.json','utf8'));
const host='http://app.somnia.test';
const panel='http://somnia-ext.localhost/panel/somnia.data-workbench/workbench?n=test';
const script=buildSync({stdin:{contents:`
import {PanelSession} from './src/lib/extensions/panelSession';
const f=document.querySelector('iframe');
const files={'sample.csv':'Name,Count\\nAlpha,2\\nBeta,3'};
const session=new PanelSession({token:'test-token',onNavigated:()=>f.remove(),handle:(method,args)=>{
 if(method==='project.listFiles')return Object.keys(files);
 if(method==='project.readFile')return files[args[0]];
 if(method==='storage.get')return null;
 if(method==='storage.set')return null;
 throw Error('Not allowed');
}});
addEventListener('message',e=>session.onWindowMessage(e.source,f.contentWindow,e.data));
f.onload=()=>session.onLoad();
f.src=${JSON.stringify(panel+'#test-token')};
`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife'}).outputFiles[0].text;
for(const mode of ['light','dark'] as const){
 test(`Windows-facing panel response displays content and round-trips API (${mode})`,async({page})=>{
  const theme=mode==='dark'?DARK_PANEL_THEME:LIGHT_PANEL_THEME;
  let hits=0;
  await page.route(panel,route=>{hits++;return route.fulfill({status:200,contentType:'text/html',headers:{'Content-Security-Policy':REFERENCE_PANEL_CSP},body:panelDocument(manifest.contributes.panels[0].html,null,theme)});});
  await page.route(host+'/**',route=>{
   if(route.request().url().endsWith('/host.js'))return route.fulfill({contentType:'text/javascript',body:script});
   return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':config.app.security.csp},body:`<!doctype html><html><head><link rel="stylesheet" href="/host.css"></head><body><main><h1>Extension response verification (${mode})</h1><p>Native-response model, not a Windows application capture</p><aside><h2>Data Workbench</h2><iframe title="Data Workbench" sandbox="allow-scripts"></iframe></aside></main><script src="/host.js"></script></body></html>`});
  });
  await page.route(host+'/host.css',route=>route.fulfill({contentType:'text/css',body:`body{margin:0;background:${mode==='dark'?'#0d0718':'#f4effc'};color:${theme.text};font:14px system-ui}main{padding:32px;max-width:640px}h1{font-size:20px}aside{border-radius:25px;overflow:hidden;background:${mode==='dark'?'#1a1030':'#fcfaff'}}h2{font-size:14px;padding:12px;margin:0}iframe{border:0;width:100%;height:580px;display:block;color-scheme:${mode}}`}));
  await page.goto(host);
  const frame=page.frameLocator('iframe');
  await expect(frame.locator('#intro')).toBeVisible();
  await expect(frame.locator('#stats')).toContainText('2rows');
  await expect(frame.locator('tbody tr')).toHaveCount(2);
  await frame.getByRole('button',{name:'Make JSON',exact:true}).click();
  await expect(frame.locator('#out')).toHaveValue(/"Count": 2/);
  expect(await frame.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(mode==='dark'?'rgb(26, 26, 32)':'rgb(255, 255, 255)');
  expect(await frame.locator('#out').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(mode==='dark'?'rgb(26, 26, 32)':'rgb(255, 255, 255)');
  await expect(page.locator('iframe')).toHaveAttribute('sandbox','allow-scripts');
  expect(hits).toBe(1);
  mkdirSync('test-results/ext-panel-render',{recursive:true});
  await page.screenshot({path:`test-results/ext-panel-render/${mode}.png`});
 });
}
