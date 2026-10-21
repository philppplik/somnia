import {test,expect} from './fixtures';
import {switchStudio} from './helpers';

test('the active studio stays white on hover, in light and dark shells',async({page})=>{
 await page.goto('/');
 const pill=page.getByRole('radiogroup',{name:'Studios',exact:true});
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  const code=pill.getByRole('radio',{name:'Somnia Code',exact:true});
  await expect(code).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(code).toHaveCSS('color','rgb(24, 24, 27)');
  await code.hover();
  await expect(code).toHaveCSS('background-color','rgb(255, 255, 255)');
  const docs=pill.getByRole('radio',{name:'Somnia Documents',exact:true});
  await docs.click();
  await expect(docs).toHaveAttribute('aria-checked','true');
  await expect(docs).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(code).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await code.click();
 }
});

test('every visible studio shows a compact name on hover without changing selection',async({page})=>{
 await page.goto('/');
 const pill=page.getByRole('radiogroup',{name:'Studios',exact:true});
 for(const [name,short] of [['Somnia Code','Code'],['Somnia Documents','Docs'],['Somnia Sheets','Sheets'],['Slides','Slides'],['Somnia Sound','Sound']]){
  const button=pill.getByRole('radio',{name,exact:true});
  await button.hover();
  await expect(page.getByRole('tooltip')).toHaveText(short);
  await expect(button).toHaveAccessibleDescription(short);
  await expect(button).toHaveAttribute('title','');
  await expect(pill.locator('[aria-checked="true"]')).toHaveAccessibleName('Somnia Code');
 }
 await page.mouse.move(0,100);
 await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('keyboard focus exposes short names and keeps roving studio selection',async({page})=>{
 await page.goto('/');
 const pill=page.getByRole('radiogroup',{name:'Studios',exact:true});
 await pill.getByRole('radio',{name:'Somnia Code',exact:true}).focus();
 await page.keyboard.press('ArrowRight');
 const docs=pill.getByRole('radio',{name:'Somnia Documents',exact:true});
 await expect(docs).toBeFocused();
 await expect(docs).toHaveAttribute('aria-checked','true');
 await expect(docs).toHaveAttribute('tabindex','0');
 await expect(page.getByRole('tooltip')).toHaveText('Docs');
 await page.keyboard.press('Escape');
 await expect(page.getByRole('tooltip')).toHaveCount(0);
 await expect(docs).toBeFocused();
 await page.keyboard.press('End');
 const sound=pill.getByRole('radio',{name:'Somnia Sound',exact:true});
 await expect(sound).toBeFocused();
 await expect(sound).toHaveAttribute('aria-checked','true');
 await expect(sound).toHaveAttribute('tabindex','0');
 await page.keyboard.press('Home');
 await expect(pill.getByRole('radio',{name:'Somnia Code',exact:true})).toBeFocused();
});


test('all ten studio selections retain the global pill and show only short tab names',async({page})=>{
 await page.goto('/');
 const pill=page.getByRole('radiogroup',{name:'Studios',exact:true});
 const studioCount=await page.evaluate(async()=>{const m=await import('/src/lib/studios/index.ts');return m.listStudios().length;});await expect(pill.getByRole('radio')).toHaveCount(Math.min(5,studioCount));
 for(const [name,short] of [['Somnia Code','Code'],['Somnia Documents','Docs'],['Somnia Sheets','Sheets'],['Slides','Slides'],['Somnia Sound','Sound'],['Somnia Video','Video'],['Design','Design'],['Somnia Vector','Vector'],['Somnia Photos','Photos'],['Vibe Space','Vibe Space']]){
  await switchStudio(page,name);
  const button=pill.getByRole('radio',{name,exact:true});
  await expect(pill).toBeVisible();
  await expect(button).toHaveAttribute('aria-checked','true');
  await expect(button).toHaveText(short);
 }
 // A legacy raster request can remain active when manually entering Vector.
 // It must never remove the global studio navigation, including the way back.
 await page.evaluate(()=>window.dispatchEvent(new Event('somnia:edit-image')));
 await expect(pill).toBeVisible();
 await switchStudio(page,'Somnia Vector');
 await expect(pill).toBeVisible();
 await expect(pill.getByRole('radio',{name:'Somnia Vector',exact:true})).toHaveText('Vector');
 await pill.getByRole('radio',{name:'Somnia Code',exact:true}).click();
 await expect(pill.getByRole('radio',{name:'Somnia Code',exact:true})).toHaveAttribute('aria-checked','true');
});
