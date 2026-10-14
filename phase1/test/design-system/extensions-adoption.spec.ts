import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('./?view=extensions');await expect(page.getByRole('heading',{name:'Extensions DS adoption'})).toBeVisible();});

test('migrated controls keep their behavior: search, chips, switch, tabs, expandable target',async({page})=>{
 const proof=page.getByTestId('extensions-proof');
 // Search input filters the installed list.
 const search=proof.getByLabel('Search installed extensions');
 await search.fill('tidy');
 await expect(proof.getByRole('button',{name:'Open Tidy HTML'})).toBeVisible();
 await expect(proof.getByRole('button',{name:'Open Word count'})).toBeHidden();
 await search.fill('');
 // Filter chips keep aria-pressed and filter.
 await proof.getByRole('button',{name:/Enabled/}).click();
 await expect(proof.getByRole('button',{name:/Enabled/})).toHaveAttribute('aria-pressed','true');
 await expect(proof.getByRole('button',{name:'Open Snippet Pack'})).toBeHidden();
 await proof.getByRole('button',{name:/All/}).click();
 // Card switch commits through the host.
 await proof.getByRole('switch',{name:'Disable Tidy HTML'}).click();
 await expect(page.getByTestId('extensions-proof-events')).toContainText('setEnabled:example.tidy-html:false');
 // Nav tab triggers its callback.
 await proof.getByRole('tab',{name:/Activity/}).click();
 await expect(page.getByTestId('extensions-proof-events')).toContainText('nav:activity');
 // Activity target expands its detail row.
 const target=proof.getByRole('button',{name:'unlisted.example.com'});
 await expect(target).toHaveAttribute('aria-expanded','false');
 await target.click();
 await expect(target).toHaveAttribute('aria-expanded','true');
 // Store tablist: arrow keys move selection and focus (manual roving focus preserved).
 const access=proof.getByRole('tab',{name:'Access'});
 await access.click();
 await expect(access).toHaveAttribute('aria-selected','true');
 await access.press('ArrowRight');
 const evidence=proof.getByRole('tab',{name:'Evidence'});
 await expect(evidence).toHaveAttribute('aria-selected','true');
 await expect(evidence).toBeFocused();
 await access.press('ArrowLeft');
 await expect(access).toHaveAttribute('aria-selected','true');
});

test('extensions surfaces render in light and dark production styles',async({page})=>{
 const proof=page.getByTestId('extensions-proof');
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.contrast='standard';},theme);
  await proof.screenshot({path:`test-results/ds-extensions-${theme}.png`});
 }
});
