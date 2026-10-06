import type {Page} from '@playwright/test';
export const open=async(page:Page,title:string)=>{await page.getByRole('button',{name:'Tools',exact:true}).click();await page.getByRole('menuitem',{name:title}).click();};
