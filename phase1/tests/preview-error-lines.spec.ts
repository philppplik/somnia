import {test,expect} from './fixtures';
import {showCode} from './helpers';
import type {Page} from '@playwright/test';
async function errors(page:Page,files:Record<string,string>,active='index.html'){
 return page.evaluate(async({files,active})=>{
  const {buildPreview}=await import('/src/lib/livePreview.ts');
  const {mapPreviewErrorLocation}=await import('/src/lib/previewErrorLocation.ts');
  const preview=buildPreview(files,active,true),frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');
  const received:unknown[]=[];
  const on=(e:MessageEvent)=>{if(e.source===frame.contentWindow&&e.data?.somnia==='error')received.push({raw:e.data,location:mapPreviewErrorLocation(e.data,preview.scripts)});};
  window.addEventListener('message',on);frame.srcdoc=preview.html;document.body.append(frame);
  await new Promise(r=>setTimeout(r,400));window.removeEventListener('message',on);frame.remove();return received as any[];
 },{files,active});
}
test('maps multiple inline runtime and syntax errors after HTML serialization',async({page})=>{
 await page.goto('/');const result=await errors(page,{'index.html':'<!doctype html>\n<html>\n<head><style>h1{color:red}\n</style></head>\n<body>\n<script>\nthrow new Error("first");\n</script>\n<script>const broken = ;</script>\n<script>\nthrow new Error("third");\n</script></body></html>'});
 
 expect(result).toHaveLength(3);expect(result[0].location).toEqual({file:'index.html',line:7,col:7});
 expect(result[1].location?.line).toBe(9);expect(result[2].location).toEqual({file:'index.html',line:11,col:7});
});
test('maps relative JS runtime, parse errors and rejection stacks to their own files',async({page})=>{
 await page.goto('/');const result=await errors(page,{'pages/index.html':'<script src="../js/run.js?version=1"></script>\n<script src="../js/broken.js"></script>\n<script src="../js/async.js"></script>',
 'js/run.js':'\n\nthrow new Error("external");','js/broken.js':'\nconst fail = ;','js/async.js':'\nPromise.reject(new Error("async"));'},'pages/index.html');
 expect(result).toHaveLength(3);
 expect(result[0].location).toEqual({file:'js/run.js',line:3,col:7});expect(result[1].location?.file).toBe('js/broken.js');expect(result[1].location?.line).toBe(2);
 expect(result[2].location).toEqual({file:'js/async.js',line:2,col:16});
});
test('does not invent locations for string rejections or resource failures',async({page})=>{
 await page.goto('/');const result=await errors(page,{'index.html':'<script>Promise.reject("plain");</script><img src="https://invalid.test/a.png">'});
 expect(result.length).toBeGreaterThanOrEqual(2);expect(result.every(e=>e.location===null)).toBe(true);
});
test('clicking a mapped error opens its source line and leaves HTML preview running',async({page})=>{
 await page.goto('/');await showCode(page);
 await page.evaluate(async()=>{
  const {applyOperations}=await import('/src/store/appStore.ts');
  applyOperations([{type:'createFile',file:'runtime.js',text:'\n\nthrow new Error("click me");'}]);
  (window as any).__somnia.setSource('index.html','<html><head></head><body><h1>Page stays here</h1><script src="runtime.js"></script></body></html>');
 });
 await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search commands'}).fill('live preview');await page.getByRole('option',{name:/live preview/i}).click();
 await page.getByRole('button',{name:'Run scripts',exact:true}).click();
 const error=page.getByRole('button',{name:/Open runtime.js line 3 column 7/});await expect(error).toBeVisible();
 await page.screenshot({path:'tests/artifacts/preview-error-lines.png'});
 await error.click();
 await expect(page.getByLabel('Source code')).toContainText('click me');
 const state=await page.evaluate(async()=>{const {getState}=await import('/src/store/appStore.ts');return getState();});
 expect(state.jumpTo).toMatchObject({file:'runtime.js',line:3,col:7});
 await expect(page.frameLocator('iframe[title="Live preview frame"]').getByText('Page stays here')).toBeVisible();
});

test('maps thrown SyntaxError instances and modules without mistaking runtime coordinates for parse coordinates',async({page})=>{
 await page.goto('/');const result=await errors(page,{'index.html':'<html><head></head><body>\n<script>\nthrow new SyntaxError("runtime syntax");\n</script>\n<script type="module">\nthrow new Error("module error");\n</script></body></html>'});
 expect(result).toHaveLength(2);expect(result[0].location).toEqual({file:'index.html',line:3,col:7});expect(result[1].location).toEqual({file:'index.html',line:6,col:7});
});
test('maps CRLF files, same-line scripts, and skips inert template/data scripts',async({page})=>{
 await page.goto('/');const result=await errors(page,{'index.html':'<template><script>throw new Error("inert");</script></template><script type="application/json">{"x":1}</script>\r\n<script>throw new Error("same line");</script>'});
 expect(result).toHaveLength(1);expect(result[0].location).toEqual({file:'index.html',line:2,col:15});
});

test('maps syntax errors in modules and tags with quoted greater-than attributes',async({page})=>{
 await page.goto('/');const result=await errors(page,{'index.html':'<script data-test=">">const broken = ;</script>\n<script type="module">\nconst fail = ;\n</script>'});
 expect(result).toHaveLength(2);expect(result[0].location).toEqual({file:'index.html',line:1,col:38});expect(result[1].location?.line).toBe(3);
});
test('ignores messages from a prior preview generation',async({page})=>{
 await page.goto('/');await showCode(page);await page.evaluate(()=>(window as any).__somnia.setSource('index.html','<body><h1>Current</h1></body>'));
 await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search commands'}).fill('live preview');await page.getByRole('option',{name:/live preview/i}).click();await page.getByRole('button',{name:'Run scripts',exact:true}).click();
 await expect(page.frameLocator('iframe[title="Live preview frame"]').getByText('Current')).toBeVisible();
 await page.evaluate(()=>{const frame=document.querySelector('iframe[title="Live preview frame"]') as HTMLIFrameElement;window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,data:{somnia:'error',id:'old-preview',message:'stale error'}}));});
 await expect(page.getByRole('alert',{name:'Preview errors'})).toHaveCount(0);
});
