import {test,expect} from './fixtures';
import {readFileSync,mkdirSync} from 'node:fs';
test.use({sample:false});
const cats:Record<string,Record<string,string>>=Object.fromEntries(['en','de','es','fr','pt-BR'].map(l=>[l,JSON.parse(readFileSync(`src/locales/${l}.json`,'utf8'))]));
const tr=(l:string,k:string,p:Record<string,string|number>={})=>(cats[l][k]??k).replace(/\{(\w+)\}/g,(_,n)=>String(p[n]));
for(const locale of ['en','de','es','fr','pt-BR']){
 test(`${locale}: toolbar, consent, errors, conflict review and media empties retain source data`,async({page})=>{
  const t=(k:string,p?:Record<string,string|number>)=>tr(locale,k,p);
  await page.addInitScript(l=>localStorage.setItem('somnia.locale.v1',l),locale);
  await page.goto('/');await expect(page.getByRole('button',{name:t('cmd.view.split'),exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:t('cmd.edit.undo'),exact:true})).toBeVisible();
  await page.getByTestId('empty-state').getByRole('button',{name:t('empty.newFile'),exact:true}).click();await page.getByRole('button',{name:t('cmd.view.split'),exact:true}).click();
  const source='<!doctype html><html><body><h1>Untranslated source</h1><script>throw new Error("raw boom")</script></body></html>';
  await page.evaluate(async text=>{const m=await import('/src/store/appStore.ts' as string);(window as any).__somnia.setSource('index.html',text);m.patchState({livePreview:true});},source);
  const preview=page.getByLabel(t('rest.livePreview.livePreview'),{exact:true});
  await expect(preview).toContainText(t('finish2.preview.consentHint'));
  if(locale==='es'){mkdirSync('tests/artifacts',{recursive:true});await page.screenshot({path:'tests/artifacts/i18n-round2-es-consent.png'});}
  await preview.getByRole('button',{name:t('rest.livePreview.runScripts'),exact:true}).click();
  await expect(preview.getByRole('alert',{name:t('rest.livePreview.previewErrors')})).toContainText('raw boom');
  await expect(preview.getByRole('button',{name:new RegExp('raw boom')})).toHaveAttribute('aria-label',new RegExp('index.html'));
  await preview.getByRole('button',{name:t('rest.livePreview.togglePreviewScripts')}).click();
  await expect(preview).toContainText(t('finish2.preview.off'));
  const after=await page.evaluate(async()=>{const {getState,patchState}=await import('/src/store/appStore.ts' as string);patchState({livePreview:false,diskComparison:{path:'source-ä.html',disk:'<h1>Disk bytes</h1>',editor:'<h1>Editor bytes</h1>',apply:async(text:string)=>{(window as any).__reviewed=text;}}});return getState().files['index.html'];});expect(after).toBe(source);
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText(t('finish2.comparison.description'));
  await expect(dialog.getByRole('heading')).toHaveText(t('finish2.comparison.title',{path:'source-ä.html'}));
  await expect(dialog.getByRole('table',{name:t('finish2.diff.changes')})).toBeVisible();
  await expect(dialog.getByLabel(t('rest.diskComparison.diskSource'),{exact:true})).toHaveValue('<h1>Disk bytes</h1>');
  await expect(dialog.getByLabel(t('rest.diskComparison.reviewedMergedSource'),{exact:true})).toHaveValue('<h1>Editor bytes</h1>');
  mkdirSync('tests/artifacts',{recursive:true});
  if(locale==='fr'||locale==='pt-BR')await page.screenshot({path:`tests/artifacts/i18n-round2-${locale}-comparison.png`});
  let confirmationText='';page.once('dialog',async confirmation=>{confirmationText=confirmation.message();await confirmation.dismiss();});
  await dialog.getByRole('button',{name:t('rest.diskComparison.saveReviewedResult')}).click();
  expect(confirmationText).toBe(t('finish2.comparison.confirm',{path:'source-ä.html'}));
  expect(await page.evaluate(()=>(window as any).__reviewed)).toBeUndefined();
  await dialog.getByRole('button',{name:t('rest.diskComparison.cancel'),exact:true}).click();
  await page.evaluate(async()=>{const {addTextFiles}=await import('/src/lib/projectActions.ts' as string);addTextFiles([{name:'empty.md',text:''}]);});
  await expect(page.getByText(t('finish2.media.mdEmpty'),{exact:true})).toBeVisible();
  await page.evaluate(async()=>{const {addTextFiles}=await import('/src/lib/projectActions.ts' as string);addTextFiles([{name:'empty.svg',text:''}]);});
  await expect(page.getByText(t('finish2.media.svgEmpty'),{exact:true})).toBeVisible();
 });
 test(`${locale}: empty layer state`,async({page})=>{
  await page.addInitScript(l=>{sessionStorage.setItem('somnia.nofixture','1');localStorage.setItem('somnia.locale.v1',l);},locale);
  await page.goto('/');await expect(page.getByTestId('layers-empty-state')).toContainText(tr(locale,'finish2.layers.empty'));
  await expect(page.getByTestId('layers-empty-state')).toContainText(tr(locale,'finish2.layers.open'));
 });
}
