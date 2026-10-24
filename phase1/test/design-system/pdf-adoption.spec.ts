import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('./?view=pdf');await expect(page.getByRole('heading',{name:'Pdf/pdfedit DS adoption'})).toBeVisible();});

test('migrated pdf controls keep behavior: page select, extract flow, annotation submit and field set',async({page})=>{
 const proof=page.getByTestId('pdf-proof'),events=page.getByTestId('pdf-proof-events');
 // Selecting a page works through the migrated button.
 await proof.getByRole('button',{name:/Page 3/}).click();
 await expect(events).toContainText('select:2');
 // Extract flow: checkbox enables the extract button.
 const extract=proof.getByRole('button',{name:'Extract selected pages'});
 await expect(extract).toBeDisabled();
 await proof.getByRole('checkbox',{name:'Select page for extraction 1'}).check();
 await expect(extract).toBeEnabled();
 await extract.click();
 await expect(events).toContainText('extract:0');
 // Annotation form submits through native primitives.
 await proof.getByLabel(/Annotation text|Text/).first().fill('Check totals');
 await proof.getByRole('button',{name:'Add annotation'}).click();
 await expect(events).toContainText('command:annotation.add');
 // Form field edit commits a field.set command.
 await proof.getByRole('textbox',{name:/title/}).fill('Annual report');
 await expect(events).toContainText('command:field.set');
 // Disabled toggle locks the controls again.
 await page.getByRole('button',{name:'Disabled'}).click();
 await expect(proof.getByRole('button',{name:'Undo'})).toBeDisabled();
});

test('pdf surfaces render in light and dark production styles',async({page})=>{
 const proof=page.getByTestId('pdf-proof');
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.contrast='standard';},theme);
  await proof.screenshot({path:`test-results/ds-pdf-${theme}.png`});
 }
});
