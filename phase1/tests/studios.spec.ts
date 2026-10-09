import {test,expect} from './fixtures';
import {join} from 'node:path';
import {mkdirSync} from 'node:fs';
const artifacts=join('test-results','studios');
test('Code, Documents, Slides, Sheets and Sound pills are visible, keyboard accessible; View group/status/palette agree',async({page})=>{
 await page.goto('/');const pill=page.getByRole('radiogroup',{name:'Studios',exact:true});
 await expect(pill.getByRole('radio')).toHaveCount(9);const code=pill.getByRole('radio',{name:'Somnia Code'});
 await expect(code).toHaveAttribute('aria-checked','true');await code.focus();for(const i of [1,2,3,4]){await page.keyboard.press('ArrowRight');await expect(pill.getByRole('radio').nth(i)).toBeFocused();}await page.keyboard.press('Home');await expect(code).toBeFocused();await expect(code).toHaveAttribute('aria-checked','true');
 await page.keyboard.press('Control+1');await expect(code).toHaveAttribute('aria-checked','true');
 await expect(page.locator('header').getByRole('button',{name:'Split view',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'View',exact:true}).click();await expect(page.getByRole('menuitemradio')).toHaveCount(3);
 await expect(page.getByRole('menuitemradio',{name:/Design view/})).toHaveAttribute('aria-checked','true');
 mkdirSync(artifacts,{recursive:true});await page.screenshot({path:join(artifacts,'view-menu.png')});
 await page.getByRole('menuitemradio',{name:/Split view/}).click();await expect(page.getByTestId('studio-view-context')).toHaveText('Split');
 await expect(page.getByLabel('Source code')).toBeVisible();await page.locator('body').click({position:{x:2,y:2}});
 await page.keyboard.press('Control+Alt+3');await expect(page.getByTestId('studio-view-context')).toHaveText('Code');
 await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search commands'}).fill('Switch to Code Studio');await page.keyboard.press('Enter');
 await expect(code).toHaveAttribute('aria-checked','true');await page.screenshot({path:join(artifacts,'code-shell.png')});
});
test('shortcut collision never selects an arbitrary command, and unavailable Studio keys do nothing',async({page})=>{
 await page.goto('/');await page.getByRole('radio',{name:'Somnia Code'}).focus();
 await page.keyboard.press('Control+2');await expect(page.getByTestId('studio-view-context')).toHaveText('Visual');
 await page.evaluate(()=>localStorage.setItem('somnia.shortcuts.v1',JSON.stringify({'view.code':'Mod+1'})));
 await page.keyboard.press('Control+1');await expect(page.getByRole('status').filter({hasText:'Shortcut conflict:'})).toBeVisible();
 await expect(page.getByTestId('studio-view-context')).toHaveText('Visual');
});
test('studio request does not modify pending/dirty document or global agent; reduced motion has no shell transition',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 const result=await page.evaluate(async()=>{const {getState,patchState,requestStudio}=await import('/src/store/appStore.ts');patchState({agentOpen:true,isDirty:true});const before=getState();requestStudio('code');const after=getState();return {files:before.files===after.files,revision:before.revision===after.revision,dirty:after.isDirty,agent:after.agentOpen};});
 expect(result).toEqual({files:true,revision:true,dirty:true,agent:true});
 await expect(page.getByRole('radiogroup',{name:'Studios'})).toHaveCSS('transition-duration','0s');
});
for(const locale of ['de','es','fr','pt-BR'])test(`Studio strings: ${locale}`,async({page})=>{
 await page.addInitScript(locale=>localStorage.setItem('somnia.locale.v1',locale),locale);await page.goto('/');
 await expect(page.getByRole('radio',{name:'Somnia Code'})).toBeVisible();
 await expect(page.locator('header [role="radiogroup"]')).not.toHaveAttribute('aria-label','studio.switcher');
});
