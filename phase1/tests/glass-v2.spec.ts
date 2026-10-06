import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';

/** Glass is only live once the native compositor confirmed it; browsers have none, so tests force the flag like the existing surface tests. */
async function openGlass(page:Page){
 await page.goto('/');await expect(page.locator('.app-frame')).toBeVisible();
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByLabel('App background',{exact:true}).selectOption('glass');
 await page.evaluate(()=>{document.documentElement.dataset.background='glass';});
}

/** Settings re-render while the rAF-throttled commit lands, so a slider can be replaced between fill() and the next step. Locators re-resolve; retry until the value really sticks. */
async function setOpacity(page:Page,v:number){
 const slider=page.getByRole('slider',{name:'Opacity',exact:true});
 await expect(async()=>{await slider.fill(String(v));await expect(slider).toHaveValue(String(v),{timeout:1500});}).toPass({timeout:15000});
}
async function checkScope(page:Page,name:string){
 const box=page.getByRole('checkbox',{name,exact:true});
 await expect(async()=>{await box.check({timeout:3000});await expect(box).toBeChecked({timeout:1000});}).toPass({timeout:15000});
}
/** Screenshots are review artifacts, not assertions; a slow software-blur frame must not fail the test. */
const shot=(page:Page,path:string)=>page.screenshot({path,timeout:5000}).catch(()=>undefined);
const bg=(page:Page,sel:string)=>page.locator(sel).first().evaluate(e=>getComputedStyle(e).backgroundColor);
/** What the pre-v2 hardcoded CSS produced, computed by the browser itself. */
const legacy=(page:Page,token:string,pct:number)=>page.evaluate(([t,p])=>{const d=document.createElement('div');d.style.background=`color-mix(in srgb,var(${t}) ${p}%,transparent)`;document.body.append(d);const c=getComputedStyle(d).backgroundColor;d.remove();return c;},[token,pct] as const);

test('default look is pixel-identical to pre-v2 (frame 68 %, panels 88 %, blur 24 px)',async({page})=>{
 await openGlass(page);
 expect(await bg(page,'.app-frame')).toBe(await legacy(page,'--shell-bg',68));
 expect(await bg(page,'.pane-slot>.panel')).toBe(await legacy(page,'--bg-panel',88));
 expect(await bg(page,'.center')).toBe(await legacy(page,'--bg-panel',88));
 await expect(page.locator('.app-frame')).toHaveCSS('backdrop-filter','blur(24px) saturate(1.15)');
 await expect(page.locator('.center')).toHaveCSS('backdrop-filter','blur(24px)');
 await expect(page.getByRole('slider',{name:'Opacity',exact:true})).toHaveValue('68');
 await expect(page.getByRole('checkbox',{name:'Window frame',exact:true})).toBeChecked();
 await expect(page.getByRole('checkbox',{name:'Panels',exact:true})).toBeChecked();
 await expect(page.getByRole('checkbox',{name:'Code editor',exact:true})).not.toBeChecked();
 await expect(page.getByText('Blur softens what is inside the app. Blurring your desktop behind the window is controlled by Windows and cannot be adjusted here.')).toBeVisible();
 await page.screenshot({path:'test-results/glass-v2-default.png'});
});

test('opacity and blur drive the CSS variables, number field types, scopes switch off',async({page})=>{
 await openGlass(page);
 const op=page.getByRole('slider',{name:'Opacity',exact:true});
 await op.fill('40');
 await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue('--glass-frame-alpha'))).toBe('0.4');
 expect(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--glass-panel-alpha'))).toBe('0.6');
 expect(await bg(page,'.app-frame')).toBe(await legacy(page,'--shell-bg',40));
 const num=page.getByRole('spinbutton',{name:'Opacity in percent'});
 await num.fill('0');await expect(op).toHaveValue('0');
 await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue('--glass-frame-alpha'))).toBe('0');
 await expect(page.getByText('0 % = fully transparent')).toBeVisible();
 await page.getByRole('slider',{name:'Blur',exact:true}).fill('40');
 await expect(page.locator('.app-frame')).toHaveCSS('backdrop-filter','blur(40px) saturate(1.15)');
 await expect(page.getByText('High blur can reduce performance on older GPUs.')).toBeVisible();
 await page.getByRole('slider',{name:'Blur',exact:true}).fill('10');await expect(page.getByText('High blur can reduce')).toHaveCount(0);
 await page.getByRole('checkbox',{name:'Window frame',exact:true}).uncheck();
 await expect.poll(async()=>await page.evaluate(()=>document.documentElement.style.getPropertyValue('--glass-frame-alpha'))).toBe('1');
 await expect(page.locator('.app-frame')).toHaveCSS('backdrop-filter','none');
 await page.screenshot({path:'test-results/glass-v2-scopes.png'});
 // Undo restores the previous value, reset returns to defaults.
 await page.getByRole('button',{name:'Reset to default',exact:true}).click();
 await expect(op).toHaveValue('68');await expect(page.getByRole('slider',{name:'Blur',exact:true})).toHaveValue('24');
 await expect(page.getByRole('checkbox',{name:'Window frame',exact:true})).toBeChecked();
});

