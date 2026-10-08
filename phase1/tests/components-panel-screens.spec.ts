import {test,expect} from './fixtures';
// Visual evidence for the Components redesign (light theme). Screenshots land in tests/artifacts/.
test('components panel screenshots: default, search + hover + menu, drag state',async({page})=>{
 await page.goto('/');const f=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(f.locator('h1')).toBeVisible();
 await page.getByRole('button',{name:'Components panel',exact:true}).click();await expect(page.getByTestId('components-panel')).toBeVisible();
 await expect(page.getByRole('button',{name:/Assets panel/})).toHaveCount(0);
 await page.waitForTimeout(600);await page.screenshot({path:'tests/artifacts/components-a-default.png'});
 await page.getByLabel('Search components').fill('hero');
 const hero=page.getByRole('group',{name:'Card Hero',exact:true});await hero.hover();await page.waitForTimeout(400);
 await page.screenshot({path:'tests/artifacts/components-b-search-hover.png'});
 await hero.click({button:'right'});await expect(page.getByRole('menuitem',{name:'Duplicate to My library'})).toBeVisible();
 await page.screenshot({path:'tests/artifacts/components-b2-menu.png'});await page.keyboard.press('Escape');
 await page.getByLabel('Search components').fill('');
 const dt=await page.evaluateHandle(()=>new DataTransfer());
 await page.getByRole('button',{name:'Select Hero',exact:true}).dispatchEvent('dragstart',{dataTransfer:dt});
 await page.locator('iframe[title="Sandboxed design preview"]').contentFrame().locator('h1').evaluate(el=>{const r=el.getBoundingClientRect();const d=new DataTransfer();d.setData('application/x-somnia-component','x:y');el.dispatchEvent(new DragEvent('dragover',{dataTransfer:d,bubbles:true,cancelable:true,clientX:r.x+10,clientY:r.y+r.height*0.9}));});
 await expect(page.getByTestId('canvas-drop-pill')).toBeVisible();await expect(page.getByTestId('component-drag-hint')).toBeVisible();
 await page.screenshot({path:'tests/artifacts/components-c-drag.png'});
});
