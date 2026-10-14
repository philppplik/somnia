import {test,expect} from '@playwright/test';
import type {Locator} from '@playwright/test';
const properties=['backgroundColor','color','borderTopWidth','borderTopStyle','borderTopColor','borderRadius','paddingTop','paddingRight','paddingBottom','paddingLeft','fontFamily','fontSize','fontWeight','lineHeight','boxShadow','outlineWidth','outlineStyle','outlineColor'];
const styles=(locator:Locator)=>locator.evaluate((element,keys)=>{const cs=getComputedStyle(element);return Object.fromEntries(keys.map(key=>[key,cs[key as keyof CSSStyleDeclaration]]));},properties);
for(const theme of ['light','dark'])for(const contrast of ['standard','high'])test(`${theme}/${contrast}: computed-style parity and gallery`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./');
 await page.evaluate(({theme,contrast})=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.contrast=contrast;},{theme,contrast});
 for(const name of ['input','select','textarea','panel','range'])expect(await styles(page.getByTestId(`ui-${name}`))).toEqual(await styles(page.getByTestId(`raw-${name}`)));
 expect(await styles(page.getByTestId('parity-number'))).toEqual(await styles(page.getByTestId('raw-number')));
 for(const status of ['Disabled','Read only']){
  await page.getByRole('button',{name:status,exact:true}).click();
  for(const name of ['input','textarea'])expect(await styles(page.getByTestId(`ui-${name}`))).toEqual(await styles(page.getByTestId(`raw-${name}`)));
  await page.getByRole('button',{name:status,exact:true}).click();
 }
 await page.getByTestId('raw-input').focus();const rawFocus=await styles(page.getByTestId('raw-input'));
 await page.getByTestId('ui-input').focus();expect(await styles(page.getByTestId('ui-input'))).toEqual(rawFocus);
 await page.getByRole('button',{name:'Raw menu',exact:true}).click();const rawMenu=await styles(page.getByTestId('raw-menu'));await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Open menu',exact:true}).click();await expect(page.getByRole('menu')).toBeVisible();expect(await styles(page.getByRole('menu'))).toEqual(rawMenu);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Raw popover',exact:true}).click();const rawPopover=await styles(page.getByTestId('raw-popover'));await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Open popover',exact:true}).click();expect(await styles(page.locator('[data-slot=popover]'))).toEqual(rawPopover);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Raw tooltip',exact:true}).hover();await expect(page.getByTestId('raw-tooltip')).toBeVisible();const rawTip=await styles(page.getByTestId('raw-tooltip'));
 await page.getByRole('button',{name:'Tooltip trigger',exact:true}).hover();await expect(page.locator('[data-slot=tooltip]')).toBeVisible();expect(await styles(page.locator('[data-slot=tooltip]'))).toEqual(rawTip);
 await page.mouse.move(0,0);await page.screenshot({path:`test-results/ds-p1-${theme}-${contrast}.png`,fullPage:true});expect(errors).toEqual([]);
});
test('Field ids, errors and caller hooks remain associated',async({page})=>{
 await page.goto('./');const field=page.getByLabel('Translated field label: Breite des ausgewählten Objekts');
 await expect(field).toHaveAttribute('aria-invalid','true');const ids=(await field.getAttribute('aria-describedby'))!.split(' ');
 expect(ids).toHaveLength(2);for(const id of ids)await expect(page.locator(`[id="${id}"]`)).toBeVisible();
 await expect(page.getByRole('alert')).toHaveText('A caller-supplied error');
});
test('NumberField rejects invalid/empty/range, commits once on Enter+blur, Escape restores and arrow step',async({page})=>{
 await page.goto('./');const n=page.getByTestId('number'),events=page.getByTestId('events');
 await n.fill('oops');await n.press('Enter');await expect(page.getByRole('alert').filter({hasText:'Enter a number'})).toBeVisible();await expect(events).toHaveText('');
 await n.fill('101');await n.press('Enter');await expect(page.getByRole('alert').filter({hasText:'Value must be between 0 and 100'})).toBeVisible();
 await n.fill('');await n.press('Enter');await expect(events).toHaveText('');
 await n.fill('20');await n.press('Enter');await n.blur();await expect(events).toHaveText('number:20');
 await n.fill('90');await n.press('Escape');await n.blur();await expect(n).toHaveValue('20');await expect(events).toHaveText('number:20\nnumber:cancel');
 await n.press('ArrowUp');await expect(n).toHaveValue('22');await n.blur();await expect(events).toHaveText('number:20\nnumber:cancel\nnumber:22');
 await page.getByRole('button',{name:'Mixed',exact:true}).click();await expect(n).toHaveValue('');await expect(n).toHaveAttribute('placeholder','Mixed');await n.blur();await expect(events).not.toContainText('number:0');
 await n.fill('25');await n.press('Enter');await expect(n).toHaveValue('25');
 await page.getByRole('button',{name:'Read only',exact:true}).click();await n.press('ArrowUp');await expect(n).toHaveValue('25');
});
test('RangeField keyboard gesture commits once, Escape/pointer-cancel cancel, disabled cancels active gesture',async({page})=>{
 await page.goto('./');const r=page.getByTestId('range'),events=page.getByTestId('events');
 await r.focus();await page.keyboard.down('ArrowRight');await page.keyboard.up('ArrowRight');await r.blur();await expect(events).toHaveText('range:begin\nrange:preview:31\nrange:commit:31');
 await page.getByRole('button',{name:'Reset fixture'}).click();await r.focus();await page.keyboard.down('ArrowRight');await r.press('Escape');await page.keyboard.up('ArrowRight');await expect(events).toHaveText('range:begin\nrange:preview:31\nrange:cancel:30');await expect(r).toHaveValue('30');
 await page.getByRole('button',{name:'Reset fixture'}).click();await r.dispatchEvent('pointerdown',{pointerId:9});await r.dispatchEvent('pointercancel',{pointerId:9});await r.blur();await expect(events).toHaveText('range:begin\nrange:cancel:30');
 await page.getByRole('button',{name:'Reset fixture'}).click();await r.dispatchEvent('pointerdown',{pointerId:9});await page.getByRole('button',{name:'Disabled',exact:true}).click();await expect(events).toContainText('range:cancel:30');await expect(events).not.toContainText('range:commit');
});
test('Menu navigates disabled items without activating them, supports arrows/typeahead/Escape and restores focus; popover returns focus',async({page})=>{
 await page.goto('./');const trigger=page.getByRole('button',{name:'Open menu',exact:true});await trigger.focus();await trigger.press('ArrowDown');
 await expect(page.getByRole('menuitem',{name:'First action'})).toBeFocused();await page.keyboard.press('ArrowDown');await expect(page.getByRole('menuitem',{name:'Disabled action'})).toBeFocused();await page.keyboard.press('Enter');await expect(page.getByRole('menu')).toBeVisible();await expect(page.getByTestId('events')).toHaveText('');await page.keyboard.press('ArrowDown');await expect(page.getByRole('menuitem',{name:'Last action'})).toBeFocused();
 await page.keyboard.press('Home');await expect(page.getByRole('menuitem',{name:'First action'})).toBeFocused();await page.keyboard.press('l');await expect(page.getByRole('menuitem',{name:'Last action'})).toBeFocused();
 await page.keyboard.press('Escape');await expect(trigger).toBeFocused();await expect(page.getByTestId('events')).toHaveText('');
 await page.getByRole('button',{name:'Open popover',exact:true}).click();await expect(page.getByRole('heading',{name:'Popover content'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Open popover',exact:true})).toBeFocused();
});
for(const scale of [0.85,1.3])test(`scale ${scale}: reduced motion, long labels and portals stay reachable`,async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('./');
 await page.evaluate(scale=>document.documentElement.style.setProperty('--ui-zoom',String(scale)),scale);
 const label=page.getByLabel('Translated field label: Breite des ausgewählten Objekts');await expect(label).toBeVisible();
 await page.getByRole('button',{name:'Open menu',exact:true}).click();await expect(page.getByRole('menu')).toBeVisible();
 const box=await page.getByRole('menu').boundingBox();expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(1281);
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Open menu',exact:true})).toBeFocused();
 await page.screenshot({path:`test-results/ds-p1-scale-${scale}.png`,fullPage:true});
});
test('RangeField real pointer gesture previews then commits exactly once',async({page})=>{
 await page.goto('./');const range=page.getByTestId('range'),box=await range.boundingBox();expect(box).not.toBeNull();
 await page.mouse.move(box!.x+box!.width*0.3,box!.y+box!.height/2);await page.mouse.down();await page.mouse.move(box!.x+box!.width*0.7,box!.y+box!.height/2,{steps:5});await page.mouse.up();await range.blur();
 const events=(await page.getByTestId('events').textContent())!;expect(events.split('\n').filter(e=>e.startsWith('range:commit:'))).toHaveLength(1);expect(events).toContain('range:preview:');expect(events).not.toContain('range:cancel:');
});
