import {test,expect} from '../../tests/fixtures';
/** CI-only pre-migration scenarios. Run explicitly; captures are not approved baselines. */
for(const theme of ['light','dark'] as const)for(const density of ['compact','normal','comfortable'] as const)test(`${theme}/${density}: Appearance review scenario`,async({page})=>{
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();
 await page.evaluate(async({theme,density})=>{const{patchState}=await import('/src/store/appStore.ts');const{DEFAULT_LOOK}=await import('/src/lib/look.ts');patchState({theme,themeChoice:theme,contrast:'standard',look:{...DEFAULT_LOOK,density},settingsOpen:true,settingsSection:'Appearance'});},{theme,density});
 const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('App theme',{exact:true})).toBeVisible();await expect(dialog.getByLabel('Density',{exact:true})).toHaveValue(density);await page.evaluate(()=>document.fonts.ready);
 await dialog.screenshot({path:`test-results/appearance-fixtures-${theme}-${density}.png`,animations:'disabled'});
});
