import {test,expect,type Page} from '@playwright/test';
async function launch(page:Page,name='Fixture Agent'){
 await page.getByRole('textbox',{name:'Agent name',exact:true}).fill(name);
 await page.getByRole('textbox',{name:'Executable path',exact:true}).fill('/usr/bin/fake-agent');
 await page.getByRole('button',{name:'Launch external agent',exact:true}).click();
 await expect(page.getByRole('alertdialog')).toContainText('Start an isolated external agent');
 await page.getByRole('button',{name:'Allow once',exact:true}).click();
 await expect(page.getByRole('button',{name:'New session',exact:true})).toBeEnabled();
}
test('native bridge launch, session, prompt, pending consent, decision, transcript and close',async({page})=>{
 await page.goto('/scripts/vibespace-acp/fixture.html');await launch(page);
 await page.getByRole('button',{name:'New session',exact:true}).click();
 await page.getByRole('textbox',{name:'Prompt',exact:true}).fill('Edit the isolated note');
 await page.getByRole('button',{name:'Send prompt',exact:true}).click();
 const consent=page.getByRole('alertdialog');await expect(consent).toContainText('External agent: Fixture Agent');await expect(consent).toContainText('note.txt');
 await expect(consent.getByRole('button',{name:'Allow for this run',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Send prompt',exact:true})).toBeDisabled();
 await page.screenshot({path:'test-results/vibespace-acp-consent.png',fullPage:true});
 await consent.getByRole('button',{name:'Deny',exact:true}).click();
 await expect(page.getByText('Denied: write - note.txt',{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/vibespace-acp-transcript.png',fullPage:true});
 const calls=await page.evaluate(()=>(window as any).acpFixture.calls);
 expect(calls.filter((c:any)=>c.cmd==='vibespace_acp_decide_consent').map((c:any)=>c.args.request.choice)).toEqual(['allow_once','deny']);
 expect(calls.filter((c:any)=>c.cmd==='vibespace_acp_prompt')[0].args.request).toEqual({sessionKey:'acp-1',text:'Edit the isolated note'});
 await page.getByRole('button',{name:'Close agent',exact:true}).click();await expect(page.getByRole('button',{name:'New session',exact:true})).toBeDisabled();
});
test('unavailable bridge fails closed and German strings render',async({page})=>{
 await page.goto('/scripts/vibespace-acp/fixture.html?unavailable&locale=de');
 await expect(page.getByRole('status')).toContainText('Native ACP-Verbindung nicht verfügbar');
 await expect(page.getByRole('button',{name:'Externen Agenten starten',exact:true})).toBeDisabled();
});
test('state read failure disables previously ready consent and prompt controls',async({page})=>{
 await page.goto('/scripts/vibespace-acp/fixture.html');await launch(page);
 await page.getByRole('button',{name:'New session',exact:true}).click();
 await page.evaluate(()=>(window as any).acpFixture.failReads());
 await expect(page.getByRole('alert')).toContainText('State could not be read');
 await expect(page.getByRole('button',{name:'New session',exact:true})).toBeDisabled();
 await expect(page.getByRole('textbox',{name:'Prompt',exact:true})).toBeDisabled();
});
test('four live sessions block launches and latest-event window is explicit',async({page})=>{
 await page.goto('/scripts/vibespace-acp/fixture.html');
 for(let n=1;n<=4;n++)await launch(page,'Agent '+n);
 await expect(page.getByRole('button',{name:'Launch external agent',exact:true})).toBeDisabled();
 await expect(page.getByText('Four active agents already. Close one before launching another.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Agent 1 · Ready',exact:true}).click();
 await page.evaluate(()=>(window as any).acpFixture.fillEvents());
 await expect(page.getByText('The event window is full. Only the latest 500 events are shown.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close agent',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Agent name',exact:true})).toBeEnabled();
});
test('prompt limit is shown and enforced before native invocation',async({page})=>{
 await page.goto('/scripts/vibespace-acp/fixture.html');await launch(page);
 await page.getByRole('button',{name:'New session',exact:true}).click();
 await page.getByRole('textbox',{name:'Prompt',exact:true}).fill('x'.repeat(100_001));
 await expect(page.getByText('Prompt exceeds 100000 characters.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Send prompt',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>(window as any).acpFixture.calls.filter((c:any)=>c.cmd==='vibespace_acp_prompt').length)).toBe(0);
});
test('A5 review docking exposes ACP tab with native-unavailable actions disabled',async({page})=>{
 await page.goto('/scripts/vibespace-acp/fixture.html?dock');
 await page.getByRole('tab',{name:'External agents (ACP)',exact:true}).click();
 await expect(page.getByRole('tabpanel',{name:'External agents (ACP)',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Launch external agent',exact:true})).toBeDisabled();
 await page.screenshot({path:'test-results/vibespace-acp-dock.png',fullPage:true});
 await page.getByRole('tab',{name:'Review',exact:true}).click();
 await expect(page.getByRole('tabpanel',{name:'External agents (ACP)',exact:true})).not.toBeVisible();
});
