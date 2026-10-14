import {test,expect} from '@playwright/test';
test('new-studio numeric adapters commit once, validate/cancel, reset identity, lock and collapse',async({page})=>{
 await page.goto('./');const proof=page.getByTestId('studio-adoption-proof'),position=proof.getByLabel('Position X',{exact:true}),events=proof.getByTestId('studio-adoption-events');
 await position.fill('12.5');await position.press('Enter');await position.blur();await expect(events).toHaveText('commit:12.5');
 await position.fill('bad');await position.press('Enter');await expect(proof.getByRole('alert')).toContainText('Invalid value');await expect(events).toHaveText('commit:12.5');await position.press('Escape');await expect(position).toHaveValue('12.5');
 await position.fill('101');await position.press('Enter');await expect(proof.getByRole('alert')).toBeVisible();await position.press('Escape');
 await position.fill('99');await proof.getByRole('button',{name:'Change selection identity'}).dispatchEvent('click');await expect(position).toHaveValue('12.5');
 const width=proof.getByLabel('Width',{exact:true});await width.fill('20');await width.press('Enter');await width.blur();await expect(events).toHaveText('commit:12.5|interface:20');
 const name=proof.getByLabel('Layer name',{exact:true});await name.fill('Discard');await name.press('Escape');await expect(name).toHaveValue('Layer');await expect(events).not.toContainText('Discard');await name.fill('Rectangle');await name.press('Enter');await expect(events).toContainText('name:Rectangle');
 await proof.getByRole('button',{name:'Layout',exact:true}).click();await expect(proof.getByText('Selection-scoped layout fields')).toBeHidden();await expect(proof.getByRole('button',{name:'Layout',exact:true})).toHaveAttribute('aria-expanded','false');
 await proof.getByRole('button',{name:'Toggle inspector lock'}).click();await expect(position).toBeDisabled();await expect(width).toBeDisabled();
});
test('adapter screenshots use actual production styles',async({page})=>{
 await page.goto('./');const proof=page.getByTestId('studio-adoption-proof');for(const theme of ['light','dark']){await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.contrast='standard';},theme);await proof.screenshot({path:`test-results/ds-studio-adoption-${theme}.png`});}
});
