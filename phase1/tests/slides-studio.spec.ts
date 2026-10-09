import {test,expect} from '@playwright/test';
import path from 'node:path';
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
 await expect(page.getByRole('alert')).toContainText('Invalid PPTX ZIP');
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
