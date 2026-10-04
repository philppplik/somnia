import {test,expect} from './fixtures';
test('inspector shows size, box model and attributes of the selected element',async({page})=>{await page.goto('/');
 const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await frame.locator('h1').first().click();
 const panel=page.getByTestId('element-metrics');await expect(panel).toBeVisible();
 await expect(page.getByTestId('metrics-size')).toHaveText(/\d+(\.\d)? × \d+(\.\d)? px/);
 await expect(page.getByTestId('metrics-box')).toBeVisible();await expect(panel.getByText('Attributes')).toBeVisible();});
