import {test,expect} from '@playwright/test';
test('new-studio numeric adapters commit once, validate/cancel, reset identity, lock and collapse',async({page})=>{
 await page.goto('./');const proof=page.getByTestId('studio-adoption-proof'),position=proof.getByLabel('Position X',{exact:true}),events=proof.getByTestId('studio-adoption-events');
 await position.fill('12.5');await position.press('Enter');await position.blur();await expect(events).toHaveText('commit:12.5');
 await position.fill('bad');await position.press('Enter');await expect(proof.getByRole('alert')).toContainText('Invalid value');await expect(events).toHaveText('commit:12.5');await position.press('Escape');await expect(position).toHaveValue('12.5');
 await position.fill('101');await position.press('Enter');await expect(proof.getByRole('alert')).toBeVisible();await position.press('Escape');
 await position.fill('99');await proof.getByRole('button',{name:'Change selection identity'}).dispatchEvent('click');await expect(position).toHaveValue('12.5');
 const width=proof.getByLabel('Width',{exact:true});await width.fill('20');await width.press('Enter');await width.blur();await expect(events).toHaveText('commit:12.5|interface:20');
 const name=proof.getByLabel('Layer name',{exact:true});await name.fill('Discard');await name.press('Escape');await expect(name).toHaveValue('Layer');await expect(events).not.toContainText('Discard');await name.fill('Rectangle');await name.press('Enter');await expect(events).toContainText('name:Rectangle');
 await proof.getByRole('button',{name:'Layout',exact:true}).click();await expect(proof.getByText('Selection-scoped layout fields')).toBeHidden();await expect(proof.getByRole('button',{name:'Layout',exact:true})).toHaveAttribute('aria-expanded','false');
 await proof.getByRole('button',{name:'Toggle inspector lock'}).click();await expect(position).toBeDisabled();await expect(width).toBeDisabled();
});
test('adapter screenshots use actual production styles',async({page})=>{
 await page.goto('./');const proof=page.getByTestId('studio-adoption-proof');for(const theme of ['light','dark']){await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.contrast='standard';},theme);await proof.screenshot({path:`test-results/ds-studio-adoption-${theme}.png`});}
});
for(const theme of ['light','dark'])for(const density of ['compact','normal','comfortable'])test(`${theme}/${density}: inspector token/focus/contrast audit`,async({page})=>{
 await page.goto('./');await page.evaluate(({theme,density})=>{const root=document.documentElement;root.dataset.theme=theme;root.dataset.contrast='standard';const api=(window as any).dsAppearance;api.applyLook({...api.DEFAULT_LOOK,density});},{theme,density});
 const proof=page.getByTestId('studio-adoption-proof'),input=proof.getByLabel('Position X',{exact:true});await input.focus();
 const audit=await input.evaluate(el=>{const cs=getComputedStyle(el),root=getComputedStyle(document.documentElement);const channels=(s:string)=>s.match(/[\d.]+/g)!.slice(0,3).map(Number);const lum=(s:string)=>channels(s).map(x=>{const n=x/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);const a=lum(cs.color),b=lum(cs.backgroundColor);return {contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),outline:cs.outlineStyle,width:parseFloat(cs.outlineWidth),gap:root.getPropertyValue('--gap').trim(),radius:root.getPropertyValue('--r-outer').trim(),labels:el.labels?.length};});
 expect(audit.contrast).toBeGreaterThanOrEqual(4.5);expect(audit.width).toBeGreaterThanOrEqual(2);expect(audit.outline).not.toBe('none');expect(audit.labels).toBe(1);expect(audit.gap).toBe({compact:'3px',normal:'6px',comfortable:'10px'}[density]);expect(audit.radius).toBe('25px');
 await proof.screenshot({path:`test-results/ds-inspector-audit-${theme}-${density}.png`});
});
test('3D replacement review announces title/body, cancel focus, traps focus, Escape and returns focus',async({page})=>{
 await page.goto('./');const trigger=page.getByRole('button',{name:'Open replacement review'});await trigger.click();const dialog=page.getByRole('alertdialog');await expect(dialog).toBeVisible();await expect(dialog).toHaveAccessibleName(/Replace/);await expect(dialog).toHaveAccessibleDescription(/not exported/i);
 const cancel=dialog.getByRole('button',{name:/Keep scene/i});await expect(cancel).toBeFocused();await dialog.screenshot({path:'test-results/ds-3d-replace-dialog.png',animations:'disabled'});await cancel.press('Shift+Tab');await expect.poll(()=>dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();await expect(page.getByTestId('studio-adoption-events')).not.toContainText('replace-confirmed');
});
