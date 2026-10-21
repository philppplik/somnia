import {test,expect} from './fixtures';
import {switchStudio} from './helpers';

const VISIBLE=['Somnia Code','Somnia Documents','Somnia Sheets','Slides','Somnia Sound'] as const;
const OVERFLOW_SPOTCHECK=['Somnia Video','Design','Somnia Vector','Somnia Photos','Vibe Space'] as const;

test('the bar shows at most five studios; the rest live in the More overflow',async({page})=>{
 await page.goto('/');
 const pill=page.getByRole('radiogroup',{name:'Studios',exact:true});
 const studioCount=await page.evaluate(async()=>{const m=await import('/src/lib/studios/index.ts');return m.listStudios().length;});
 await expect(pill.getByRole('radio')).toHaveCount(Math.min(5,studioCount));
 for(const name of VISIBLE)await expect(pill.getByRole('radio',{name,exact:true})).toBeVisible();
 const more=page.locator('header select.studio-pill-more');
 await expect(more).toBeVisible();
 await expect(more).toHaveAccessibleName('More');
 await expect(more.locator('option')).toHaveCount(Math.max(0,studioCount-5)+1);
 for(const name of OVERFLOW_SPOTCHECK)await expect(more.locator('option',{hasText:name})).toHaveCount(1);
});

test('switching through the More overflow marks the studio active and keeps it in the bar',async({page})=>{
 await page.goto('/');
 const pill=page.getByRole('radiogroup',{name:'Studios',exact:true});
 await switchStudio(page,'Somnia Vector');
 const vector=pill.getByRole('radio',{name:'Somnia Vector',exact:true});
 await expect(vector).toBeVisible();
 await expect(vector).toHaveAttribute('aria-checked','true');
 await expect(vector).toHaveAttribute('tabindex','0');
 await expect(vector).toHaveText('Vector');
 // The active studio takes the slot of the last default entry; Sound moves to the overflow.
 await expect(pill.getByRole('radio',{name:'Somnia Sound',exact:true})).toHaveCount(0);
 await expect(page.locator('header select.studio-pill-more option',{hasText:'Somnia Sound'})).toHaveCount(1);
 await expect(page.getByTestId('vector-start')).toBeVisible();
});

test('keyboard: arrows move within the visible radios and the overflow select is keyboard reachable',async({page})=>{
 await page.goto('/');
 const pill=page.getByRole('radiogroup',{name:'Studios',exact:true});
 const code=pill.getByRole('radio',{name:'Somnia Code',exact:true});
 await code.focus();
 await page.keyboard.press('ArrowRight');
 await expect(pill.getByRole('radio',{name:'Somnia Documents',exact:true})).toBeFocused();
 await page.keyboard.press('End');
 await expect(pill.getByRole('radio',{name:'Somnia Sound',exact:true})).toBeFocused();
 const more=page.locator('header select.studio-pill-more');
 await more.focus();
 await expect(more).toBeFocused();
 await more.selectOption({label:'Design'});
 await expect(pill.getByRole('radio',{name:'Design',exact:true})).toHaveAttribute('aria-checked','true');
});

test('the cap setting persists across reloads and narrows the bar',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{const m=await import('/src/store/appStore.ts');m.patchState({settingsOpen:true,settingsSection:'Appearance'});});
 const control=page.getByRole('combobox',{name:'Studios shown in the bar',exact:true});
 await expect(control).toBeVisible();
 const studioCount=await page.evaluate(async()=>{const m=await import('/src/lib/studios/index.ts');return m.listStudios().length;});
 await control.selectOption('3');
 await page.reload();
 const pill=page.getByRole('radiogroup',{name:'Studios',exact:true});
 await expect(pill.getByRole('radio')).toHaveCount(Math.min(3,studioCount));
 await expect(page.locator('header select.studio-pill-more option')).toHaveCount(Math.max(0,studioCount-3)+1);
});
