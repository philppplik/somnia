import {test,expect} from '@playwright/test';
test('all buttons have accessible names and keyboard focus is visible',async({page})=>{
 await page.goto('/');await page.waitForTimeout(500);
 const unnamed=await page.evaluate(()=>[...document.querySelectorAll('button,[role=tab],[role=menuitem],input,select,textarea')].filter(e=>{const el=e as HTMLElement;if(el.offsetParent===null)return false;const n=(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').trim()||(el.id&&document.querySelector(`label[for="${el.id}"]`)?.textContent)||el.closest('label')?.textContent;return !n;}).map(e=>e.outerHTML.slice(0,120)));
 expect(unnamed).toEqual([]);
 await page.keyboard.press('Tab');await page.keyboard.press('Tab');
 const outline=await page.evaluate(()=>getComputedStyle(document.activeElement as Element).outlineStyle);
 expect(outline).not.toBe('none');
});
