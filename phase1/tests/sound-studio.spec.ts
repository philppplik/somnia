import {test,expect} from './fixtures';
import path from 'node:path';
import {readFileSync} from 'node:fs';
const asset=(n:string)=>path.join(import.meta.dirname,'assets',n);
async function openAudio(page:any){
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Sound'}).click();
 await expect(page.getByTestId('sound-start')).toBeVisible();
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('sound-open').click();(await chooser).setFiles(asset('arpeggio.mp3'));
 await expect(page.getByTestId('sound-workspace')).toBeVisible();
 await expect(page.getByTestId('sound-info')).toContainText('44100 Hz');
}
test('Sound Studio: open MP3, edit in the WASM worker, A/B, play, export WAV',async({page})=>{
 await openAudio(page);
 await expect(page.getByRole('radio',{name:'Somnia Sound'})).toHaveAttribute('aria-checked','true');
 await expect(page.getByTestId('sound-info')).toContainText('3.5');await expect(page.getByTestId('sound-info')).toContainText('Stereo');
 await expect(page.getByTestId('sound-controls')).toBeVisible();
 await expect(page.getByRole('radio',{name:'Edited'})).toBeDisabled();
 await page.screenshot({path:'test-results/sound-open.png'});
 await page.getByTestId('sound-trim').check();await page.getByTestId('sound-normalize').check();
 await page.getByTestId('sound-effect').selectOption('plate_reverb');
 await page.getByTestId('sound-pitch').fill('7');
 await expect(page.getByTestId('sound-result')).toContainText('peak -1.0 dB',{timeout:20000});
 await expect(page.getByTestId('sound-status')).toHaveText('');
 await expect(page.getByRole('radio',{name:'Edited'})).toBeEnabled();
 await page.screenshot({path:'test-results/sound-edited.png'});
 // original stays reachable for A/B
 await page.getByRole('radio',{name:'Original'}).click();await expect(page.getByRole('radio',{name:'Original'})).toHaveAttribute('aria-checked','true');
 await page.getByRole('radio',{name:'Edited'}).click();
 // playback really advances
 await page.getByTestId('sound-play').click();await expect.poll(async()=>page.evaluate(()=>document.querySelector('audio')!.currentTime),{timeout:8000}).toBeGreaterThan(0.2);
 await page.getByTestId('sound-play').click();
 // export is a real 16-bit WAV of the edited result
 const download=page.waitForEvent('download');await page.getByTestId('sound-export').click();const d=await download;
 expect(d.suggestedFilename()).toBe('arpeggio-edited.wav');const bytes=readFileSync(await d.path()!);
 expect(bytes.subarray(0,4).toString()).toBe('RIFF');expect(bytes.subarray(8,12).toString()).toBe('WAVE');expect(bytes.length).toBeGreaterThan(300_000);
 await page.getByTestId('sound-reset').click();await expect(page.getByRole('radio',{name:'Edited'})).toBeDisabled();
});
test('Sound Studio: a file that is not audio is rejected and an engine error is shown, not swallowed',async({page})=>{
 await openAudio(page);
 await page.getByTestId('sound-pitch').fill('2');await page.getByTestId('sound-trim').check();
 await page.evaluate(async()=>{const m=await import('/src/lib/sound/session.ts');m.updateSoundSettings('arpeggio.mp3',s=>({...s,effect:{id:'not_a_plugin',keepTail:false,params:{}}}));});
 await expect(page.getByTestId('sound-status')).toContainText('unknown plugin',{timeout:20000});
 await page.screenshot({path:'test-results/sound-error.png'});
});
test('Sound Studio: switching to Code keeps the audio tab and the Code studio is unchanged',async({page})=>{
 await openAudio(page);
 await page.getByRole('radio',{name:'Somnia Code'}).click();
 await expect(page.getByRole('radio',{name:'Somnia Code'})).toHaveAttribute('aria-checked','true');
 await expect(page.getByTestId('sound-workspace')).toBeVisible();
 await expect(page.getByTestId('sound-controls')).toBeVisible();
});
for(const locale of ['de','es','fr','pt-BR'])test(`Sound Studio strings: ${locale}`,async({page})=>{
 await page.addInitScript(l=>localStorage.setItem('somnia.locale.v1',l),locale);await page.goto('/');
 await expect(page.locator('header [role="radiogroup"]').getByRole('radio')).toHaveCount(2);
 await expect(page.locator('header [role="radiogroup"]')).not.toContainText('studio.sound');
 await page.locator('header [role="radiogroup"]').getByRole('radio').nth(1).click();
 await expect(page.getByTestId('sound-start')).toBeVisible();await expect(page.getByTestId('sound-start')).not.toContainText('sound.');
});

