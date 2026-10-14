import {test} from './fixtures';
import assert from 'node:assert/strict';
test.use({sample:false});
/** Photos uses a test engine, not a WASM pixel/encoder verification. Design/Vector exports are real. */
for(const theme of ['light','dark'])test(`export heroes: ${theme}`,async({page})=>{
 test.setTimeout(45_000);

 page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await page.goto('/');await page.locator('[data-storage]').waitFor();
 const command=async(id,payload)=>page.evaluate(async({id,payload})=>{const m=await import('/src/lib/commands.ts');return m.executeCommand(id,payload);},{id,payload});
 await command('theme.'+theme);
 await page.getByRole('radio',{name:/^(Somnia )?Design$/}).click();
 await page.getByTestId('hero-action-main').waitFor();assert.equal(await page.getByTestId('hero-action-main').isDisabled(),true);
 await page.getByTestId('design-create-blank').click();await page.getByTestId('hero-action-main').click();await page.getByTestId('design-export-popover').waitFor();
 assert.equal(await page.getByTestId('design-export-popover').locator('select').inputValue(),'current');
 await page.screenshot({path:`test-results/hero-design-${theme}.png`});
 let d=page.waitForEvent('download');await page.getByTestId('design-export-popover').getByRole('button',{name:'Export',exact:true}).click();let download=await d;console.log('DESIGN SVG',download.suggestedFilename());
 await page.keyboard.press('Escape');
 await page.keyboard.press('Control+Shift+E');await page.getByTestId('design-export-popover').waitFor();d=page.waitForEvent('download');await page.getByTestId('design-export-popover').getByRole('button',{name:'Save project as .somdesign'}).click();download=await d;assert.ok(download.suggestedFilename().endsWith('.somdesign'));await page.keyboard.press('Escape');
 await command('design.artboard.add',{});await page.getByTestId('hero-action-main').click();await page.getByTestId('design-export-popover').locator('select').selectOption('all');
 d=page.waitForEvent('download');await page.getByTestId('design-export-popover').getByRole('button',{name:'Export',exact:true}).click();download=await d;console.log('DESIGN ZIP',download.suggestedFilename());await download.saveAs(`test-results/design-${theme}.zip`);
 await page.keyboard.press('Escape');
 await page.getByRole('radio',{name:/^(Somnia )?Vector$/}).click();assert.equal(await page.getByTestId('hero-action-main').isDisabled(),true);
 await command('vector.createBlank',{width:3000,height:2500});await page.getByTestId('hero-action-main').click();await page.getByTestId('vector-shell-export').waitFor();
 await page.getByTestId('vector-shell-export').locator('select').first().selectOption('png');await page.getByTestId('vector-shell-export').locator('select').nth(1).selectOption('4');
 assert.equal(await page.getByTestId('vector-export-dimensions').innerText(),'8192 × 8192 px');
 await page.getByTestId('hero-action-main').click();assert.equal(await page.getByTestId('vector-shell-export').isVisible(),true);
 await page.screenshot({path:`test-results/hero-vector-${theme}.png`});
 await page.getByTestId('vector-shell-export').locator('select').first().selectOption('svg');d=page.waitForEvent('download');await page.getByTestId('vector-shell-export').getByRole('button',{name:'Export SVG',exact:true}).click();download=await d;console.log('VECTOR SVG',download.suggestedFilename());
 await command('vector.resizePage',{width:400,height:300});await page.getByTestId('vector-shell-export').locator('select').first().selectOption('png');await page.getByTestId('vector-shell-export').locator('select').nth(1).selectOption('2');d=page.waitForEvent('download');await page.getByTestId('vector-shell-export').getByRole('button',{name:'Export PNG',exact:true}).click();download=await d;assert.ok(download.suggestedFilename().endsWith('.png'));await download.saveAs(`test-results/vector-export-${theme}.png`);
 await page.getByRole('radio',{name:'Somnia Photos'}).click();assert.equal(await page.getByTestId('hero-action-main').isDisabled(),true);
 // Real session and host with a deterministic engine double: generated WASM is not present in this checkout.
 await page.evaluate(async()=>{const m=await import('/src/lib/photos/studioSession.ts');const frame=()=>({id:0,ok:true,width:64,height:48,bytes:Uint8Array.from({length:64*48*4},(_,i)=>i%4===3?255:i%4===0?160:i%4===1?190:220).buffer});m.setPhotoEngineFactory(()=>({load:async()=>frame(),renderPhoto:async()=>frame(),exportPhoto:async()=>({id:0,ok:true,bytes:new Uint8Array([137,80,78,71]).buffer}),dispose(){}}));});
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('photos-open').click();await (await chooser).setFiles(new URL('./assets/photo.jpg',import.meta.url).pathname);
 await page.getByTestId('photos-workspace').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-testid="hero-action-main"]').disabled);
 await page.getByTestId('hero-action-main').click();await page.getByTestId('photos-export-popover').waitFor();
 await page.screenshot({path:`test-results/hero-photos-${theme}.png`});
 await page.getByTestId('photos-export-format').selectOption('jpeg');d=page.waitForEvent('download');await page.getByTestId('photos-export-popover').getByRole('button',{name:'Export',exact:true}).click();download=await d;console.log('PHOTOS JPEG PATH (engine double)',download.suggestedFilename());
 await page.keyboard.press('Escape');await page.keyboard.press('Control+Shift+E');await page.getByTestId('photos-export-popover').waitFor();assert.equal(await page.getByTestId('photos-export-format').inputValue(),'jpeg');await page.keyboard.press('Escape');
 await command('photos.crop.start',{});assert.equal(await page.getByTestId('hero-action-main').isDisabled(),true);await command('photos.crop.cancel',{});
 await page.setViewportSize({width:900,height:900});await page.getByTestId('hero-action-main').click();await page.getByTestId('photos-export-popover').waitFor();await page.screenshot({path:`test-results/hero-photos-narrow-${theme}.png`});

});
