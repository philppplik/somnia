import type {Page} from '@playwright/test';
import {revealMenuItem} from './menuHelpers';
export const open=async(page:Page,title:string)=>{const item=await revealMenuItem(page,'Tools',page.getByRole('menuitem',{name:title}));await item.click();};
