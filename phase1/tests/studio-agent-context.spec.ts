import {test,expect} from './fixtures';
for(const theme of ['light','dark'])test(`one agent conversation follows Code/Photos in ${theme}`,async({page})=>{
 const requests:any[]=[];
 await page.route('http://127.0.0.1:11434/api/show',r=>r.fulfill({json:{model_info:{architecture:'fixture'},capabilities:['completion','tools']}}));
 await page.route('http://127.0.0.1:11434/api/chat',r=>{requests.push(r.request().postDataJSON());return r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({message:{content:'Conversation retained.'},done:true})+'\n'});});
 await page.goto('/');await page.evaluate(async theme=>{const {patchState}=await import('/src/store/appStore.ts');patchState({theme:theme as 'light'|'dark',themeChoice:theme as 'light'|'dark'});},theme);
 await page.getByRole('button',{name:'Open Somnia Agent'}).click();const panel=page.getByRole('complementary',{name:'Somnia Agent'});
 await expect(panel.getByTestId('agent-studio-chip')).toHaveText('Code');
  await panel.getByRole('button',{name:'Agent configuration',exact:true}).click();const settings=page.getByRole('dialog');await settings.getByLabel('Model',{exact:true}).fill('fixture');await settings.getByRole('button',{name:'Save AI settings',exact:true}).click();await settings.getByText('Configuration saved.',{exact:true}).waitFor();await settings.getByRole('tab',{name:'Privacy & data',exact:true}).click();await settings.getByRole('checkbox',{name:'Allow inspecting the active document and selection. Edits still need preview acceptance.',exact:true}).check();await settings.getByText('Local prompt context and templates',{exact:true}).click();await settings.getByRole('checkbox',{name:'Reuse chat history (size unknown)',exact:true}).check();await settings.getByRole('button',{name:'Close settings',exact:true}).click();
 await panel.getByLabel('Message to Somnia Agent').fill('Remember this conversation');await panel.getByRole('button',{name:'Send',exact:true}).click();await expect(panel.getByText('Conversation retained.',{exact:true})).toBeVisible();
 expect(requests[0].tools.map((t:any)=>t.function.name)).toEqual(['code_read_range','dom_inspect','code_propose_html','dom_set_attribute']);
 await panel.screenshot({path:`tests/artifacts/m5-code-${theme}.png`});
 await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('photos');});
 await expect(panel.getByTestId('agent-studio-chip')).toHaveText('Photos');await expect(panel.getByText('Remember this conversation',{exact:true})).toBeVisible();
 await panel.screenshot({path:`tests/artifacts/m5-photos-${theme}.png`});
 // Empty Photos cannot offer Code tools and keeps the same history.
 await panel.getByLabel('Message to Somnia Agent').fill('Continue in Photos');await panel.getByRole('button',{name:'Send',exact:true}).click();await expect(panel.locator('.ag-answer')).toHaveCount(2);expect(requests[1].tools??[]).toEqual([]);
 expect(requests[1].messages.some((m:any)=>m.content==='Remember this conversation')).toBe(true);
 expect(requests[1].messages.some((m:any)=>m.content.includes('Now in Photos'))).toBe(true);
 await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('sound');});await expect(panel.getByTestId('agent-studio-chip')).toHaveCount(0);await expect(panel.locator('.ag-answer')).toHaveCount(2);
});
