import {test,expect} from './fixtures';
import {readFileSync} from 'node:fs';
import {STORE_CATALOGUES} from '../src/lib/extensions/storeLocales';
import {CONSENT_CATALOGUES} from '../src/lib/extensions/consentLocales';
const catalogues:Record<string,Record<string,string>>=Object.fromEntries(['en','de','es','fr','pt-BR'].map(tag=>[tag,{...JSON.parse(readFileSync(`src/locales/${tag}.json`,'utf8')),...STORE_CATALOGUES[tag],...CONSENT_CATALOGUES[tag]}]));
function tr(tag:string,key:string,params:Record<string,string|number>={}){const cat=catalogues[tag];const plural=typeof params.count==='number'?cat[key+'_'+new Intl.PluralRules(tag).select(params.count)]??cat[key+'_other']:undefined;return (plural??cat[key]??key).replace(/\{(\w+)\}/g,(_,k)=>String(params[k]));}
import {createHash} from 'node:crypto';
import {strToU8,zipSync} from 'fflate';
import {mkdirSync} from 'node:fs';

const manifest={id:'test.localized',name:'Locale Test',version:'1.0.0',apiVersion:1,permissions:['project.read'],contributes:{codeThemes:[{id:'test',label:'User theme',light:{'--syntax-tag':'#123456'},dark:{'--syntax-tag':'#abcdef'}}]}};
const bytes=Buffer.from(zipSync({'somnia-extension.json':strToU8(JSON.stringify(manifest))}));
const entry={...manifest,author:'Test Author',description:'Publisher description stays unchanged.',category:'Tools',repo:'https://github.com/test/localized',download:'https://raw.githubusercontent.com/test/localized/v1/package.zip',sha256:createHash('sha256').update(bytes).digest('hex')};
for(const tag of ['en','de','es','fr','pt-BR']){
 test(`${tag}: settings, catalogue review/install/error and palette use translated labels`,async({page})=>{
  const t=(key:string,params?:Record<string,string|number>)=>tr(tag,key,params);
  await page.addInitScript(l=>localStorage.setItem('somnia.locale.v1',l),tag);
  await page.addInitScript(()=>localStorage.setItem('somnia.extensions.security.v2',JSON.stringify({version:2,acknowledged:true,restricted:false,developerMode:false,extensions:{}})));
  let fail=false;
  await page.route('https://raw.githubusercontent.com/**',route=>{
   if(fail)return route.fulfill({status:429,body:'rate limit'});
   return route.request().url().endsWith('index.json')?route.fulfill({json:{schemaVersion:1,extensions:[entry]}}):route.fulfill({body:bytes});
  });
  await page.goto('/');await page.getByRole('button',{name:t('rest.iconRail.settings'),exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:t('set.section.appearance'),exact:true}).click();
  await expect(dialog.getByLabel(t('set.ap.theme'),{exact:true}).locator('option[value=dark]')).toHaveText(t('finish.settings.theme.dark'));
  await dialog.getByLabel(t('set.ap.uiscale.aria'),{exact:true}).fill('110');
  mkdirSync('tests/artifacts',{recursive:true});
  await page.screenshot({path:`tests/artifacts/i18n-${tag}-appearance.png`});
  if(tag==='pt-BR'){await dialog.getByLabel(t('set.ap.theme'),{exact:true}).selectOption('dark');await page.screenshot({path:'tests/artifacts/i18n-pt-BR-dark.png'});await dialog.getByLabel(t('set.ap.theme'),{exact:true}).selectOption('light');}
  await dialog.getByRole('button',{name:t('set.section.code'),exact:true}).click();
  await expect(dialog.getByLabel(t('set.ce.autocomplete'))).toBeVisible();
  await expect(dialog.getByLabel(t('set.ce.indent.aria')).locator('option[value="4"]')).toHaveText(t('set.ce.indent.n',{count:4}));
  await dialog.getByRole('button',{name:t('set.section.shortcuts'),exact:true}).click();
  await expect(dialog.getByLabel(t('set.sc.change.aria',{title:t('cmd.sidebar.toggle')}))).toBeVisible();
  await dialog.getByRole('button',{name:t('set.section.extensions'),exact:true}).click();
  await dialog.getByRole('button',{name:t('set.ext.open'),exact:true}).click();
  const popup=page.locator('.ext-popup');await expect(popup).toBeVisible();
  await popup.getByRole('tab',{name:t('ext.nav.browse'),exact:true}).click();
  await expect(popup.getByRole('group',{name:t('store.cat.aria')}).getByRole('button',{name:'Tools',exact:true})).toBeVisible();
  await expect(popup).toContainText(entry.description);
  await popup.getByRole('button',{name:t('store.openAria',{name:entry.name}),exact:true}).click();
  await expect(popup.getByRole('tabpanel',{name:t('store.tab.access'),exact:true})).toContainText(t('store.perm.project.read'));
  await popup.getByRole('button',{name:t('store.install'),exact:true}).click();
  const review=page.locator('.ext-consent');await expect(review).toContainText(t('extConsent.installTitle',{name:entry.name}));
  await page.screenshot({path:`tests/artifacts/i18n-${tag}-review.png`});
  await review.getByRole('button',{name:t('extConsent.installEnable'),exact:true}).click();
  await popup.getByRole('button',{name:t('store.installed'),exact:true}).click();
  await expect(popup.getByRole('switch',{name:t('ext.switch.enable',{name:entry.name}),exact:true})).not.toBeChecked();
  await popup.getByRole('switch',{name:t('ext.switch.enable',{name:entry.name}),exact:true}).check();
  await page.keyboard.press('Escape');await page.keyboard.press('Control+,');
  await dialog.getByRole('button',{name:t('set.section.code'),exact:true}).click();
  await expect(dialog.getByLabel(t('set.ce.syntax')).locator('option').filter({hasText:'User theme'})).toHaveText('User theme '+t('set.ce.syntax.ext'));
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:t('rest.iconRail.extensions'),exact:true}).click();
  fail=true;await popup.getByRole('tab',{name:t('ext.nav.browse'),exact:true}).click();
  await expect(popup.getByRole('heading',{name:t('store.unavailable.rateLimited'),exact:true})).toBeVisible();
  await expect(popup.getByRole('button',{name:t('store.retry'),exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toContainText(t('finish.palette.recent'));
  await page.getByRole('combobox',{name:t('rest.commandPalette.searchCommands')}).fill('zzzzzzzz');
  await expect(page.getByRole('dialog')).toContainText(t('finish.palette.empty'));
 });
}
test('switching locale while settings is open updates visible and accessible text without resetting preferences',async({page})=>{
 await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();await page.keyboard.press('Control+,');const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'General',exact:true}).click();
 let previous='en';
 for(const tag of ['de','es','fr','pt-BR','en']){
  await dialog.getByLabel(tr(previous,'settings.language'),{exact:true}).selectOption(tag);
  await expect(page.locator('html')).toHaveAttribute('lang',tag);
  await expect(dialog.getByRole('button',{name:tr(tag,'set.section.general'),exact:true})).toBeVisible();
  await expect(dialog.getByLabel(tr(tag,'redesign.startup'),{exact:true})).toHaveValue('last');
  previous=tag;
 }
});
