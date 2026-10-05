import {test,expect} from './fixtures';
import {showCode} from './helpers';
test('layer menu applies a flex layout to a container, undoable',async({page})=>{await page.goto('/');await showCode(page);
 await page.evaluate(()=>(window as any).__somnia.setSource('index.html','<!doctype html><html><head><title>t</title></head><body><div id="box"><p>a</p><p>b</p></div></body></html>'));
 await page.getByRole('button',{name:'div',exact:true}).first().click({button:'right'});
 await page.getByRole('menuitem',{name:'Layout: row, centered'}).click();
 await expect(page.getByRole('status').first()).toContainText('flex layout');
 await page.keyboard.press('Control+z');});
