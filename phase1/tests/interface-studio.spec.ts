/** CI-only application acceptance: shell, gestures, history, snapshots and recovery. */
import {test,expect} from '@playwright/test';
test('Interface layers/properties, cancel/commit gesture, undo and reload recovery',async({page})=>{
 await page.goto('/');await page.getByRole('radio',{name:'Interface',exact:true}).click();await page.getByRole('button',{name:'Create blank document',exact:true}).click();
 await page.getByRole('button',{name:'Frame',exact:true}).click();await page.getByRole('button',{name:'Text',exact:true}).click();
 const canvas=page.getByTestId('interface-canvas');const text=canvas.getByRole('button',{name:'Text',exact:true});await expect(text).toBeVisible();
 const x=page.getByLabel('X',{exact:true});const previous=await x.inputValue();const bounds=await text.boundingBox();if(!bounds)throw Error('Missing layer bounds');
 await page.mouse.move(bounds.x+20,bounds.y+20);await page.mouse.down();await page.mouse.move(bounds.x+50,bounds.y+30);await page.keyboard.press('Escape');await page.mouse.up();await expect(x).toHaveValue(previous);
 await page.mouse.move(bounds.x+20,bounds.y+20);await page.mouse.down();await page.mouse.move(bounds.x+50,bounds.y+30);await page.mouse.up();await expect(x).not.toHaveValue(previous);
 await text.focus();await page.keyboard.press('Control+z');await expect(x).toHaveValue(previous);await page.keyboard.press('Control+Shift+z');await expect(x).not.toHaveValue(previous);
 const width=page.getByLabel('Width',{exact:true});await width.fill('-1');await width.press('Enter');await expect(page.getByRole('alert')).toContainText('Invalid geometry');await expect(width).toHaveValue('160');
 const recovery=await page.evaluate(()=>localStorage.getItem('somnia.interface.recovery.v1'));expect(recovery).toBeTruthy();
 page.on('dialog',d=>d.accept());await page.reload();await page.getByRole('radio',{name:'Interface',exact:true}).click();await expect(canvas.getByRole('button',{name:'Text',exact:true})).toBeVisible();
 await expect(canvas.getByRole('status').last()).toHaveText('Unsaved changes');
 await page.getByLabel('Open snapshot',{exact:true}).setInputFiles({name:'snapshot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(JSON.parse(recovery!).document))});await expect(canvas.getByRole('status').last()).toHaveText('Saved snapshot');
 // Invalid import must not replace the working document.
 await page.getByLabel('Open snapshot',{exact:true}).setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":99}')});await expect(page.getByRole('alert')).toContainText('Invalid or unsupported');await expect(canvas.getByRole('button',{name:'Text',exact:true})).toBeVisible();
});
test('Interface auto layout and component variants are editable and undoable',async({page})=>{
 await page.goto('/');await page.getByRole('radio',{name:'Interface',exact:true}).click();await page.getByRole('button',{name:'Create blank document',exact:true}).click();await page.getByRole('button',{name:'Frame',exact:true}).click();
 await page.getByLabel('Direction',{exact:true}).selectOption('row');await page.getByLabel('Gap',{exact:true}).fill('20');await page.getByLabel('Gap',{exact:true}).press('Enter');
 await page.getByRole('button',{name:'Rectangle',exact:true}).click();const rectangle=page.getByTestId('interface-canvas').getByRole('button',{name:'Rectangle',exact:true});await expect(rectangle).toBeVisible();
 const layerList=page.getByRole('list',{name:'Pages and layers',exact:true});await layerList.getByRole('button',{name:'Frame',exact:true}).click();await page.getByRole('button',{name:'Create component',exact:true}).click();await page.getByRole('button',{name:'Add variant',exact:true}).click();await page.getByRole('button',{name:'Create instance',exact:true}).click();
 await page.getByLabel('Variant',{exact:true}).selectOption({label:'Variant 2'});await expect(page.getByRole('button',{name:'Reset overrides',exact:true})).toBeVisible();await page.getByRole('button',{name:'Detach instance',exact:true}).click();await expect(page.getByRole('button',{name:'Create component',exact:true})).toBeVisible();
});
test('Interface local variables, grid, reviewed SVG/PNG and frozen handoff',async({page})=>{
 await page.goto('/');await page.getByRole('radio',{name:'Interface',exact:true}).click();await page.getByRole('button',{name:'Create blank document',exact:true}).click();await page.getByRole('button',{name:'Frame',exact:true}).click();await page.getByLabel('Direction',{exact:true}).selectOption('grid');await page.getByLabel('Columns',{exact:true}).fill('2');await page.getByLabel('Columns',{exact:true}).press('Enter');
 await page.getByText('Variables and styles',{exact:true}).click();await page.getByRole('button',{name:'Add color',exact:true}).click();await page.getByLabel('Fill',{exact:true}).last().selectOption({index:1});
 await page.getByText('Export and handoff',{exact:true}).click();await page.getByRole('button',{name:'Review frame export',exact:true}).click();const svgDownload=page.waitForEvent('download');await page.getByRole('button',{name:'SVG',exact:true}).click();expect((await svgDownload).suggestedFilename()).toMatch(/\.svg$/);
 const pngDownload=page.waitForEvent('download');await page.getByRole('button',{name:'PNG',exact:true}).click();expect((await pngDownload).suggestedFilename()).toMatch(/\.png$/);
 await page.getByLabel('Ready for handoff (manual)',{exact:true}).check();await page.getByRole('button',{name:'Freeze handoff',exact:true}).click();await expect(page.getByRole('button',{name:'Download handoff JSON',exact:true})).toBeVisible();await expect(page.getByTestId('interface-canvas').getByRole('status').last()).toHaveText('Unsaved changes');
});
test('Interface frame-local SVG import, basic pen cancel and committed path',async({page})=>{
 await page.goto('/');await page.getByRole('radio',{name:'Interface',exact:true}).click();await page.getByRole('button',{name:'Create blank document',exact:true}).click();await page.getByRole('button',{name:'Frame',exact:true}).click();await page.getByText('Import local image/SVG',{exact:true}).click();await page.getByLabel('Import local image/SVG',{exact:true}).setInputFiles({name:'local.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg width="100" height="100"><circle cx="50" cy="50" r="20" fill="#7756e8"/></svg>')});await expect(page.getByTestId('interface-canvas').getByRole('button',{name:'Ellipse',exact:true})).toBeVisible();
 await page.getByRole('list',{name:'Pages and layers',exact:true}).getByRole('button',{name:'Frame',exact:true}).click();await page.getByRole('button',{name:'Draw pen path',exact:true}).click();await page.getByTestId('interface-canvas').getByRole('button',{name:'Frame',exact:true}).click({position:{x:100,y:100}});await page.getByRole('button',{name:'Cancel path',exact:true}).click();await expect(page.getByTestId('interface-canvas').getByRole('button',{name:'Path',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Draw pen path',exact:true}).click();const frame=page.getByTestId('interface-canvas').getByRole('button',{name:'Frame',exact:true});await frame.click({position:{x:100,y:100}});await frame.click({position:{x:160,y:160}});await page.getByRole('button',{name:'Finish path',exact:true}).click();await expect(page.getByTestId('interface-canvas').getByRole('button',{name:'Path',exact:true})).toBeVisible();
});
