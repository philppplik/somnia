import {test,expect} from '@playwright/test';
import {THEME_CHOICES} from '../../src/lib/theme';
for(const choice of THEME_CHOICES.filter(t=>t.id!=='system'))test(`appearance ${choice.id}: current palette aliases and all densities`,async({page})=>{
 await page.goto('./');await expect(page.locator('[data-fixture-ready]')).toBeVisible();
 for(const density of ['compact','normal','comfortable']){
  const result=await page.evaluate(({choice,density})=>{const api=(window as any).dsAppearance,root=document.documentElement;const resolved=api.resolveTheme(choice);root.dataset.theme=resolved.mode;root.dataset.palette=resolved.palette;root.dataset.contrast='standard';api.applyLook({...api.DEFAULT_LOOK,density});const cs=getComputedStyle(root),control=getComputedStyle(document.querySelector('[data-testid=number]')!);return {gap:cs.getPropertyValue('--gap').trim(),font:control.fontSize,mode:root.dataset.theme,palette:root.dataset.palette};},{choice:choice.id,density});
  expect(result.gap).toBe({compact:'3px',normal:'6px',comfortable:'10px'}[density]);expect(result.mode).toBe(choice.mode);expect(result.palette).toBe(choice.palette);expect(result.font).toBe('13px');
  const aliases=await page.getByTestId('exchange-proof').evaluate(element=>{const api=(window as any).themeExchangeProof,cs=getComputedStyle(element);return api.THEME_ROLES.map((role:string)=>[role,cs.getPropertyValue(`--sc-${role}`).trim(),cs.getPropertyValue(api.ROLE_ALIASES[role]).trim()]);});
  for(const [role,alias,source] of aliases)expect(alias,role).toBe(source);
 }
 // Representative per-palette evidence, not canonical goldens.
 await page.evaluate(()=>document.documentElement.style.setProperty('--ui-zoom','1'));
 await page.screenshot({path:`test-results/ds-palette-${choice.id}.png`,fullPage:true,animations:'disabled'});
});
test('long label at 200% font, density does not change document or editor metrics, reduced motion',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('./');
 const metrics=await page.evaluate(()=>{const api=(window as any).dsAppearance,root=document.documentElement;api.applyUiPrefs({...api.DEFAULT_UI_PREFS,font:'system',motion:'reduce'});root.style.setProperty('--ui-font-size','26px');const out=[];for(const density of ['compact','normal','comfortable']){api.applyLook({...api.DEFAULT_LOOK,density});const cs=getComputedStyle(root);out.push({font:cs.getPropertyValue('--editor-font-size'),line:cs.getPropertyValue('--editor-line-height'),page:cs.getPropertyValue('--page-bg'),canvas:cs.getPropertyValue('--canvas-bg')});}return out;});
 expect(metrics[1]).toEqual(metrics[0]);expect(metrics[2]).toEqual(metrics[0]);
 await expect(page.getByLabel('Translated field label: Breite des ausgewählten Objekts')).toBeVisible();
 await page.getByRole('button',{name:'Open popover',exact:true}).click();await expect(page.getByRole('heading',{name:'Popover content'})).toBeVisible();await page.keyboard.press('Escape');
 await page.screenshot({path:'test-results/ds-stress-text-200.png',fullPage:true,animations:'disabled'});
});
