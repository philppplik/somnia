import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readFileSync} from 'node:fs';
const requireBytes=()=>readFileSync('slides-engine/fixtures/independent.pptx');
test('Slides Studio opens independent PPTX in real worker, navigates, rejects bad input and closes',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('radio',{name:'Slides',exact:true}).click();
 await expect(page.getByRole('main',{name:'Slides Studio'})).toBeVisible();
 await page.getByLabel('Open PPTX',{exact:true}).setInputFiles(path.resolve('slides-engine/fixtures/independent.pptx'));
 await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible({timeout:30000});
 await expect(page.getByRole('complementary',{name:'Slides properties'})).toContainText('Somnia Documents Studio');
 await page.screenshot({path:'validation/slides/slide-1.png',fullPage:true});
 await page.getByRole('button',{name:'Slide 2',exact:true}).click();
 await expect(page.getByAltText('Slide 2',{exact:true})).toBeVisible();
 await page.screenshot({path:'validation/slides/slide-2.png',fullPage:true});
 await expect(page.getByTestId('studio-view-context')).toHaveCount(0);

 await page.getByLabel('Open PPTX',{exact:true}).setInputFiles({name:'invalid.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:Buffer.from('bad zip')});
 await expect(page.getByRole('alert')).toContainText('not a valid PPTX');
 await page.getByRole('button',{name:'Close presentation'}).click();
 await expect(page.getByText('Open a presentation',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
test('switching studios retains preview without changing the source document',async({page})=>{
 await page.goto('/');await page.getByRole('radio',{name:'Slides',exact:true}).click();
 await page.getByLabel('Open PPTX',{exact:true}).setInputFiles(path.resolve('slides-engine/fixtures/independent.pptx'));
 await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible({timeout:30000});
 await page.keyboard.press('Control+Alt+3');
 await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Code',exact:true}).click();
 await page.getByRole('radio',{name:'Slides',exact:true}).click();
 await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible();
});

test('dark theme presentation stays readable',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('somnia.theme','dark');localStorage.setItem('somnia.themeChoice','dark');});
 await page.goto('/');await page.getByRole('radio',{name:'Slides',exact:true}).click();
 await page.getByLabel('Open PPTX',{exact:true}).setInputFiles(path.resolve('slides-engine/fixtures/independent.pptx'));
 await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'Slide 2',exact:true}).click();
 await expect(page.getByAltText('Slide 2',{exact:true})).toBeVisible();
 await page.screenshot({path:'validation/slides/slide-2-dark.png',fullPage:true});
});

test('shared FileTabs retain multiple decks and thumbnails',async({page})=>{
 await page.goto('/');await page.getByRole('radio',{name:'Slides',exact:true}).click();
 await page.getByLabel('Open PPTX',{exact:true}).setInputFiles(path.resolve('slides-engine/fixtures/independent.pptx'));
 await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'Load slide thumbnails'}).click();
 await expect(page.getByRole('navigation',{name:'Presentation slides'}).locator('img')).toHaveCount(2);
 await page.getByLabel('Open PPTX',{exact:true}).setInputFiles({name:'second.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:requireBytes()});
 await expect(page.getByRole('tab',{name:'second.pptx Close second.pptx',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'independent.pptx Close independent.pptx',exact:true}).click();
 await expect(page.getByRole('navigation',{name:'Presentation slides'}).locator('img')).toHaveCount(2);
 await page.screenshot({path:'validation/slides/package2-tabs-thumbnails.png',fullPage:true});
});
test('Project Open File routes PPTX automatically and source tabs return to Code',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Project',exact:true}).click();
 const chooser=page.waitForEvent('filechooser');await page.getByRole('menuitem',{name:/Open file/i}).click();await(await chooser).setFiles(path.resolve('slides-engine/fixtures/independent.pptx'));
 await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible({timeout:30000});
 await expect(page.getByRole('radio',{name:'Slides',exact:true})).toBeChecked();
 await expect(page.getByRole('group',{name:'Read-only presentation'})).toContainText('Original unchanged');
});

test('source FileTab leaves Slides without assigning the deck Studio to the source',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Project',exact:true}).click();
 const chooser=page.waitForEvent('filechooser');await page.getByRole('menuitem',{name:/Open file/i}).click();await(await chooser).setFiles({name:'index.html',mimeType:'text/html',buffer:Buffer.from('<h1>Source stays intact</h1>')});
 await page.getByRole('radio',{name:'Slides',exact:true}).click();
 await page.getByLabel('Open PPTX',{exact:true}).setInputFiles(path.resolve('slides-engine/fixtures/independent.pptx'));
 await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible({timeout:30000});
 await page.getByRole('tab',{name:'index.html',exact:true}).click();
 await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeChecked();
});
test('closing evicted and current decks leaves remaining tabs usable',async({page})=>{
 await page.goto('/');await page.getByRole('radio',{name:'Slides',exact:true}).click();
 for(let i=0;i<4;i++){await page.getByLabel('Open PPTX',{exact:true}).setInputFiles({name:`deck-${i}.pptx`,mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:requireBytes()});await expect(page.getByRole('tab',{name:`deck-${i}.pptx Close deck-${i}.pptx`,exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible({timeout:30000});}
 await page.getByRole('tab',{name:'deck-0.pptx Close deck-0.pptx',exact:true}).click();await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'Close presentation',exact:true}).click();await expect(page.getByRole('tab',{name:'deck-0.pptx Close deck-0.pptx',exact:true})).toHaveCount(0);
 await page.getByRole('tab',{name:'deck-2.pptx Close deck-2.pptx',exact:true}).click();await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible({timeout:30000});
});
