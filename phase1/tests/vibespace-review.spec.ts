import {test,expect} from '@playwright/test';
test('review hunk selection, request-changes, consent history, usage, and honest pause gap',async({page})=>{
 await page.goto('/scripts/vibespace-review/fixture.html');await page.getByRole('button',{name:/Improve the landing/}).click();
 await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeDisabled();
 await page.getByText('Token usage',{exact:true}).click();await expect(page.getByText('Cached tokens',{exact:true})).toBeVisible();await expect(page.getByText('900',{exact:true})).toBeVisible();
 await expect(page.getByText('Consent decision',{exact:true})).toBeVisible();await expect(page.getByText('deny',{exact:true})).toBeVisible();
 await page.getByText('Steps and consent timeline',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/vibespace-timeline.png',fullPage:true});
 await page.getByText('Token usage',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/vibespace-usage.png',fullPage:true});
 await page.getByRole('checkbox',{name:'Include hunk 1 index.html',exact:true}).check();
 await expect(page.getByRole('checkbox',{name:'Include hunk 2 index.html',exact:true})).not.toBeChecked();
 await page.getByText('Studio preview',{exact:true}).click();await expect(page.locator('iframe[title="Studio preview index.html"]')).toHaveAttribute('sandbox','');
 await page.screenshot({path:'test-results/vibespace-review.png',fullPage:true});
 await page.getByRole('button',{name:'Apply selected hunks',exact:true}).click();await expect(page.getByRole('group',{name:'Confirm final selection'})).toContainText('Unselected changes stay out');
 await page.getByRole('button',{name:'Confirm Apply',exact:true}).click();
 const calls=await page.evaluate(()=> (window as unknown as {reviewFixture:{calls:{type:string;hunks?:unknown[]}[]}}).reviewFixture.calls);expect(calls.at(-1)).toMatchObject({type:'apply-hunks',hunks:[{path:'index.html',hunkIds:['fixture-hunk-1']}]});
 await page.reload();await page.getByRole('button',{name:/Improve the landing/}).click();await page.getByRole('textbox',{name:'What should change?'}).fill('Keep the title, make the copy shorter.');await page.getByRole('button',{name:'Start new reviewed run'}).click();
 const change=await page.evaluate(()=> (window as unknown as {reviewFixture:{calls:unknown[]}}).reviewFixture.calls.at(-1));expect(change).toMatchObject({type:'request-changes',reviewRevision:'review-1',message:'Keep the title, make the copy shorter.'});
});
