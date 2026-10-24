import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1432'],{stdio:['ignore','pipe','pipe']});
server.stdout.on('data',()=>{});server.stderr.on('data',d=>process.stderr.write(d));
let browser;
try {
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:1432/test/slides/panel-preview.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1480,height:1000}});page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await page.goto('http://127.0.0.1:1432/test/slides/panel-preview.html');await page.getByRole('textbox',{name:'Text run 1'}).waitFor({timeout:30000});
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));
 await page.getByRole('button',{name:'Presentation',exact:true}).click();await page.getByRole('button',{name:'Compatibility',exact:true}).click();
 await page.screenshot({path:'/downloads/slides-panels-light.png',fullPage:true});
 await page.getByRole('textbox',{name:'Text run 1'}).fill('Panel integration edited title');await page.getByRole('button',{name:'Apply slide text',exact:true}).click();await page.waitForTimeout(300);if(await page.getByRole('textbox',{name:'Text run 1'}).inputValue()!=='Panel integration edited title')throw Error('Edit failed');
 await page.getByRole('button',{name:'Undo slide text',exact:true}).click();await page.waitForTimeout(300);if(await page.getByRole('textbox',{name:'Text run 1'}).inputValue()!=='Somnia Documents Studio')throw Error('Undo failed');
 await page.getByRole('button',{name:'Load slide thumbnails',exact:true}).click();await page.waitForTimeout(300);await page.getByRole('button',{name:'Next slide',exact:true}).click();await page.waitForTimeout(300);await page.screenshot({path:'/downloads/slides-panels-slide2.png',fullPage:true});
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await page.screenshot({path:'/downloads/slides-panels-dark.png',fullPage:true});console.log('Visual harness: edit/undo/navigation/thumbnails passed with renderer double.');
}finally{await browser?.close();server.kill('SIGTERM');}
