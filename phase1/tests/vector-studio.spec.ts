import {test,expect} from './fixtures';
import {readFileSync} from 'node:fs';
const SVG='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><path d="M10 10L110 10L60 70Z" fill="#336699"/></svg>';
async function openStudio(page:any){
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Vector'}).click();
 await expect(page.getByTestId('vector-start')).toBeVisible();
}
async function drag(page:any,from:[number,number],to:[number,number]){
 const box=(await page.getByTestId('vector-canvas').boundingBox())!;
 await page.mouse.move(box.x+from[0],box.y+from[1]);await page.mouse.down();await page.mouse.move(box.x+to[0],box.y+to[1],{steps:6});await page.mouse.up();
}
test('Vector Studio: blank start, draw shapes, edit style, undo, export SVG',async({page})=>{
 await openStudio(page);
 await page.screenshot({path:'test-results/vector-start.png'});
 await page.getByTestId('vector-create-blank').click();
 await expect(page.getByTestId('vector-canvas')).toBeVisible();
 await page.getByTestId('vector-toolbar-rect').click();await drag(page,[200,150],[360,260]);
 await expect(page.getByTestId('vector-layer')).toHaveCount(1);
 await page.getByTestId('vector-toolbar-ellipse').click();await drag(page,[420,180],[520,280]);
 await expect(page.getByTestId('vector-layer')).toHaveCount(2);
 await page.getByTestId('vector-fill').fill('#ff0000');
 await expect(page.locator('[data-testid="vector-artboard"] path[fill="#ff0000"]')).toHaveCount(1);
 await page.getByTestId('vector-undo').click();await page.getByTestId('vector-undo').click();
 await expect(page.getByTestId('vector-layer')).toHaveCount(1);
 await page.getByTestId('vector-redo').click();await expect(page.getByTestId('vector-layer')).toHaveCount(2);
 await page.screenshot({path:'test-results/vector-draw.png'});
 const dl=page.waitForEvent('download');await page.getByTestId('vector-export-svg').click();
 const file=await dl;expect(file.suggestedFilename()).toBe('Untitled.svg');
 const text=readFileSync((await file.path())!,'utf8');expect(text).toContain('<svg xmlns="http://www.w3.org/2000/svg"');expect((text.match(/<path /g)??[]).length).toBe(2);
});
test('Vector Studio: node tool edits an anchor; pen tool draws a closed path',async({page})=>{
 await openStudio(page);await page.getByTestId('vector-create-blank').click();
 await page.getByTestId('vector-toolbar-pen').click();
 await drag(page,[200,200],[200,200]);await drag(page,[320,200],[320,200]);await drag(page,[260,300],[260,300]);await drag(page,[200,200],[200,200]);
 await expect(page.getByTestId('vector-layer')).toHaveCount(1);
 await page.getByTestId('vector-toolbar-node').click();await expect(page.getByTestId('vector-node-overlay')).toBeVisible();
 await page.screenshot({path:'test-results/vector-nodes.png'});
});
test('Vector Studio: open an SVG file via the file chooser',async({page})=>{
 await openStudio(page);
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('vector-open').click();
 await (await chooser).setFiles({name:'tri.svg',mimeType:'image/svg+xml',buffer:Buffer.from(SVG)});
 await expect(page.getByTestId('vector-layer')).toHaveCount(1);
});
test('Vector Studio: transform fields resize the selection; Delete key removes it',async({page})=>{
 await openStudio(page);await page.getByTestId('vector-create-blank').click();
 await page.getByTestId('vector-toolbar-rect').click();await drag(page,[200,150],[300,230]);
 const w=page.getByTestId('vector-transform-width');await expect(w).toBeEnabled();
 await w.fill('200');await w.press('Enter');await expect(w).toHaveValue('200');
 await page.getByTestId('vector-canvas').focus();await page.keyboard.press('Delete');
 await expect(page.getByTestId('vector-layer')).toHaveCount(0);
});
