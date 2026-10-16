import {expect,type Page} from '@playwright/test';
/** Opens the code view once the app has booted; avoids pressing Ctrl+Alt+3 before shortcuts are bound. */
export async function showCode(page:Page){await expect(page.locator('[data-storage]')).toBeVisible();await expect(async()=>{await page.keyboard.press('Control+Alt+3');await expect(page.getByLabel('Source code')).toBeVisible({timeout:1000});}).toPass({timeout:20000});}

/** Opens the Components panel on "My library" with the advanced tools (variants, fields, sharing) expanded. */
export async function openMine(page:Page,advanced=true){
 await showPanel(page,'Components');
 await page.getByTestId('scope-mine').click();
 if(advanced){const d=page.getByTestId('components-advanced');if(await d.count()&&!(await d.evaluate((e:HTMLDetailsElement)=>e.open)))await d.locator(':scope > summary').click();}
}

/**
 * Makes a rail panel the ACTIVE one. Code panels stack, so a panel can be visible without being active;
 * a rail click on the active panel collapses the sidebar, so only click when it is not already active.
 */
export async function showPanel(page:Page,name:string){const b=page.getByRole('button',{name:`${name} panel`,exact:true});if((await b.getAttribute('aria-pressed'))!=='true')await b.click();await expect(b).toHaveAttribute('aria-pressed','true');}

/** Opens a generic inspector section without toggling an already expanded section closed. */
export async function showInspectorSection(page:Page,id:string){const section=page.getByTestId(`inspector-section-${id}`);await expect(section).toBeVisible();const toggle=section.locator(':scope > button[aria-expanded]');if((await toggle.getAttribute('aria-expanded'))!=='true')await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');}

/** Code has a Preview hero; Publish is the last action in its menu, not the main hero button. */
export async function openPublish(page:Page){await page.getByTestId('hero-action-menu').click();await page.getByTestId('hero-action-popup').locator('[data-command="deploy.open"]').click();await expect(page.getByTestId('publish-dialog')).toBeVisible();}

/** Chat-only panel: inspection is an explicit control under AI > Privacy & data. */
export async function allowAgentDocumentInspection(page:Page){
 const panel=page.getByRole('complementary',{name:'Somnia Agent'});
 await panel.getByRole('button',{name:'Agent configuration',exact:true}).click();
 const settings=page.getByRole('dialog');await settings.getByRole('tab',{name:'Privacy & data',exact:true}).click();
 const inspect=settings.getByRole('checkbox',{name:/Allow inspecting the active document/});await inspect.check();await expect(inspect).toBeChecked();
 await expect(panel.getByRole('checkbox',{name:/Allow inspecting/})).toHaveCount(0);
 await settings.getByRole('button',{name:'Close settings',exact:true}).click();
}