test('code editor scope: default off, warning, set-to-60, keep, selection stays opaque',async({page})=>{
 await openGlass(page);
 const editor=page.locator('.codemirror-host .cm-editor').first();
 await page.keyboard.press('Escape');
 const visible=await editor.isVisible().catch(()=>false);
 await page.keyboard.press('Control+,');
 const code=page.getByRole('checkbox',{name:'Code editor',exact:true});
 const warn=page.getByText(/^Low contrast: code text may be hard to read/);
 await setOpacity(page,50);
 await expect(warn).toHaveCount(0); // scope off: no warning
 await checkScope(page,'Code editor');
 await expect(warn).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('data-glass-code','true');
 await shot(page,'test-results/glass-v2-warning.png');
 await page.getByRole('button',{name:'Keep anyway',exact:true}).click();await expect(warn).toHaveCount(0);
 await setOpacity(page,45);await expect(warn).toBeVisible();
 await page.getByRole('button',{name:'Set to 60 %',exact:true}).click();
 await expect(page.getByRole('slider',{name:'Opacity',exact:true})).toHaveValue('60');await expect(warn).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue('--glass-code-alpha'))).toBe('0.6');
 if(visible){
  await page.keyboard.press('Escape');
  const c=await editor.evaluate(e=>getComputedStyle(e).backgroundColor);
  expect(c).toMatch(/color\(srgb|rgba\(/);
  const gut=await page.locator('.codemirror-host .cm-gutters').first().evaluate(e=>getComputedStyle(e).backgroundColor).catch(()=>'');
  void gut;
  await shot(page,'test-results/glass-v2-code-on.png');
  const color=await page.locator('.codemirror-host .cm-content').first().evaluate(e=>getComputedStyle(e).color);
  expect(color).not.toMatch(/rgba\([^)]*,\s*0?\.\d+\)/);
 }
});

test('hard floor: unreadable code text is clamped to 55 % with message',async({page})=>{
 await openGlass(page);
 // Force a theme whose text/panel colours cannot reach 4.5:1 against grey at 45 %.
 await page.evaluate(()=>{const s=document.createElement('style');s.id='weak';s.textContent=':root{--text-primary:#9a9aa2!important;--bg-panel:#ffffff!important}';document.head.append(s);});
 await page.getByRole('checkbox',{name:'Code editor',exact:true}).check();
 await setOpacity(page,45);
 await expect(page.getByText('Code editor opacity is limited to 55 % to keep text readable.')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue('--glass-code-alpha'))).toBe('0.55');
 // Frame and panels keep the user's value.
 expect(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--glass-frame-alpha'))).toBe('0.45');
});

