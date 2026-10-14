import {test,expect} from '../../tests/fixtures';
import {DEFAULT_LOOK} from '../../src/lib/look';
import {SETTINGS_MIGRATION_SECTIONS} from './sections';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const label=process.env.SOMNIA_SETTINGS_CAPTURE??'candidate';
if(!/^[a-zA-Z0-9_-]{1,40}$/.test(label))throw Error('Invalid capture label');
const output=resolve('test-results/settings-migration',label);
for(const mode of ['light','dark','high'] as const)test(`${mode}: complete web Settings section evidence`,async({page})=>{
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();
 await page.evaluate(async ({mode,look})=>{const {patchState}=await import('/src/store/appStore.ts');const {setLocalePref}=await import('/src/lib/i18n.ts');setLocalePref('en');patchState({themeChoice:mode==='dark'?'dark':'light',theme:mode==='dark'?'dark':'light',contrast:mode==='high'?'high':'standard',settingsOpen:true,look});},{mode,look:DEFAULT_LOOK});
 await expect(page.locator('html')).toHaveAttribute('data-theme',mode==='dark'?'dark':'light');
 await expect(page.locator('html')).toHaveAttribute('data-contrast',mode==='high'?'high':'standard');
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await page.evaluate(()=>document.fonts.ready);mkdirSync(output,{recursive:true});
 const expected=SETTINGS_MIGRATION_SECTIONS.filter(([name])=>name!=='Window').map(([name])=>name);
 const actual=await dialog.locator('nav button').allTextContents();expect(actual.map(v=>v.trim())).toEqual(expected);
 const result=[];
 for(const [name,key] of SETTINGS_MIGRATION_SECTIONS){
  if(name==='Window'){result.push({section:name,status:'native-only, separate desktop capture required'});continue;}
  await dialog.locator('nav').getByRole('button',{name,exact:true}).click();
  const section=dialog.locator(`[data-settings-section="${name}"]`);await expect(section).toBeVisible();
  await section.evaluate(element=>{element.closest('.settings-content')!.scrollTop=0;});
  const capture=await section.evaluate(element=>{
   const controls=Array.from(element.querySelectorAll('input,select,textarea,button,[role="switch"],[role="checkbox"]')).map(el=>({tag:el.tagName.toLowerCase(),id:el.id,testId:el.getAttribute('data-testid'),slot:el.getAttribute('data-slot'),value:el.getAttribute('type')==='password'?'[redacted]':'value' in el?(el as HTMLInputElement).value:undefined,checked:'checked' in el?(el as HTMLInputElement).checked:undefined,type:el.getAttribute('type'),role:el.getAttribute('role'),name:el.getAttribute('aria-label')||el.textContent?.trim().slice(0,100)||'',describedBy:el.getAttribute('aria-describedby'),disabled:(el as HTMLInputElement).disabled??el.getAttribute('aria-disabled')==='true'}));
   const scroller=element.closest('.settings-content')!;return {controls,scrollHeight:scroller.scrollHeight,clientHeight:scroller.clientHeight};
  });
  await dialog.screenshot({path:resolve(output,`${mode}-${key}-top.png`),animations:'disabled',mask:[dialog.locator('input[type=password]')]});
  if(capture.scrollHeight>capture.clientHeight){await section.evaluate(element=>{const scroller=element.closest('.settings-content')!;scroller.scrollTop=scroller.scrollHeight;});await dialog.screenshot({path:resolve(output,`${mode}-${key}-bottom.png`),animations:'disabled',mask:[dialog.locator('input[type=password]')]});}
  result.push({section:name,status:'captured',...capture});
 }
 writeFileSync(resolve(output,`${mode}-manifest.json`),JSON.stringify({label,mode,sourceSha:process.env.GITHUB_SHA??'local-unverified',runtime:process.version,viewport:{width:1440,height:1000},results:result},null,2));
});
