import {test,expect} from './fixtures';
import {readFileSync} from 'node:fs';
import {unzipSync} from 'fflate';
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Independent openpyxl fixture: Sales (formulas, chart, merge) + Summary (cross-sheet SUM, Unicode).
const FIXTURE=readFileSync(new URL('../sheets-craft/fixtures/fixture.xlsx',import.meta.url));
async function openXlsx(page:any,name:string,buffer:Buffer){const chooser=page.waitForEvent('filechooser');await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');void m.executeCommand('project.openMedia');});(await chooser).setFiles([{name,mimeType:XLSX,buffer}]);}
const cell=(page:any,a:string)=>page.locator(`[data-address="${a}"]`);
test('Sheets Studio opens a workbook, edits through the real engine, recalculates, undoes and exports a copy',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openXlsx(page,'sales.xlsx',FIXTURE);
 // Code keeps its read-only viewer until the owner picks Sheets.
 await expect(page.getByTestId('xlsx-table')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Sheets'}).click();
 const grid=page.getByTestId('sheets-grid');await expect(grid).toBeVisible();
 await expect(cell(page,'A2')).toHaveText('Coffee');await expect(cell(page,'B2')).toHaveText('2');await expect(cell(page,'C2')).toHaveText('20');
 await cell(page,'C2').click();await expect(page.getByTestId('sheets-formula')).toHaveValue('=B2*10');
 await expect(page.getByTestId('sheets-inspector-address')).toHaveText('C2');
 await page.screenshot({path:'test-results/sheets-open.png'});
 // Edit B2 by typing: formula bar commits with Enter; C2 recalculates.
 await cell(page,'B2').click();await page.keyboard.type('7');await expect(page.getByTestId('sheets-formula')).toHaveValue('7');await page.keyboard.press('Enter');
 await expect(cell(page,'B2')).toHaveText('7');await expect(cell(page,'C2')).toHaveText('70');await expect(page.getByTestId('sheets-dirty')).toBeVisible();
 await page.getByRole('tab',{name:'Summary',exact:true}).click();
 await expect(cell(page,'A1')).toHaveText('85');await expect(cell(page,'B1')).toHaveText('Grüße ☕');
 await page.screenshot({path:'test-results/sheets-summary.png'});
 await page.getByRole('tab',{name:'Sales',exact:true}).click();
 const dl=page.waitForEvent('download');await page.getByTestId('sheets-export').click();const d=await dl;expect(d.suggestedFilename()).toBe('sales-edited.xlsx');
 await d.saveAs('test-results/sheets-edited.xlsx');const path=await d.path();const zip=unzipSync(new Uint8Array(readFileSync(path!)));expect(Object.keys(zip)).toContain('xl/workbook.xml');
 await expect(page.getByTestId('sheets-notice')).toContainText('original file was not changed');
 await page.getByRole('region',{name:/^Workbook/}).getByRole('button',{name:'Undo'}).click();
 await expect(cell(page,'B2')).toHaveText('2');await expect(cell(page,'C2')).toHaveText('20');
 await page.getByRole('region',{name:/^Workbook/}).getByRole('button',{name:'Redo'}).click();await expect(cell(page,'C2')).toHaveText('70');
 // Keyboard navigation and a bad formula stays an error value, not a crash.
 await cell(page,'A1').click();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowRight');await expect(page.getByTestId('sheets-address')).toHaveText('B2');
 await page.keyboard.type('=1/0');await page.keyboard.press('Enter');await expect(cell(page,'B2')).toContainText('#');
 await expect(page.getByTestId('sheets-grid')).toBeVisible();
 await page.screenshot({path:'test-results/sheets-final.png'});
});
test('Sheets Studio without a workbook shows a hint and keeps the shell',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Sheets'}).click();await expect(page.getByTestId('sheets-empty')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Code'}).click();await expect(page.getByTestId('sheets-empty')).toHaveCount(0);
});
const FORMATS=readFileSync(new URL('../sheets-craft/fixtures/formats.xlsx',import.meta.url));
test('Sheets Studio shows number formats, bold/italic, fills, alignment and column widths from the file',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openXlsx(page,'formats.xlsx',FORMATS);await page.getByRole('radio',{name:'Somnia Sheets'}).click();
 await expect(cell(page,'B2')).toHaveText('25.6%');await expect(cell(page,'B3')).toHaveText('1,234.50 EUR');await expect(cell(page,'B4')).toHaveText('2026-10-09');
 await expect(cell(page,'B5')).toHaveText('-42');await expect(cell(page,'B5')).toHaveCSS('color','rgb(255, 0, 0)');
 await expect(cell(page,'A1')).toHaveCSS('font-weight','700');await expect(cell(page,'A1')).toHaveCSS('font-style','italic');await expect(cell(page,'A1')).toHaveCSS('background-color','rgb(255, 242, 204)');
 await expect(cell(page,'B6')).toHaveCSS('text-align','center');await expect(cell(page,'B7')).toHaveCSS('text-align','right');await expect(cell(page,'B2')).toHaveCSS('text-align','right');await expect(cell(page,'A2')).toHaveCSS('text-align','left');
 // Widths from the file: A (30 chars) is wider than B (18), D (8) is narrow, hidden column C is not painted.
 const w=async(a:string)=>(await cell(page,a).boundingBox())!.width;
 expect(await w('A2')).toBeGreaterThan(await w('B2'));expect(await w('B2')).toBeGreaterThan(await w('D1'));await expect(cell(page,'C2')).toHaveCount(0);
 // The editor still shows the raw value, not the formatted text.
 await cell(page,'B2').click();await expect(page.getByTestId('sheets-formula')).toHaveValue('0.256');
 await page.screenshot({path:'test-results/sheets-formats.png'});
 // Arrow right from B skips the hidden column.
 await cell(page,'B2').click();await page.keyboard.press('ArrowRight');await expect(page.getByTestId('sheets-address')).toHaveText('D2');
});
