import {test,expect} from '@playwright/test';
test('external-agent desktop consent stays unavailable, visible in review and transcript',async({page})=>{
 await page.goto('/scripts/vibespace-computer-use/fixture.html');
 const consent=page.getByRole('region',{name:'Needs you consent'});
 await expect(consent).toContainText('Codex external agent: screen_capture');
 await expect(consent).toContainText('Folder and MCP grants do not apply');
 await expect(consent.getByRole('button',{name:'Allow once',exact:true})).toBeDisabled();
 await expect(consent.getByRole('button',{name:'Allow for this run',exact:true})).toBeDisabled();
 await expect(consent.locator('[data-computer-use="unavailable"]')).toContainText('Windows and macOS are disabled');
 await page.getByText('Run transcript',{exact:true}).click();
 await expect(page.getByText('Computer use: Codex external agent, screen_capture denied.',{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/vibespace-computer-use-consent.png',fullPage:true});
 await consent.getByRole('button',{name:'Deny',exact:true}).click();
 const calls=await page.evaluate(()=> (window as unknown as {computerUseFixture:{calls:unknown[]}}).computerUseFixture.calls);
 expect(calls).toEqual([{type:'consent',runId:'run-copy',requestId:'desktop-1',choice:'deny'}]);
});
test('German computer-use preparation notice is localized',async({page})=>{
 await page.goto('/scripts/vibespace-computer-use/fixture.html?locale=de');
 await expect(page.locator('[data-computer-use="unavailable"]').first()).toContainText('Computer-Steuerung ist nicht verfügbar');
 await expect(page.locator('[data-computer-use="unavailable"]').first()).toContainText('Ordner- und MCP-Freigaben gelten nicht');
});
