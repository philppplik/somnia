import {test,expect} from './fixtures';
test.use({sample:true});
// Gate: offers without a dispatch path must never render as pickable options (production state today).
test('choose dialog hides extension offers when no dispatch is wired',async({page})=>{
 await page.setViewportSize({width:1400,height:900});
 await page.goto('/tests/fixtures/router-dialog.html?lang=de&theme=light&mode=choose&offers=1');
 const dialog=page.getByRole('dialog',{name:'In welchem Studio möchtest du diese Datei öffnen?',exact:true});
 await expect(dialog).toBeVisible();
 const combo=dialog.getByRole('combobox',{name:'Studio',exact:true});
 await expect(combo.locator('option')).toHaveCount(2);
 await expect(dialog).not.toContainText('MD Viewer');
 await page.waitForTimeout(400);
 await page.screenshot({path:'/downloads/open-router-gated-de-light.png'});
});
test('choose dialog hides extension offers when no dispatch is wired (dark, en)',async({page})=>{
 await page.setViewportSize({width:1400,height:900});
 await page.goto('/tests/fixtures/router-dialog.html?lang=en&theme=dark&mode=choose&offers=1');
 const dialog=page.getByRole('dialog',{name:'In which studio do you want to open this file?',exact:true});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('combobox',{name:'Studio',exact:true}).locator('option')).toHaveCount(2);
 await expect(dialog).not.toContainText('MD Viewer');
 await page.waitForTimeout(400);
 await page.screenshot({path:'/downloads/open-router-gated-en-dark.png'});
});
// With a dispatch dep (fixture stub, NOT production), the offer is pickable and routes to it.
test('wired dispatch makes the offer pickable and routes the pick (harness only)',async({page})=>{
 await page.goto('/tests/fixtures/router-dialog.html?lang=en&theme=light&mode=choose&offers=1&dispatch=1');
 const dialog=page.getByRole('dialog',{name:'In which studio do you want to open this file?',exact:true});
 await expect(dialog).toBeVisible();
 const combo=dialog.getByRole('combobox',{name:'Studio',exact:true});
 await expect(combo.locator('option')).toHaveCount(3);
 await expect(dialog).toContainText('MD Viewer');
 await combo.selectOption('offer:acme.md-viewer');
 await expect(combo).toHaveValue('offer:acme.md-viewer');
 await page.waitForTimeout(400);
 await page.screenshot({path:'/downloads/open-router-dispatch-en-light.png'});
 await dialog.getByRole('button',{name:'Open file',exact:true}).click();
 await expect(page.locator('body')).toHaveAttribute('data-offer-run','acme.md-viewer:ambiguous.txt');
 await expect(page.locator('body')).toHaveAttribute('data-status','extension-opened');
});
