import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('./?view=vectorstudio');await expect(page.getByRole('heading',{name:'Vectorstudio DS adoption'})).toBeVisible();});

test('migrated vectorstudio controls keep behavior: dimension edit commits and tool switch logs',async({page})=>{
 const proof=page.getByTestId('vectorstudio-proof'),events=page.getByTestId('vectorstudio-proof-events');
 // Editing a dimension commits through the migrated input.
 const width=proof.getByRole('spinbutton',{name:'Selection width'});
 await expect(width).toHaveValue('30');
 await width.fill('55');
 await width.press('Enter');
 await expect(events).toContainText('commit:');
 // Tool switch works through the migrated toggle.
 await proof.getByRole('button',{name:/Edit nodes/}).click();
 await expect(events).toContainText('tool:');
});

test('vectorstudio surfaces render in light and dark production styles',async({page})=>{
 const proof=page.getByTestId('vectorstudio-proof');
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.contrast='standard';},theme);
  await proof.screenshot({path:`test-results/ds-vectorstudio-${theme}.png`});
 }
});
