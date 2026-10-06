import {test,expect} from './fixtures';

test('surface settings live apply, keyboard, persistence, undo/reset, solid/high-contrast gates',async({page})=>{
 await page.goto('/');await expect(page.locator('.app-frame')).toBeVisible();await page.getByRole('button',{name:'Settings',exact:true}).click();
 const background=page.getByLabel('App background',{exact:true});
 const blur=page.getByRole('slider',{name:'Glass blur',exact:true});
 const panels=page.getByRole('checkbox',{name:'Glass inner panels',exact:true});
 const radius=page.getByRole('slider',{name:'Outer corner radius',exact:true});
 await expect(blur).toBeDisabled();await expect(panels).toBeDisabled();await expect(radius).toHaveValue('25');
 await background.selectOption('glass');await expect(blur).toBeEnabled();
 await blur.fill('8');await panels.uncheck();await radius.fill('0');
 await expect(page.locator('.app-frame')).toHaveCSS('border-radius','0px');
 await expect(page.locator('.center')).toHaveCSS('border-radius','0px');
 expect(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--glass-blur'))).toBe('8px');
 await expect(page.locator('html')).toHaveAttribute('data-glass-panels','false');
 await radius.focus();await page.keyboard.press('ArrowRight');await expect(radius).toHaveValue('1');
 await page.keyboard.press('Control+z');await expect(radius).toHaveValue('0');
 await page.reload();await expect(page.locator('.app-frame')).toBeVisible();await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(blur).toHaveValue('8');await expect(panels).not.toBeChecked();await expect(radius).toHaveValue('0');
 await expect(page.locator('html')).toHaveAttribute('data-background','solid');
 await page.getByLabel('Contrast',{exact:true}).selectOption('high');await expect(blur).toBeDisabled();await expect(panels).toBeDisabled();await expect(radius).toBeEnabled();
 await page.getByLabel('Contrast',{exact:true}).selectOption('standard');await expect(blur).toHaveValue('8');
 await page.getByRole('button',{name:'Reset look',exact:true}).click();await expect(blur).toHaveValue('24');await expect(panels).toBeChecked();await expect(radius).toHaveValue('25');await expect(background).toHaveValue('solid');
});

for(const theme of ['light','dark']){
 test(`${theme}: simulated native CSS, settings and shell screenshots`,async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open Somnia Agent'}).click();await page.keyboard.press('Control+,');
  await page.getByLabel('App theme',{exact:true}).selectOption(theme);
  await page.getByLabel('App background',{exact:true}).selectOption('glass');
  await page.getByRole('slider',{name:'Glass blur',exact:true}).fill('32');
  await page.getByRole('slider',{name:'Outer corner radius',exact:true}).fill('12');
  await page.addStyleTag({content:`html{background:repeating-linear-gradient(120deg,#315cb2 0px,#315cb2 28px,#c24e98 28px,#c24e98 56px,#eabb7c 56px,#eabb7c 84px)!important}body,#root{background:transparent!important}#root .app-frame{height:calc(100dvh - 48px);margin:24px;min-height:600px}`});
  // CSS-only preview: no native compositor exists in this browser test.
  await page.evaluate(()=>{document.documentElement.dataset.background='glass';document.documentElement.dataset.shell='desktop';});
  await expect(page.locator('.app-frame')).toHaveCSS('backdrop-filter','blur(32px) saturate(1.15)');
  await expect(page.locator('.center')).toHaveCSS('backdrop-filter','blur(32px)');
  await page.screenshot({path:`test-results/appearance-${theme}-settings-css-preview.png`});
  await page.keyboard.press('Escape');
  const cards=page.locator('.pane-slot>.panel,.center,.communication-panel');await expect(cards).toHaveCount(4);
  for(const card of await cards.all())await expect(card).toHaveCSS('border-radius','12px');
  await expect(page.locator('.ag-bar')).toHaveCSS('clip-path','inset(0px round 0px 0px 12px 12px)');
  await page.screenshot({path:`test-results/appearance-${theme}-shell-inner-glass-css-preview.png`});
  await page.keyboard.press('Control+,');await page.getByRole('checkbox',{name:'Glass inner panels',exact:true}).uncheck();
  await expect(page.locator('.center')).toHaveCSS('backdrop-filter','none');
  await page.keyboard.press('Escape');await page.screenshot({path:`test-results/appearance-${theme}-shell-solid-panels-css-preview.png`});
  await page.keyboard.press('Control+,');await page.getByRole('slider',{name:'Glass blur',exact:true}).fill('0');
  await expect(page.locator('.app-frame')).toHaveCSS('backdrop-filter','blur(0px) saturate(1.15)');
  await page.getByRole('slider',{name:'Outer corner radius',exact:true}).fill('25');await page.keyboard.press('Escape');
  await expect(page.locator('.app-frame')).toHaveCSS('border-radius','25px');
 });
}

test('legacy look migrates; new strings exist in all shipped locales',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('somnia.look.v1',JSON.stringify({background:'glass',accent:'#e11d48',uiScale:100})));
 await page.goto('/');await expect(page.locator('.app-frame')).toBeVisible();await page.getByRole('button',{name:'Settings',exact:true}).click();
 await expect(page.getByRole('slider',{name:'Glass blur',exact:true})).toHaveValue('24');
 const radius=page.getByRole('slider',{name:'Outer corner radius',exact:true});await radius.fill('9');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('somnia.look.v2')!).look.accent)).toBe('#e11d48');
 await expect(page.getByRole('dialog')).toHaveCSS('border-top-left-radius','25px');
 await page.getByRole('button',{name:'General',exact:true}).click();
 const locale=page.locator('.settings-content select').filter({has:page.locator('option[value="pt-BR"]')});
 // Use shipped JSON to keep this test tied to the UI's real localized labels.
 const names={de:['Glas-Unschärfe','Äußerer Eckenradius'],es:['Desenfoque del cristal','Radio de las esquinas exteriores'],fr:['Flou du verre','Rayon des coins extérieurs'],'pt-BR':['Desfoque do vidro','Raio dos cantos externos']};
 for(const [id,labels] of Object.entries(names)){
  await locale.selectOption(id);
  await page.keyboard.press('Escape');await page.keyboard.press('Control+,');
  // Opening settings retains General; keyboard search selects matching Appearance content.
  await page.locator('.settings-search input').fill(labels[0]);
  await expect(page.getByRole('slider',{name:labels[0],exact:true})).toBeVisible();
  await page.locator('.settings-search input').fill('');
  await page.locator('.settings-sidebar nav button').nth(1).click();
  await expect(page.getByRole('slider',{name:labels[1],exact:true})).toHaveValue('9');
  // Go back to General using stable section order rather than English-only labels.
  await page.locator('.settings-sidebar nav button').first().click();
 }
});