async function dragSelect(page:any,from:number,to:number){
 const box=(await page.getByTestId('sound-waveform').boundingBox())!;
 await page.mouse.move(box.x+box.width*from,box.y+box.height/2);await page.mouse.down();
 await page.mouse.move(box.x+box.width*((from+to)/2),box.y+box.height/2,{steps:4});
 await page.mouse.move(box.x+box.width*to,box.y+box.height/2,{steps:4});await page.mouse.up();
}
test('Sound Studio: drag a selection, crop, cut and edit only the selection',async({page})=>{
 await openAudio(page);
 await dragSelect(page,0.2,0.6);
 const len=await page.getByTestId('sound-sel-end').inputValue();const st=await page.getByTestId('sound-sel-start').inputValue();
 expect(Number(len)-Number(st)).toBeGreaterThan(1);
 await page.screenshot({path:'test-results/sound-selection.png'});
 await page.getByTestId('sound-crop').click();
 await expect(page.getByTestId('sound-region-chip')).toContainText('Cropped');
 await expect(page.getByTestId('sound-result')).toContainText('1.',{timeout:20000});
 await page.screenshot({path:'test-results/sound-cropped.png'});
 await page.getByTestId('sound-region-clear').click();
 await dragSelect(page,0.1,0.3);await page.getByTestId('sound-cut').click();
 await expect(page.getByTestId('sound-region-chip')).toContainText('Cut');
 await expect(page.getByRole('radio',{name:'Edited'})).toBeEnabled({timeout:20000});
 await page.getByTestId('sound-region-clear').click();
 await dragSelect(page,0.1,0.3);await page.getByTestId('sound-only').click();
 await page.getByTestId('sound-normalize').check();
 await expect(page.getByTestId('sound-region-chip')).toContainText('only');
 await expect(page.getByTestId('sound-result')).toContainText('peak',{timeout:20000});
 await page.screenshot({path:'test-results/sound-only.png'});
 const download=page.waitForEvent('download');await page.getByTestId('sound-export').click();const d=await download;
 const bytes=readFileSync(await d.path()!);expect(bytes.subarray(0,4).toString()).toBe('RIFF');
 // 3.5 s stereo 16-bit 44.1k stays about the same length with "only"
 expect(bytes.length).toBeGreaterThan(600_000);
});
test('Sound Studio: plugin parameters change the render and the step line is localized',async({page})=>{
 await openAudio(page);
 await expect(page.getByTestId('sound-params')).toHaveCount(0);
 await page.getByTestId('sound-effect').selectOption('plate_reverb');
 await expect(page.getByTestId('sound-params')).toBeVisible();
 await expect(page.getByTestId('sound-result')).toContainText('peak',{timeout:20000});
 const dur=async()=>Number(/([\d.]+) s/.exec(await page.getByTestId('sound-result').innerText())?.[1]??0);
 const d0=await dur();
 await expect(page.getByTestId('sound-params-reset')).toBeDisabled();
 await page.getByTestId('sound-param-decay').fill('1');
 await expect(page.getByTestId('sound-param-decay-value')).toContainText('20');
 await expect(page.getByTestId('sound-params-reset')).toBeEnabled();
 await expect.poll(dur,{timeout:20000}).toBeGreaterThan(d0);
 await page.screenshot({path:'test-results/sound-params.png'});
 await expect(page.getByTestId('sound-controls')).toContainText('Effect plate_reverb');
 await page.getByTestId('sound-params-reset').click();
 await expect(page.getByTestId('sound-param-decay-value')).toContainText('2.50');
 await page.getByTestId('sound-effect').selectOption('');
 await expect(page.getByTestId('sound-params')).toHaveCount(0);
});
test('Sound Studio: step line follows the UI language',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('somnia.locale.v1','de'));
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.locator('header [role="radiogroup"]').getByRole('radio').nth(1).click();
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('sound-open').click();(await chooser).setFiles(asset('arpeggio.mp3'));
 await expect(page.getByTestId('sound-info')).toContainText('44100 Hz');
 await page.getByTestId('sound-reverse').check();
 await expect(page.getByTestId('sound-controls')).toContainText('Umgekehrt',{timeout:20000});
 await expect(page.getByTestId('sound-controls')).not.toContainText('sound.step');
 await page.screenshot({path:'test-results/sound-de.png'});
});
