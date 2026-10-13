// Keyboard/ARIA audit of the studio shell in a real browser. Usage (from phase1/): node scripts/a11y-shell-audit.mjs
// Env: SOMNIA_CHROME=/path/to/chrome to use a system browser instead of the Playwright download.
// Writes PNGs to tests/artifacts/a11y-shell/ (git-ignored). Exits 1 on any failed check.
import {mkdirSync} from 'node:fs';
import {chromium} from '@playwright/test';
import {startServer} from './agent-harness/harness.mjs';

const out='tests/artifacts/a11y-shell';mkdirSync(out,{recursive:true});
const server=await startServer({port:1437});
const browser=await chromium.launch({...(process.env.SOMNIA_CHROME?{executablePath:process.env.SOMNIA_CHROME,args:['--no-sandbox']}:{})});
const results=[];const check=(name,ok,detail='')=>{results.push({name,ok:!!ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name}${detail?' - '+detail:''}`);};
try{
 for(const theme of ['dark','light']){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('somnia.fixture','starter');});
  await page.goto(server.url);await page.waitForFunction(()=>!!window.__somniaControl,null,{timeout:40000});await page.waitForTimeout(1200);
  await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);
  const label=n=>`[${theme}] ${n}`;
  // 1. each icon rail toolbar is one Tab stop
  const stops=await page.evaluate(()=>[...document.querySelectorAll('[role=toolbar]')].map(t=>({name:t.getAttribute('aria-label'),stops:[...t.querySelectorAll('button')].filter(b=>b.tabIndex>=0&&!b.disabled).length})));
  for(const t of stops)check(label(`toolbar "${t.name}" has exactly one Tab stop`),t.stops===1,`stops=${t.stops}`);
  // 2. ArrowDown inside the left rail moves focus and keeps one stop
  await page.locator('[role=toolbar][aria-label="Sidebar panels"] button').first().focus();
  await page.keyboard.press('ArrowDown');
  const second=await page.evaluate(()=>document.activeElement?.getAttribute('aria-label'));
  check(label('ArrowDown moves rail focus'),second&&second!=='Toggle sidebar',String(second));
  const stops2=await page.evaluate(()=>[...document.querySelectorAll('[role=toolbar][aria-label="Sidebar panels"] button')].filter(b=>b.tabIndex>=0&&!b.disabled).length);
  check(label('rail still one Tab stop after arrow move'),stops2===1,`stops=${stops2}`);
  // 3. menubar: Enter opens, Escape closes and returns focus to the trigger
  const project=page.getByRole('button',{name:'Project'});await project.focus();await page.keyboard.press('Enter');await page.waitForTimeout(300);
  const open=await page.locator('[role=menu]').count();check(label('Project menu opens with Enter'),open>0);
  await page.screenshot({path:`${out}/${theme}-menu-open.png`});
  await page.keyboard.press('ArrowDown');
  const inMenu=await page.evaluate(()=>!!document.activeElement?.closest('[role=menu]'));check(label('focus is inside menu after ArrowDown'),inMenu);
  await page.keyboard.press('Escape');await page.waitForTimeout(250);
  const back=await page.evaluate(()=>document.activeElement?.textContent?.trim());check(label('Escape returns focus to Project trigger'),back==='Project',String(back));
  // 4. studio pill radiogroup: arrow keys move selection
  const radio=page.getByRole('radio',{name:/Somnia Code/});await radio.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(400);
  const checked=await page.evaluate(()=>document.querySelector('[role=radio][aria-checked=true]')?.getAttribute('aria-label')??document.querySelector('[role=radio][aria-checked=true]')?.textContent);
  check(label('studio pill ArrowRight changes the checked studio'),checked&&!/Code/.test(checked),String(checked));
  await page.screenshot({path:`${out}/${theme}-pill.png`});
  // 5. focus ring is visible on a rail button
  await page.locator('[role=toolbar][aria-label="Sidebar panels"] button').first().focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
  const ring=await page.evaluate(()=>{const e=document.activeElement;const c=getComputedStyle(e);return c.outlineStyle!=='none'&&parseFloat(c.outlineWidth)>0||c.boxShadow!=='none';});
  check(label('keyboard focus ring is visible on rail button'),ring);
  await page.screenshot({path:`${out}/${theme}-focus.png`});
  check(label('no page errors'),errors.length===0,errors.join(' | '));
  await page.close();
 }
}finally{await browser.close();server.stop();}
process.exit(results.every(r=>r.ok)?0:1);
