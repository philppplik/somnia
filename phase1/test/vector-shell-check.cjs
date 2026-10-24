// Run against an existing Vite server: node test/vector-shell-check.cjs
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:1420/test/vector-shell-preview.html');await page.waitForSelector('[data-testid="vector-shell-style"]');
 const layers=page.locator('[data-testid="vector-shell-layers"]');
 await layers.getByPlaceholder('Filter layers').fill('orb');assert.equal(await layers.locator('li').count(),1);await layers.getByPlaceholder('Filter layers').fill('');
 const transform=page.locator('[data-testid="vector-shell-transform"]');
 await transform.getByLabel('X',{exact:true}).fill('150');await transform.getByLabel('X',{exact:true}).press('Tab');await page.waitForTimeout(100);assert.equal(await transform.getByLabel('X',{exact:true}).inputValue(),'150');
 await transform.getByRole('button',{name:'Duplicate',exact:true}).click();await page.waitForTimeout(100);assert.equal(await layers.locator('li').count(),4);
 await transform.getByRole('button',{name:'Delete',exact:true}).click();await page.waitForTimeout(100);assert.equal(await layers.locator('li').count(),3);
 await layers.getByRole('button',{name:'Orb',exact:true}).click();await page.waitForTimeout(100);
 await layers.locator('li').filter({has:page.getByRole('button',{name:'Orb',exact:true})}).getByRole('button',{name:'Hide',exact:true}).click();await page.waitForTimeout(100);assert.equal(await page.locator('[data-testid="vector-shell-style"]').count(),0);
 await layers.getByRole('button',{name:'Show',exact:true}).click();await layers.getByRole('button',{name:'Card',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export SVG',exact:true}).click();assert.equal((await download).suggestedFilename(),'Composition.svg');
 await page.goto('http://127.0.0.1:1420/test/vector-shell-preview.html?dark&node');await page.waitForSelector('[data-testid="vector-shell-node"]');
 await page.locator('[data-testid="vector-shell-node"]').getByRole('button',{name:'Smooth',exact:true}).click();assert.equal(await page.locator('[data-testid="vector-shell-node"]').getByRole('button',{name:'Smooth',exact:true}).getAttribute('aria-pressed'),'true');
 assert.deepEqual(errors,[]);console.log('Vector browser checks passed: filter, bounds, duplicate, delete, hide/show, SVG download, node kind, no page errors.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
