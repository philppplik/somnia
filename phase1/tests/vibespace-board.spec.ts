import {test,expect} from '@playwright/test';

const calls=(page:import('@playwright/test').Page)=>page.evaluate(()=>(window as unknown as {boardCalls:Record<string,unknown>[]}).boardCalls);

test('A8 board: parallel runs in state columns, scheduler conflicts, per-run steer/stop to the right run',async({page})=>{
 await page.goto('/scripts/vibespace-board/fixture.html');
 // Columns map to run state; six parallel runs and one draft studio are visible.
 for(const column of['Draft','Running','Needs you','Ready','Applied / Failed'])await expect(page.getByRole('heading',{name:new RegExp(column)}).first()).toBeVisible();
 for(const goal of['Improve the landing page copy','Check external links','Improve image descriptions','Tighten the stylesheet','Check document headings','Rewrite the about page'])
  await expect(page.getByRole('button',{name:new RegExp(goal.slice(0,20))})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Plan the launch checklist'})).toBeVisible();
 // Cross-artifact review summary and no-auto-merge conflict badge on the ready card.
 const ready=page.locator('.vs-run-card',{hasText:'Improve the landing page copy'});
 await expect(ready.getByText('2 files changed')).toBeVisible();
 await expect(ready.getByText('1 conflict - compare needed, no auto-merge')).toBeVisible();
 // Scheduler time axis: same-slot and active-overlap conflicts are visible, disabled marked.
 await expect(page.getByText('Same slot: these schedules fire together on one Studio.').first()).toBeVisible();
 await expect(page.getByText('Due now, but a run of this Studio is still active.')).toBeVisible();
 await expect(page.locator('.vs-sched-item',{hasText:'Off duty'}).getByText('Off',{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/vibespace-board.png',fullPage:true});
 // Aggregate usage is honest: partial, missing values unknown (A10 contract).
 await page.getByText('Board usage',{exact:true}).click();
 await expect(page.getByText(/Partial: 3 of 6 runs reported/)).toBeVisible();
 await expect(page.getByText('Missing values are unknown, never zero.')).toBeVisible();
 await page.screenshot({path:'test-results/vibespace-board-usage.png',fullPage:true});
 // Steer goes to exactly the run whose card was used.
 const images=page.locator('.vs-run-card',{hasText:'Improve image descriptions'});
 await images.getByRole('button',{name:'Steer',exact:true}).click();
 await images.getByPlaceholder('Direction for the next step').fill('Focus on alt text first.');
 await images.getByRole('button',{name:'Send',exact:true}).click();
 let log=await calls(page);
 expect(log.at(-1)).toMatchObject({type:'steer',runId:'run-images',message:'Focus on alt text first.'});
 // Stop goes to exactly the other running run; its card leaves the active state.
 const network=page.locator('.vs-run-card',{hasText:'Check external links'});
 await network.getByRole('button',{name:'Stop',exact:true}).click();
 log=await calls(page);
 expect(log.at(-1)).toMatchObject({type:'stop',runId:'run-network'});
 await expect(page.locator('.vs-run-card',{hasText:'Check external links'}).getByText('Stopped. Partial work stays isolated.')).toBeVisible();
 await expect(page.locator('.vs-run-card',{hasText:'Check external links'}).getByRole('button',{name:'Stop',exact:true})).toHaveCount(0);
 // The still-running cards keep their own controls: no ownership bleed between runs.
 await expect(images.getByRole('button',{name:'Stop',exact:true})).toBeEnabled();
 await expect(page.locator('.vs-run-card',{hasText:'Tighten the stylesheet'}).getByRole('button',{name:'Steer',exact:true})).toBeEnabled();
 await page.screenshot({path:'test-results/vibespace-board-after-stop.png',fullPage:true});
 // Starting a draft studio fires the start intent for that studio only.
 await page.locator('.vs-card',{hasText:'Plan the launch checklist'}).getByRole('button',{name:'Start Studio',exact:true}).click();
 log=await calls(page);
 expect(log.at(-1)).toMatchObject({type:'start',studioId:'studio-draft'});
});

test('A8 board: five-locale parity renders German strings',async({page})=>{
 await page.goto('/scripts/vibespace-board/fixture.html?locale=de');
 await expect(page.getByRole('heading',{name:/Braucht dich/}).first()).toBeVisible();
 await expect(page.getByText(/kein Auto-Merge/)).toBeVisible();
 await expect(page.getByText('Gleicher Slot: Diese Zeitpläne feuern gemeinsam auf ein Studio.').first()).toBeVisible();
});
