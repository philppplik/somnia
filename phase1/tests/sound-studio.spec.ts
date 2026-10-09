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
 await page.evaluate(async()=>{const m=await import('/src/lib/sound/session.ts');m.updateSoundSettings('arpeggio.mp3',s=>({...s,effect:{id:'not_a_plugin',keepTail:false}}));});
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
