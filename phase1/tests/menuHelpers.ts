import type {Locator,Page} from '@playwright/test';
/** Opens a top-level menu and makes `item` reachable: if it is not visible at the top level, open each submenu trigger in turn (a fresh menu per trigger, so an open submenu never covers the next trigger) until it shows. Menus are grouped into tree dropdowns. */
export async function revealMenuItem(page:Page,menu:string,item:Locator):Promise<Locator>{
 const button=page.getByRole('button',{name:menu,exact:true});
 await button.click();
 if(await item.isVisible())return item;
 const ids=await page.locator('[data-menu-submenu]').evaluateAll(els=>els.map(e=>e.getAttribute('data-menu-submenu')!));
 for(let i=0;i<ids.length;i++){
  if(i>0){for(let k=0;k<3&&await page.locator('.menu-popup').count();k++){await page.keyboard.press('Escape');await page.waitForTimeout(150);}await button.click();}
  await page.locator(`[data-menu-submenu="${ids[i]}"]`).hover();
  await item.waitFor({state:'visible',timeout:1500}).catch(()=>{});
  if(await item.isVisible())return item;
 }
 return item;
}
