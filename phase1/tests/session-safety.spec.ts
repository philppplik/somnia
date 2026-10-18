import {test,expect} from './fixtures';
import {readFileSync,mkdirSync} from 'node:fs';
/**
 * End-to-end acceptance tests for session safety, ported from v12.2.0-beta.4.
 *
 * They exercise the full app wiring of src/lib/sessionSafety (canvases create a SessionCheckpointer,
 * a teardown flush runs when the view goes away, and remounting restores the edits with a notice).
 * On the beta.5 line that wiring is a documented TODO hook: beta.5 keeps engines alive across studio
 * switches in per-file session registries (lib/sheets/session.ts, lib/documents/session.ts), and the
 * checkpointer still has to be attached there. See docs/session-safety.md, "beta.5 wiring status".
 * Until then both tests are skipped so they document the acceptance criteria without failing CI.
 * Requires the built WASM engines (documents/pkg, sheets-craft/pkg), like the existing studio specs.
 */
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const FIXTURE=readFileSync(new URL('../sheets-craft/fixtures/fixture.xlsx',import.meta.url));
const sample=()=>readFileSync('test/documents/sample.docx');
const shot=(n:string)=>{mkdirSync('test-results/session-safety',{recursive:true});return `test-results/session-safety/${n}.png`;};
async function openBuffer(page:any,name:string,mimeType:string,buffer:Buffer){const chooser=page.waitForEvent('filechooser');await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');void m.executeCommand('project.openMedia');});(await chooser).setFiles([{name,mimeType,buffer}]);}
const cell=(page:any,a:string)=>page.locator(`[data-address="${a}"]`);
const SKIP='session-safety is ported as a library; the beta.5 session-registry wiring it tests is still pending (docs/session-safety.md)';
test('Sheets: unsaved edit survives a studio switch and is restored on return',async({page})=>{
 test.skip(true,SKIP);
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffer(page,'sales.xlsx',XLSX,FIXTURE);
 await page.getByRole('radio',{name:'Somnia Sheets'}).click();await expect(page.getByTestId('sheets-grid')).toBeVisible();
 await cell(page,'B2').click();await page.keyboard.type('4242');await page.keyboard.press('Enter');
 await expect(cell(page,'B2')).toHaveText('4242');await expect(page.getByTestId('sheets-dirty')).toBeVisible();
 await page.screenshot({path:shot('sheets-before-switch')});
 await page.getByRole('radio',{name:'Somnia Code'}).click();await expect(page.getByTestId('sheets-grid')).toHaveCount(0);
 await page.getByRole('radio',{name:'Somnia Sheets'}).click();
 await expect(cell(page,'B2')).toHaveText('4242');await expect(page.getByTestId('sheets-dirty')).toBeVisible();
 await expect(page.getByTestId('sheets-notice')).toContainText('Restored your unsaved edits');
 await page.screenshot({path:shot('sheets-after-resume')});
});
test('Documents: unsaved typing survives a studio switch and is restored on return',async({page})=>{
 test.skip(true,SKIP);
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffer(page,'sample.docx',DOCX,sample());
 await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 const pg=page.getByTestId('documents-page').first();await expect(pg.locator('img')).toBeVisible();
 const box=(await pg.boundingBox())!;const second=page.getByTestId('documents-editor').getByRole('textbox').nth(1);const old2=await second.inputValue();
 await page.mouse.click(box.x+box.width*0.125,box.y+box.height*0.127);await expect(page.getByTestId('documents-input')).toBeFocused();
 await page.keyboard.type('Safe ');await expect.poll(()=>second.inputValue()).toBe('Safe '+old2);
 await page.screenshot({path:shot('documents-before-switch')});
 await page.keyboard.press('Control+1');await expect(page.getByRole('radio',{name:'Somnia Code'})).toHaveAttribute('aria-checked','true');
 await page.keyboard.press('Control+2');await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 await expect(page.getByTestId('documents-recovered')).toBeVisible();
 await expect.poll(()=>page.getByTestId('documents-editor').getByRole('textbox').nth(1).inputValue()).toBe('Safe '+old2);
 await expect(page.getByTestId('documents-undo')).toBeEnabled(); // history restored (single non-structural edit)
 await page.screenshot({path:shot('documents-after-resume')});
});
