import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:900}});
// Regression for the studio crash on open: the Light panel is mounted before any photo exists, and a hook
// inside the PanelBody render callback fired only once a session arrived, changing the hook count mid-life.
test('the light panel survives the empty to photo transition',async({page})=>{
 await page.goto('/test/design-system/?view=photos-panel-transition');
 await expect(page.getByTestId('photos-light-panel-empty')).toBeVisible();
 await page.getByTestId('open-photo').click();
 await expect(page.getByTestId('photos-light-panel')).toBeVisible();
 await expect(page.getByTestId('photos-slider-exposure')).toBeVisible();
 await expect(page.getByTestId('error-boundary')).toHaveCount(0);
});
