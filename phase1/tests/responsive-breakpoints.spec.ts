import {test,expect} from './fixtures';
async function panel(page:import('@playwright/test').Page){
 await page.goto('/');await page.getByRole('button',{name:'CSS panel'}).click();await page.getByRole('tab',{name:'Responsive',exact:true}).click();
 return page.getByRole('region',{name:'Responsive breakpoints'});
}
test('query add/edit is source-backed and undoable, scope and preview remain independent',async({page})=>{
 const ui=await panel(page);await expect(ui).toBeVisible();
 await ui.getByLabel('New breakpoint width').fill('768');await ui.getByRole('button',{name:'Add query',exact:true}).click();
 const width=ui.getByRole('spinbutton',{name:/^max-width in .* line/}).filter({visible:true}).last();
 await expect(width).toHaveValue('768');await width.fill('720');await width.press('Enter');await expect(width).toHaveValue('720');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(ui.getByRole('spinbutton',{name:/^max-width in .* line/}).last()).toHaveValue('768');
 await ui.getByRole('button',{name:'Edit at max-width 768 px',exact:true}).click();await expect(page.getByLabel('Viewport width',{exact:true})).toHaveValue('768');
 await page.getByRole('button',{name:'Desktop viewport',exact:true}).click();await expect(ui.getByLabel('Responsive edit scope')).toHaveValue('768');
 await expect(ui).toContainText('Visual edits apply at ≤ 768 px.');
 await ui.getByLabel('Responsive edit scope').selectOption('base');await page.getByRole('button',{name:'Mobile viewport',exact:true}).click();await expect(ui).toContainText('Visual edits apply at all widths.');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(ui.getByRole('button',{name:'Edit at max-width 768 px',exact:true})).toHaveCount(0);
 
});
test('invalid widths never change source and duplicate add reports an error',async({page})=>{
 const ui=await panel(page);await ui.getByLabel('New breakpoint width').fill('199');await expect(ui.getByRole('button',{name:'Add query',exact:true})).toBeDisabled();
 await ui.getByLabel('New breakpoint width').fill('777');await ui.getByRole('button',{name:'Add query',exact:true}).click();await ui.getByRole('button',{name:'Add query',exact:true}).click();await expect(ui.getByRole('alert')).toContainText('Duplicate queries');
 const width=ui.getByRole('spinbutton',{name:/^max-width in .* line/}).last();await width.fill('0');await width.press('Enter');await expect(ui.getByRole('alert')).toContainText('whole width');
 await width.fill('777');await width.press('Enter');await expect(ui.getByRole('button',{name:'Edit at max-width 777 px',exact:true})).toBeVisible();
});

test('explicit max-width controls inspector and resize rules, not the preview preset',async({page})=>{
 const ui=await panel(page);await ui.getByRole('button',{name:'Add query',exact:true}).click();await ui.getByRole('button',{name:'Edit at max-width 768 px',exact:true}).click();
 await page.getByRole('button',{name:'Desktop viewport',exact:true}).click();
 const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await frame.locator('h1').click();
 await page.getByLabel('CSS property',{exact:true}).selectOption('color');await page.getByLabel('CSS value',{exact:true}).fill('#123456');await page.getByRole('button',{name:'Apply CSS rule',exact:true}).click();
 await expect(frame.locator('h1')).not.toHaveCSS('color','rgb(18, 52, 86)');
 await page.getByRole('button',{name:'Mobile viewport',exact:true}).click();await expect(frame.locator('h1')).toHaveCSS('color','rgb(18, 52, 86)');
 const handle=page.getByRole('button',{name:'Resize selection',exact:true});const b=await handle.boundingBox();if(!b)throw Error('No resize handle');
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+20,b.y+b.height/2+15,{steps:4});await page.mouse.up();
 const css=await page.evaluate(async()=> (await import(/* @vite-ignore */ '/src/store/appStore.ts')).getState().files['somnia-styles.css']);expect(css).toContain('@media (max-width: 768px)');expect(css).not.toContain('600px');
 await page.screenshot({path:'/downloads/responsive-panel.png'});
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:'/downloads/responsive-panel-dark.png'});
});
