import {test,expect} from './fixtures';

const locale=async(page:import('@playwright/test').Page,value:string)=>{
 await page.evaluate(async value=>{
  const path='/src/lib/i18n.ts';const {setLocalePref}=await import(/* @vite-ignore */ path);setLocalePref(value);
 },value);
};

test('panels translate live without changing selection, CSS properties, or accordion IDs',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await frame.locator('h1').first().click();
 await expect(page.getByRole('region',{name:'Element metrics'})).toBeVisible();
 await locale(page,'de');
 const inspector=page.getByRole('complementary',{name:'Inspektor'});
 await expect(inspector.getByText('Attribute',{exact:true})).toBeVisible();
 await expect(inspector.getByRole('button',{name:'Text anwenden',exact:true})).toBeVisible();
 await expect(inspector.getByLabel('CSS-Eigenschaft')).toHaveValue('color');
 await expect(inspector.getByLabel('Breite, berechnet')).toBeVisible();
 await inspector.getByRole('button',{name:'Typografie',exact:true}).click();
 await locale(page,'en');
 await expect(page.getByLabel('Width computed',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Font computed',{exact:true})).not.toBeVisible();
 await locale(page,'de');
 await page.screenshot({path:'/tmp/panels-inspector-de.png',fullPage:true});
 await page.getByRole('button',{name:'Files panel',exact:true}).click();
 await expect(page.getByRole('navigation',{name:'Projektdateien'})).toBeVisible();
 await page.getByRole('button',{name:'Neue Datei',exact:true}).click();
 await page.getByLabel('Dateipfad').fill('de-test.html');
 await page.getByRole('button',{name:'Erstellen',exact:true}).click();
 await expect(page.getByRole('button',{name:'de-test.html öffnen',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'CSS panel',exact:true}).click();
 await expect(page.getByRole('tab',{name:/^Variablen/})).toBeVisible();
 await page.getByRole('tab',{name:'Responsiv',exact:true}).click();
 await expect(page.getByLabel('Responsiver Bearbeitungsbereich')).toBeVisible();
 await page.screenshot({path:'/tmp/panels-responsive-de.png',fullPage:true});
 expect(errors).toEqual([]);
});

test('German search plurals and replacement confirmation retain file names',async({page})=>{
 await page.goto('/');await locale(page,'de');
 await page.getByRole('button',{name:'Search panel',exact:true}).click();
 await page.getByLabel('Projekt durchsuchen',{exact:true}).fill('Somnia');
 await expect(page.getByTestId('search-summary')).toContainText('1 Treffer in 1 Datei');
 await page.getByLabel('Ersetzen durch',{exact:true}).fill('Test');
 await page.getByRole('button',{name:'Alle ersetzen',exact:true}).click();
 await expect(page.getByRole('group',{name:'Ersetzen bestätigen'})).toContainText('Treffer');
 await page.getByRole('button',{name:'Abbrechen',exact:true}).click();
 await locale(page,'en');
 await expect(page.getByTestId('search-summary')).toContainText('1 match in 1 file');
});

test('German component library labels, placeholders and user names',async({page})=>{
 await page.goto('/');await locale(page,'de');
 await page.getByRole('button',{name:'section',exact:true}).first().click();
 await page.getByRole('button',{name:'Components panel',exact:true}).click();
 await page.getByLabel('Komponenten- oder Variantenname').fill('User name');
 await page.getByRole('button',{name:'Auswahl als neue Komponente speichern',exact:true}).click();
 await expect(page.getByRole('group',{name:'Komponente User name',exact:true})).toBeVisible();
 await expect(page.getByLabel('Komponenten suchen')).toBeVisible();
 await expect(page.getByRole('button',{name:'Variante User name Default umbenennen',exact:true})).toBeVisible();
 await page.screenshot({path:'/tmp/panels-components-de.png',fullPage:true});
});
