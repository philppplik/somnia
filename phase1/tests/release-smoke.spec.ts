import {test,expect} from './fixtures';
import {readFileSync} from 'node:fs';
const release=JSON.parse(readFileSync('package.json','utf8')).somniaRelease as string;
const studios=[
 ['Code','code','view.livePreview'],['Documents','documents','documents.export.open'],
 ['Sheets','sheets','sheets.formulas.open'],['Slides','slides','slides.present'],
 ['Photos','photos','photos.export.open'],['Sound','sound','sound.export.open'],
 ['Video','video','video.export.open'],['Vector','vector','vector.export.open'],
 ['Design','design','design.export.open'],['Vibe Space','vibespace','vibespace.task.new'],
] as const;
test.use({sample:false});
test.beforeEach(async({page})=>{
 // Offline responses only: never hit release/catalog services or use real accounts.
 await page.route('https://api.github.com/**',r=>r.fulfill({json:[]}));
 await page.route('https://raw.githubusercontent.com/**',r=>r.fulfill({json:{schemaVersion:1,extensions:[]}}));
});
for(const [label,id,hero] of studios){
 test(`release smoke: ${id} shell and empty-document hero gate`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  const radio=page.getByRole('radio',{name:new RegExp(`^(Somnia )?${label}$`)});
  await radio.click();await expect(radio).toHaveAttribute('aria-checked','true');
  await expect(page.getByTestId('hero-action')).toHaveAttribute('data-hero-id',hero);
  const button=page.getByTestId('hero-action-main');await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName(/\S/);
  // No document, native service or selected space: a hero must not export/run empty work.
  await expect(button).toBeDisabled();
  await expect(page.locator('header').first()).toBeVisible();
  await expect(page.getByRole('radiogroup',{name:'Studios',exact:true}).getByRole('radio')).toHaveCount(10);
  await page.evaluate(()=>document.fonts.ready);
  const screenshot=await page.screenshot({path:`test-results/release-shell-${id}.png`});
  await info.attach(`${id}-shell`,{body:screenshot,contentType:'image/png'});
  expect(errors).toEqual([]);
 });
}
test('release smoke: Settings apply, close and survive reload',async({page})=>{
 await page.goto('/');await expect(page.getByTestId('empty-state')).toBeVisible();
 await page.keyboard.press('Control+,');const dialog=page.getByRole('dialog');
 await expect(dialog).toBeVisible();await dialog.getByLabel('Reduce interface motion').selectOption('reduce');
 await expect(page.locator('html')).toHaveAttribute('data-motion','reduce');
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await page.reload();await expect(page.getByTestId('empty-state')).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('data-motion','reduce');
});
test('release smoke: real Code tabs close without exposing another studio tab',async({page})=>{
 await page.goto('/');await page.getByTestId('empty-state').getByRole('button',{name:'New blank page'}).click();
 await page.getByRole('button',{name:'View',exact:true}).click();
 await page.getByRole('menuitemradio',{name:/Code view/}).click();
 const tab=page.getByRole('tab',{name:/^index\.html(?: Close index\.html)?$/});await expect(tab).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Vector',exact:true}).click();await expect(tab).toHaveCount(0);
 await page.getByRole('radio',{name:'Somnia Code',exact:true}).click();await expect(tab).toBeVisible();
 await page.getByRole('button',{name:'Close index.html',exact:true}).click();await expect(tab).toHaveCount(0);
});
test('release smoke: update pill waits for a completed check, not a sleep',async({page})=>{
 await page.goto('/');await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('somnia.updateCheck.last')||'null')?.result)).toBe('up-to-date');
 await expect(page.getByTestId('update-pill')).toHaveCount(0);
});
test('release smoke: newer stable pill appears and disabling checks removes it',async({page})=>{
 const major=Number(release.split('.')[0])+1;const version=`${major}.0.0`;
 const url=`https://github.com/philppplik/somnia/releases/tag/v${version}`;
 await page.route('https://api.github.com/repos/philppplik/somnia/releases*',r=>r.fulfill({json:[{tag_name:`v${version}`,html_url:url,prerelease:false,assets:[]}]}));
 await page.goto('/');const pill=page.getByTestId('update-pill');
 await expect(pill).toContainText(version);await expect(pill).toHaveAttribute('href',url);
 await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Updates',exact:true}).click();
 await page.getByRole('checkbox',{name:'Check for updates on start'}).uncheck();await expect(pill).toHaveCount(0);
});
