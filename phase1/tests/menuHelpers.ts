import type {Locator,Page} from '@playwright/test';
const closeMenus=async(page:Page)=>{for(let k=0;k<4&&await page.getByRole('menu').count();k++){await page.keyboard.press('Escape');await page.waitForTimeout(300);}await page.waitForTimeout(200);};
/** Opens a top-level menu and makes `item` reachable: if it is not visible at the top level, open each submenu trigger in turn (a fresh menu per trigger, so an open submenu never covers the next trigger) until it shows. Menus are grouped into tree dropdowns. */
export async function revealMenuItem(page:Page,menu:string,item:Locator):Promise<Locator>{
 const button=page.getByRole('button',{name:menu,exact:true});
 // Start from a closed state: a previous pick may leave its popup mid-close, and a click on an open trigger would only close it.
 await closeMenus(page);
 await button.click();
 // The popup mounts asynchronously; reading the submenu triggers before it exists yields an empty list.
 await page.getByRole('menu').first().waitFor({state:'visible'});
 if(await item.isVisible())return item;
 const ids=await page.locator('[data-menu-submenu]').evaluateAll(els=>els.map(e=>e.getAttribute('data-menu-submenu')!));
 for(let i=0;i<ids.length;i++){
  if(i>0){await closeMenus(page);await button.click();await page.getByRole('menu').first().waitFor({state:'visible'});}
  const trigger=page.locator(`[data-menu-submenu="${ids[i]}"]`);
  await trigger.hover();
  await item.waitFor({state:'visible',timeout:1500}).catch(()=>{});
  // base-ui opens a submenu after a hover delay; fall back to the keyboard instead of a toggling click.
  if(!await item.isVisible()&&await trigger.getAttribute('aria-expanded')!=='true'){await trigger.focus().catch(()=>{});await page.keyboard.press('ArrowRight');await item.waitFor({state:'visible',timeout:1500}).catch(()=>{});}
  if(await item.isVisible())return item;
 }
 return item;
}