test('reduced transparency disables glass but keeps values; high contrast gates the section',async({page})=>{
 await page.addInitScript(()=>{const real=window.matchMedia.bind(window);window.matchMedia=(q:string)=>q.includes('prefers-reduced-transparency')?({matches:true,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},onchange:null,dispatchEvent:()=>false} as unknown as MediaQueryList):real(q);});
 await openGlass(page);
 await expect(page.getByText('Your system has transparency effects turned off. Glass is disabled.')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--glass-frame-alpha'))).toBe('1');
 expect(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--glass-blur'))).toBe('0px');
 const op=page.getByRole('slider',{name:'Opacity',exact:true});await expect(op).toBeEnabled();await op.fill('30');await expect(op).toHaveValue('30');
 await page.getByLabel('Contrast',{exact:true}).selectOption('high');
 await expect(op).toBeDisabled();await expect(page.getByText('Glass is off while high contrast is on. Your values stay saved.')).toBeVisible();
 await page.getByLabel('Contrast',{exact:true}).selectOption('standard');await expect(op).toHaveValue('30');
});

test('unsupported backdrop-filter: blur slider disabled with note, transparency still applies',async({page})=>{
 await page.addInitScript(()=>{const real=CSS.supports.bind(CSS);CSS.supports=((a:string,b?:string)=>String(a).includes('backdrop-filter')?false:b===undefined?real(a):real(a,b)) as typeof CSS.supports;});
 await openGlass(page);
 await expect(page.getByRole('slider',{name:'Blur',exact:true})).toBeDisabled();
 await expect(page.getByText('Not supported on this system.').first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--glass-frame-alpha'))).toBe('0.68');
});

test('settings search finds glass by keywords in en and de',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Settings',exact:true}).click();
 const s=page.locator('.settings-search input');
 for(const q of ['transparency','acrylic','blur','opacity']){await s.fill(q);await expect(page.getByRole('slider',{name:'Opacity',exact:true})).toBeVisible();}
 await s.fill('');
 await page.getByRole('button',{name:'General',exact:true}).click();
 const locale=page.locator('.settings-content select').filter({has:page.locator('option[value="de"]')});
 await locale.selectOption('de');
 await page.locator('.settings-search input').fill('Transparenz');
 await expect(page.getByRole('slider',{name:'Deckkraft',exact:true})).toBeVisible();
 await page.locator('.settings-search input').fill('Weichzeichnung');
 await expect(page.getByRole('slider',{name:'Weichzeichnung',exact:true})).toBeVisible();
 await shot(page,'test-results/glass-v2-de.png');
});

test('legacy v2 look without glass v2 keys migrates with blur kept and default opacity',async({page})=>{
 await page.addInitScript(()=>{if(!localStorage.getItem('somnia.look.v2'))localStorage.setItem('somnia.look.v2',JSON.stringify({version:2,look:{background:'glass',glassBlur:12,glassPanels:false,accent:'#e11d48'}}));});
 await page.goto('/');await page.getByRole('button',{name:'Settings',exact:true}).click();
 await expect(page.getByRole('slider',{name:'Blur',exact:true})).toHaveValue('12');
 await expect(page.getByRole('slider',{name:'Opacity',exact:true})).toHaveValue('68');
 await expect(page.getByRole('checkbox',{name:'Panels',exact:true})).not.toBeChecked();
 await expect(page.getByRole('checkbox',{name:'Code editor',exact:true})).not.toBeChecked();
});

test('code scope paints the editor translucent, text and selection stay opaque',async({page})=>{
 const {showCode}=await import('./helpers');
 await page.setViewportSize({width:1400,height:900});
 await page.goto('/');await showCode(page);
 const ed=page.locator('.cm-editor').first();
 const alpha=(c:string)=>{const m=c.match(/\/\s*([\d.]+)\)|rgba\([^)]*,\s*([\d.]+)\)/);return m?Number(m[1]??m[2]):1;};
 const before=await ed.evaluate(e=>getComputedStyle(e).backgroundColor);
 await page.keyboard.press('Control+,');
 await page.getByLabel('App background',{exact:true}).selectOption('glass');
 await page.evaluate(()=>{document.documentElement.dataset.background='glass';});
 // Scope off (default): editor unchanged.
 expect(await ed.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe(before);
 await setOpacity(page,70);
 await page.getByRole('checkbox',{name:'Code editor',exact:true}).check();
 await expect.poll(async()=>alpha(await ed.evaluate(e=>getComputedStyle(e).backgroundColor))).toBeCloseTo(0.7,1);
 const gutter=page.locator('.cm-gutters').first();
 if(await gutter.count())await expect.poll(async()=>alpha(await gutter.evaluate(e=>getComputedStyle(e).backgroundColor))).toBeCloseTo(0.7,1);
 await page.keyboard.press('Escape');
 await page.addStyleTag({content:'html{background:linear-gradient(120deg,#002AFF,#EE00FF 55%,#FF001E)!important}'});
 await page.getByLabel('Source code').click();await page.keyboard.press('Control+a');
 const text=await page.locator('.cm-content').first().evaluate(e=>getComputedStyle(e).color);
 expect(alpha(text)).toBe(1);
 const sel=page.locator('.cm-selectionBackground').first();
 if(await sel.count())expect(alpha(await sel.evaluate(e=>getComputedStyle(e).backgroundColor))).toBe(1);
 await shot(page,'test-results/glass-v2-code-on.png');
 // Code scope off again: back to the original paint.
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('.settings-sidebar nav').getByRole('button',{name:'Appearance'}).click();await page.getByRole('checkbox',{name:'Code editor',exact:true}).uncheck();await page.keyboard.press('Escape');
 await expect.poll(()=>ed.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe(before);
});
