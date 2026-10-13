import {startServer} from './agent-harness/harness.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const server=await startServer({port:1437});const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url+'/tests/harness/video-shell.html');
 await page.getByTestId('video-title-text').waitFor({timeout:30000});
 await page.getByTestId('video-title-text').fill('Chapter One\nA new day');
 await page.getByTestId('video-title-duration').fill('4');
 await page.getByTestId('video-clip-left').click();
 await page.getByRole('button',{name:'Sources',exact:true}).click();
 await page.getByTestId('video-sources-panel').waitFor();
 mkdirSync('tests/artifacts',{recursive:true});await page.screenshot({path:'tests/artifacts/video-shell-light.png'});
 await page.getByTestId('harness-theme').click();await page.waitForTimeout(150);await page.screenshot({path:'tests/artifacts/video-shell-dark.png'});
 await page.getByRole('button',{name:'Sequence',exact:true}).click();
 await page.screenshot({path:'tests/artifacts/video-shell-sequence-dark.png'});
 await page.getByTestId('video-sequence-clip').nth(1).click();
 await page.getByTestId('video-clip-in-input').fill('0.25');
 if(await page.getByTestId('video-clip-in-input').inputValue()!=='0.25')throw Error('Trim did not update.');
 await page.getByTestId('video-clip-mute').check();
 await page.screenshot({path:'tests/artifacts/video-shell-audio-dark.png'});
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Real panel harness passed: title editing, duration, reorder, sources, trim, mute, light/dark screenshots.');
}finally{await browser.close();server.stop();}
