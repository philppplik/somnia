import {startServer} from './agent-harness/harness.mjs';
import {chromium,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const outDir=resolve(process.env.SOUND_SCREENSHOTS??'tests/artifacts/sound-shell');
const server=await startServer({port:1433});const browser=await chromium.launch({...(process.env.SOUND_CHROME?{executablePath:process.env.SOUND_CHROME}:{}),args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1250}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url+'/sound-shell-harness.html');await expect(page.getByTestId('sound-workspace')).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'Select entire audio clip'}).click();await expect(page.getByTestId('sound-sel-end')).toHaveValue('8');
 await page.getByTestId('sound-crop').click();await expect(page.getByTestId('sound-region-chip')).toContainText('Cropped');await page.getByTestId('sound-region-clear').click();
 await page.getByTestId('sound-normalize').check();await expect(page.getByTestId('sound-export')).toBeDisabled();await page.getByTestId('sound-pitch').fill('5');
 await page.getByTestId('sound-effect').selectOption('plate_reverb');await expect(page.getByTestId('sound-params')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.soundHarness.getSoundSession('Field recording.wav').settings.pitch)).toBe(5);
 await page.getByPlaceholder('Filter audio clips').fill('Voice');await expect(page.getByRole('button',{name:'Voice take 02.wav 44 B',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/Field recording.wav 44/})).toHaveCount(0);await page.getByPlaceholder('Filter audio clips').fill('');
 mkdirSync(outDir,{recursive:true});await expect(page.getByTestId('sound-export')).toBeEnabled();await page.waitForTimeout(300);await page.screenshot({path:outDir+'/light.png'});await page.evaluate(()=>{document.documentElement.dataset.theme='dark';window.dispatchEvent(new Event('resize'));});await page.waitForTimeout(300);await page.screenshot({path:outDir+'/dark.png'});
 console.log(JSON.stringify({errors,tests:'selection/all/crop/clear, normalize, pitch, effect parameters, clip filtering',screenshots:[outDir+'/light.png',outDir+'/dark.png']}));if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();server.stop();}
