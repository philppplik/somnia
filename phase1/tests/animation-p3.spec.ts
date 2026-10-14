import {test,expect} from './fixtures';
/** CI-only: needs full app/native/WASM prerequisites. */
test('Animation P3 effects, hierarchy, presets, markers and local snapshot round-trip',async({page})=>{
 await page.goto('/');await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('animation');});await page.getByTestId('animation-create-blank').click();await page.getByTestId('animation-add-text').click();
 await page.getByRole('button',{name:'Typewriter',exact:true}).click();
 await page.getByRole('button',{name:'Blur +',exact:true}).click();await page.getByLabel('Animate strength',{exact:true}).check();
 await page.getByTestId('animation-timeline').getByLabel('Next frame').click();await page.getByLabel('Amount',{exact:true}).fill('5');await page.getByLabel('Amount',{exact:true}).press('Enter');
 await page.getByRole('button',{name:'Marker +',exact:true}).click();await expect(page.getByRole('group',{name:'Timing markers'})).toContainText('00:00:00:01');
 await page.getByTestId('animation-add-null').click();
 await page.getByTestId('animation-timeline').getByRole('button',{name:'Text 1',exact:true}).click();await page.getByLabel('Parent layer',{exact:true}).selectOption({label:'Null 1 (Null)'});
 // Force the supported download-copy route. CI does not automate an OS file picker.
 await page.evaluate(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}));
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save local .somnia snapshot',exact:true}).click();const file=await download;const path=await file.path();expect(path).toBeTruthy();await expect(page.getByRole('status')).toContainText('Downloaded a copy');
 await page.getByLabel('Open local snapshot',{exact:true}).setInputFiles(path!);await expect(page.getByRole('status')).toContainText('Snapshot opened');await expect(page.getByLabel('Parent layer',{exact:true})).not.toHaveValue('');await expect(page.getByLabel('Animate strength',{exact:true})).toBeChecked();
});
