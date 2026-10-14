import {test,expect} from './fixtures';
/** CI-only full app. Not run locally: builders have no WASM toolchain. Local real-component checks live in test/animation-preview.tsx. */
function wav(seconds:number,rate=8000){const frames=seconds*rate,b=Buffer.alloc(44+frames*2);b.write('RIFF',0);b.writeUInt32LE(36+frames*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(Math.sin(i/12)*12000),44+i*2);return b;}
test('P5b audio import, trim, volume keys and clock-synced playback',async({page})=>{
 await page.goto('/');await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('animation');});await page.getByTestId('animation-create-blank').click();
 await page.getByTestId('animation-audio-input').setInputFiles({name:'tone.wav',mimeType:'audio/wav',buffer:wav(2)});
 await expect(page.getByTestId('animation-audio')).toBeVisible();await expect(page.getByTestId('animation-waveform').first()).toBeVisible();
 await page.getByLabel('Länge (s)').or(page.getByLabel('Length (s)')).fill('1');await page.keyboard.press('Enter');
 await page.getByLabel('Animate volume').or(page.getByLabel('Lautstärke animieren')).check();await expect(page.getByTestId('animation-keyrow-volume')).toBeVisible();
 await page.getByTestId('animation-play').click();
 const drift=await page.evaluate(async()=>{const m=await import('/src/lib/animation/audioPreview.ts');const s=(await import('/src/lib/animation/session.ts')).animationSession();const ctx=m.browserAudioContext()!;const a=[ctx.currentTime,s.getState().view.playhead/240000];await new Promise(r=>setTimeout(r,800));const b=[ctx.currentTime,s.getState().view.playhead/240000];return (b[1]-a[1])-(b[0]-a[0]);});
 expect(Math.abs(drift)).toBeLessThan(0.1);
 await page.getByTestId('animation-play').click();
 await page.getByTestId('animation-import-audio').click();
});
