import {test,expect} from './fixtures';
// App E2E is CI-only: the real web harness needs the engine WASM artifacts.
for(const theme of ['light','dark'])test(`${theme}: yellow seed, primary ink, high contrast and reset`,async({page})=>{
 await page.goto('/');await page.keyboard.press('Control+,');
 await page.getByLabel('App theme',{exact:true}).selectOption(theme);
 // Set through the real Appearance field, preserving the extension copy-on-pick contract.
 await page.getByLabel('Accent colour',{exact:true}).fill('#ffff00');
 const read=()=>page.evaluate(()=>{const cs=getComputedStyle(document.documentElement);return Object.fromEntries(['--accent','--accent-fill','--accent-ink','--focus-ring'].map(k=>[k,cs.getPropertyValue(k).trim()]));});
 await expect.poll(async()=>(await read())['--accent-fill']).toBe('#ffff00');
 expect((await read())['--accent-ink']).toBe('#101014');
 await page.getByLabel('Contrast',{exact:true}).selectOption('high');
 await expect.poll(async()=>(await read())['--accent-fill']).toBe(theme==='light'?'#3c2caf':'#b4a6ff');
 expect((await read())['--accent']).toBe('#ffff00');
 expect((await read())['--focus-ring']).toBe(theme==='light'?'#3c2caf':'#b4a6ff');
 await page.reload();await page.keyboard.press('Control+,');
 expect((await read())['--accent']).toBe('#ffff00');
 await page.getByLabel('Contrast',{exact:true}).selectOption('standard');
 await expect.poll(async()=>(await read())['--accent-fill']).toBe('#ffff00');
 await page.getByRole('button',{name:'Reset look',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--accent-fill'))).toBe('');
});
