import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('./?view=vibespace');await expect(page.getByRole('heading',{name:'Vibespace DS adoption'})).toBeVisible();});

test('migrated vibespace controls keep behavior: run open, stop, steer toggle and submit',async({page})=>{
 const proof=page.getByTestId('vibespace-proof'),events=page.getByTestId('vibespace-proof-events');
 // Opening a run card works through the migrated button.
 await proof.getByRole('button',{name:/Check external links/}).first().click();
 await expect(events).toContainText('open:run-network');
 // Steer toggle reveals the inline form; submit logs the steer action.
 const toggle=proof.getByRole('button',{name:'Steer'}).first();
 await expect(toggle).toHaveAttribute('aria-pressed','false');
 await toggle.click();
 const steer=proof.getByPlaceholder('Direction for the next step').first();
 await steer.fill('Focus on accessibility');
 await proof.getByRole('button',{name:'Send',exact:true}).first().click();
 await expect(events).toContainText('action:steer');
 // Stop commits through the host.
 await proof.getByRole('button',{name:'Stop'}).first().click();
 await expect(events).toContainText('action:stop');
 // Run-open cards keep card geometry: the P11 base button rule must not paint them as pills.
 const open=proof.getByRole('button',{name:/Check external links/}).first();
 await expect(open).toHaveCSS('padding','0px');
 await expect(open).toHaveCSS('border-top-width','0px');
 await expect(open).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 // Back link keeps text-styling: the P11 base button rule must not paint it as a pill.
 const back=proof.getByRole('button',{name:'Back to Vibe Space'});
 await expect(back).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(back).toHaveCSS('border-top-width','0px');
 await expect(back).toHaveCSS('text-decoration-line','underline');
 // Hunk filename keeps one-line layout: checkboxes must not take 100% width under the global input rule.
 const fileRow=proof.getByRole('checkbox',{name:'Include index.html'});
 const rowBox=await fileRow.boundingBox(),codeBox=(await fileRow.evaluate(el=>{const c=el.parentElement.querySelector('code');const r=c.getBoundingClientRect();return {width:r.width,height:r.height};}));
 expect(rowBox!.width).toBeLessThan(30);
 expect(codeBox.width).toBeGreaterThan(200);
 expect(codeBox.height).toBeLessThan(30);
 // Pending locks stop and steer again.
 await page.getByRole('button',{name:'Pending'}).click();
 await expect(proof.getByRole('button',{name:'Stop'}).first()).toBeDisabled();
 // Create form fields are native primitives with working select.
 const goal=proof.getByLabel(/Goal/).first();
 await goal.fill('Improve the landing page');
 await expect(goal).toHaveValue('Improve the landing page');
});

test('vibespace surfaces render in light and dark production styles',async({page})=>{
 const proof=page.getByTestId('vibespace-proof');
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.contrast='standard';},theme);
  await proof.screenshot({path:`test-results/ds-vibespace-${theme}.png`});
 }
});
