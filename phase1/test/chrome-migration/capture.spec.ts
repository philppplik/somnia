import {test,expect} from '../../tests/fixtures';
import {DEFAULT_LOOK} from '../../src/lib/look';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const label=process.env.SOMNIA_CHROME_CAPTURE??'candidate';if(!/^[a-zA-Z0-9_-]{1,40}$/.test(label))throw Error('Invalid label');
for(const mode of ['light','dark','high'] as const)test(`${mode}: safe save/close shell captures`,async({page})=>{
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();
 await page.evaluate(async({mode,look})=>{const{patchState}=await import('/src/store/appStore.ts');const{setLocalePref}=await import('/src/lib/i18n.ts');setLocalePref('en');patchState({theme:mode==='dark'?'dark':'light',themeChoice:mode==='dark'?'dark':'light',contrast:mode==='high'?'high':'standard',look});},{mode,look:DEFAULT_LOOK});
 await expect(page.locator('html')).toHaveAttribute('data-contrast',mode==='high'?'high':'standard');await page.evaluate(()=>document.fonts.ready);
 const dir=resolve('test-results/chrome-migration',label);mkdirSync(dir,{recursive:true});const manifest=[];
 for(const state of ['save','save-busy','save-error','close-memory','close-disk'] as const){
  await page.evaluate(async state=>{const{patchState}=await import('/src/store/appStore.ts');patchState({saveDialog:state.startsWith('save')?{busy:state==='save-busy',error:state==='save-error'?'Synthetic capture error':null}:null,closePrompt:state==='close-memory'?'memory':state==='close-disk'?'disk':null});},state);
  const dialog=page.getByRole(state.startsWith('save')?'dialog':'alertdialog');await expect(dialog).toBeVisible();
  manifest.push({state,role:await dialog.getAttribute('role'),buttons:await dialog.getByRole('button').evaluateAll(els=>els.map(el=>({text:el.textContent?.trim(),disabled:(el as HTMLButtonElement).disabled})))});
  await dialog.screenshot({path:resolve(dir,`${mode}-${state}.png`),animations:'disabled'});
 }
 writeFileSync(resolve(dir,`${mode}-manifest.json`),JSON.stringify({sourceSha:process.env.GITHUB_SHA??'unverified',mode,label,manifest},null,2));
 // Capture never invokes Save, Discard, folder IO, downloads or close-window effects.
});
