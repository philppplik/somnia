import assert from 'node:assert/strict';import {startServer} from './agent-harness/harness.mjs';import {chromium} from '@playwright/test';import {mkdirSync} from 'node:fs';
const server=await startServer({port:1432});const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1024,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await page.goto(server.url+'/test/code-panels.html');await page.getByRole('button',{name:'Interactions',exact:true}).waitFor();
 await page.getByRole('textbox',{name:'Value',exact:true}).fill('/changed');await page.getByRole('button',{name:'Apply attribute',exact:true}).click();await page.getByRole('button',{name:'href /changed',exact:false}).waitFor();
 await page.getByRole('button',{name:'Source details',exact:true}).click();await page.getByText('UTF-8 bytes',{exact:true}).waitFor();
 await page.getByRole('button',{name:'820 px',exact:true}).click();assert.equal(await page.getByRole('spinbutton',{name:'Preview width',exact:true}).inputValue(),'820');
 const filter=page.getByRole('textbox',{name:'Filter elements',exact:true}).first();await filter.fill('hero');assert.equal(await page.getByRole('button',{name:'<main #hero>',exact:false}).count(),2);
 await filter.fill('');await page.getByRole('button',{name:'<a>',exact:false}).first().click();
 await page.locator('[data-testid=inspector-section-design] > button').click();await page.locator('[data-testid=shell-inspector]').evaluate(el=>{el.scrollTop=0;});
 mkdirSync('tests/artifacts/code-panels',{recursive:true});await page.screenshot({path:'tests/artifacts/code-panels/inspector.png'});assert.deepEqual(errors,[]);console.log('Code panel browser checks passed: attribute edit, source section, width preset, filter and reveal; no page errors.');
}finally{await browser.close();server.stop();}
