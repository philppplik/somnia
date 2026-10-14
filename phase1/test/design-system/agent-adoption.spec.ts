import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('./?view=agent');await expect(page.getByRole('heading',{name:'Agent area DS adoption'})).toBeVisible();});

test('migrated agent controls keep behavior: reject callback and consent gating',async({page})=>{
 const proof=page.getByTestId('agent-proof'),events=page.getByTestId('agent-proof-events');
 // Reject commits through the migrated button.
 await proof.getByRole('button',{name:'Reject proposal'}).click();
 await expect(events).toContainText('reject');
 // Consent checkbox gates the enable action without executing a settings write.
 const enable=proof.getByRole('button',{name:'Allow cloud AI'});
 await expect(enable).toBeDisabled();
 await proof.getByRole('checkbox').check();
 await expect(enable).toBeEnabled();
});

test('agent surfaces render in light and dark production styles',async({page})=>{
 const proof=page.getByTestId('agent-proof');
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.contrast='standard';},theme);
  await proof.screenshot({path:`test-results/ds-agent-${theme}.png`});
 }
});
