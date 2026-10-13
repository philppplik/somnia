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
  // 6. file tabs with open files (back in Code studio)
  await page.getByRole('radio',{name:/Somnia Code/}).click();await page.waitForTimeout(500);
  // Markdown files show the tab strip in Code studio; seed two through the dev-server store module.
  await page.evaluate(async()=>{const m=await import('/src/lib/projectActions.ts');m.addTextFiles([{name:'a11y-a.md',text:'# A'}]);m.addTextFiles([{name:'a11y-b.md',text:'# B'}]);});
  await page.waitForTimeout(600);
  const tabs=page.locator('[role=tablist][aria-label] [role=tab][data-tab-file]');const nTabs=await tabs.count();
  check(label('file tabs render after opening files'),nTabs>=2,`tabs=${nTabs}`);
  if(nTabs>=2){
   const tabStops=await page.evaluate(()=>[...document.querySelectorAll('[role=tab][data-tab-file]')].filter(t=>t.tabIndex>=0).length);
   check(label('file tablist has one Tab stop'),tabStops===1,`stops=${tabStops}`);
   await page.screenshot({path:`${out}/${theme}-file-tabs.png`,clip:{x:0,y:40,width:1440,height:90}});
   await tabs.first().focus();await page.keyboard.press('ArrowRight');
   const movedTo=await page.evaluate(()=>document.activeElement?.getAttribute('data-tab-file'));
   const first=await tabs.first().getAttribute('data-tab-file');
   check(label('ArrowRight moves focus to the next tab'),movedTo&&movedTo!==first,`${first} -> ${movedTo}`);
   await page.keyboard.press('Home');check(label('Home returns to the first tab'),await page.evaluate(f=>document.activeElement?.getAttribute('data-tab-file')===f,first));
   await page.keyboard.press('Shift+F10');await page.waitForTimeout(250);
   const menuFocus=await page.evaluate(()=>document.activeElement?.getAttribute('role')==='menuitem'&&!!document.activeElement.closest('[role=menu]'));
   check(label('Shift+F10 opens tab menu with focus on first item'),menuFocus);
   const nested=await page.evaluate(()=>!!document.querySelector('[role=tablist] [role=menu]'));check(label('tab menu is not nested in the tablist'),!nested);
   await page.screenshot({path:`${out}/${theme}-tab-menu.png`,clip:{x:0,y:40,width:700,height:260}});
   await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape');await page.waitForTimeout(250);
   check(label('Escape closes the tab menu and returns focus to the tab'),await page.evaluate(f=>document.activeElement?.getAttribute('data-tab-file')===f&&!document.querySelector('[role=menu]'),first));
   const before=await tabs.count();await page.keyboard.press('Delete');await page.waitForTimeout(300);
   check(label('Delete closes the focused tab'),(await tabs.count())===before-1,`${before} -> ${await tabs.count()}`);
  }
  // 6b. sidebar panel is a named region, not an unnamed tabpanel
  const unnamed=await page.evaluate(()=>[...document.querySelectorAll('[role=tabpanel]:not([hidden])')].filter(p=>!(p.getAttribute('aria-label')||p.getAttribute('aria-labelledby'))).length);
  check(label('no unnamed visible tabpanel in the shell'),unnamed===0,`unnamed=${unnamed}`);
  // 6c. hero button has a name and any disabled reason is exposed
  const hero=await page.evaluate(()=>{const g=document.querySelector('[data-testid=hero-action]');const b=g?.querySelector('[data-testid=hero-action-main]');if(!b)return null;const d=b.getAttribute('aria-describedby');return {name:b.getAttribute('aria-label'),disabled:b.disabled,desc:d?document.getElementById(d)?.textContent:null};});
  check(label('hero action has an accessible name and, when disabled, a described reason'),hero&&hero.name&&(!hero.disabled||hero.desc),JSON.stringify(hero));
  // 7. Extensions popup
  await page.evaluate(()=>window.__somniaControl.runCommand('extensions.open'));await page.waitForTimeout(900);
  const dlg=page.getByRole('dialog');check(label('extensions popup is a named dialog'),(await dlg.count())>0&&!!(await dlg.first().getAttribute('aria-label')||await dlg.first().getAttribute('aria-labelledby')));
  const navStops=await page.evaluate(()=>[...document.querySelectorAll('.ext-nav [role=tab]')].filter(t=>t.tabIndex>=0).length);check(label('extensions nav has one Tab stop'),navStops===1,`stops=${navStops}`);
  await page.locator('.ext-nav [role=tab][aria-selected=true]').first().focus();await page.keyboard.press('ArrowDown');await page.waitForTimeout(400);
  const sel=await page.evaluate(()=>({sel:document.querySelector('.ext-nav [role=tab][aria-selected=true]')?.id,foc:document.activeElement?.id}));
  check(label('ArrowDown moves and selects the next extensions tab'),sel.sel&&sel.sel===sel.foc&&sel.sel!=='ext-tab-installed',JSON.stringify(sel));
  const trapped=await page.evaluate(()=>{const d=document.querySelector('[role=dialog]');return !!d&&d.contains(document.activeElement);});check(label('focus is inside the dialog'),trapped);
  await page.screenshot({path:`${out}/${theme}-extensions.png`});
  // walk every popup view with Tab: every stop inside the dialog needs an accessible name. After the last control base-ui hands focus to
  // the browser (headless Chrome wraps to the document start), so leaving the dialog at the end is not counted as a failure.
  for(const view of ['installed','browse','updates','activity']){
   await page.locator(`#ext-tab-${view}`).click();await page.waitForTimeout(500);await page.locator(`#ext-tab-${view}`).focus();
   const bad=[];let escaped=false,visited=0,left=false;
   for(let i=0;i<45;i++){await page.keyboard.press('Tab');const r=await page.evaluate(()=>{const e=document.activeElement;const d=document.querySelector('[role=dialog]');const name=(e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')&&document.getElementById(e.getAttribute('aria-labelledby'))?.textContent||e.textContent||e.getAttribute('title')||(e.labels&&e.labels[0]?.textContent)||e.getAttribute('placeholder')||'').trim();return {guard:e.hasAttribute('data-base-ui-focus-guard'),inside:!!d&&d.contains(e),name,html:e.outerHTML.slice(0,90)};});if(r.guard||r.html.startsWith('<body')){left=true;continue;}if(!r.inside){left=true;continue;}if(!left)visited++;if(r.inside&&!r.name)bad.push(r.html);}
   check(label(`extensions ${view}: Tab visits controls inside the dialog first`),visited>=3,`visited=${visited}`);
   check(label(`extensions ${view}: every Tab stop has an accessible name`),bad.length===0,bad.slice(0,3).join(' | '));
  }
  await page.keyboard.press('Escape');await page.waitForTimeout(400);check(label('Escape closes the extensions popup'),(await page.getByRole('dialog').count())===0);
  check(label('no page errors'),errors.length===0,errors.join(' | '));
  await page.close();
 }
}finally{await browser.close();server.stop();}
process.exit(results.every(r=>r.ok)?0:1);
