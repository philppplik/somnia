import {test,expect} from '@playwright/test';
import path from 'node:path';
import {showPanel} from './helpers';
const cell=(page:any,a:string)=>page.locator(`[data-address="${a}"]`);
test('CA1: Slides table round-trips through Sheets with explicit apply',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('radio',{name:'Slides',exact:true}).click();await showPanel(page,'Slides');await showPanel(page,'Presentation');
 await page.getByLabel('Open PPTX',{exact:true}).setInputFiles(path.resolve('slides-engine/fixtures/table.pptx'));
 await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible({timeout:30000});
 // Select the table by clicking its centre on the shape overlay.
 const overlay=page.getByRole('group',{name:'Slide shapes. Arrow keys select a shape, Escape clears the selection.'});
 const box=(await overlay.boundingBox())!;
 await page.mouse.click(box.x+box.width*0.264,box.y+box.height*0.286);
 const handoff=page.getByTestId('slides-table-handoff');await expect(handoff).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Cell 2,2',exact:true})).toHaveValue('3');
 // Suggestion opens a new workbook with the table contents and switches to Sheets.
 await handoff.getByRole('button',{name:'Edit in Sheets studio',exact:true}).click();
 await expect(page.getByTestId('sheets-grid')).toBeVisible({timeout:30000});
 await expect(cell(page,'A2')).toHaveText('Apples');await expect(cell(page,'B2')).toHaveText('3');
 await expect(page.getByTestId('sheets-handoff-bar')).toContainText('table.pptx');
 // Edit in Sheets, then hand back; the deck applies nothing until asked.
 await cell(page,'B2').click();await page.keyboard.type('4');await page.keyboard.press('Enter');
 await expect(cell(page,'B2')).toHaveText('4');
 await page.getByTestId('sheets-return-slides').click();
 await expect(handoff).toContainText('1 changed cells in Sheets',{timeout:30000});
 await expect(page.getByRole('textbox',{name:'Cell 2,2',exact:true})).toHaveValue('3');
 await handoff.getByRole('button',{name:'Apply to table',exact:true}).click();
 await expect(handoff).toContainText('Applied 1 cells.');
 await expect(page.getByRole('textbox',{name:'Cell 2,2',exact:true})).toHaveValue('4');
 expect(errors).toEqual([]);
});
test('CA2: Slides picture round-trips through Photos with explicit apply',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('radio',{name:'Slides',exact:true}).click();await showPanel(page,'Slides');await showPanel(page,'Presentation');
 await page.getByLabel('Open PPTX',{exact:true}).setInputFiles(path.resolve('slides-engine/fixtures/picture.pptx'));
 await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible({timeout:30000});
 const overlay=page.getByRole('group',{name:'Slide shapes. Arrow keys select a shape, Escape clears the selection.'});
 const box=(await overlay.boundingBox())!;
 await page.mouse.click(box.x+box.width*0.5,box.y+box.height*0.5);
 const handoff=page.getByTestId('slides-picture-handoff');await expect(handoff).toBeVisible();
 await handoff.getByRole('button',{name:'Edit in Photos studio',exact:true}).click();
 await expect(page.getByTestId('photos-workspace')).toBeVisible({timeout:30000});
 await expect(page.getByTestId('photos-handoff-bar')).toContainText('picture.pptx');
 await page.getByTestId('photos-return-slides').click();
 await expect(handoff).toContainText('Edited image in Photos',{timeout:30000});
 await handoff.getByRole('button',{name:'Replace picture',exact:true}).click();
 await expect(handoff).toContainText('Picture replaced.');
 expect(errors).toEqual([]);
});
test('CA2: audio preview in Code offers the Sound studio',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Sound'}).click();
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('sound-open').click();(await chooser).setFiles(path.resolve('tests/assets/arpeggio.mp3'));
 await expect(page.getByTestId('sound-workspace')).toBeVisible({timeout:30000});
 await page.getByRole('radio',{name:'Somnia Code',exact:true}).click();
 await expect(page.getByTestId('audio-open-sound')).toBeVisible();
 await page.getByTestId('audio-open-sound').getByRole('button').click();
 await expect(page.getByRole('radio',{name:'Somnia Sound'})).toHaveAttribute('aria-checked','true');
});
