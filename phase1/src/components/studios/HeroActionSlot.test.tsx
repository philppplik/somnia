import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import '../../lib/studios';
import {registerStudio,getStudio} from '../../lib/studios/registry';
import {registerCommand} from '../../lib/commandRegistry';
import {HeroActionSlot} from '../shell/HeroActionSlot';
import {patchState} from '../../store/appStore';
import {setLocale} from '../../lib/i18n';
import type {StudioDef} from '../../lib/studios/registry';
import type {HeroActionDef} from '../../lib/shell/types';
const hero:HeroActionDef={id:'herotest.go',labelKey:'hero.more',icon:'Play',menu:['herotest.extra']};
const base=getStudio('slides');
const make=(id:string,heroAction?:HeroActionDef):StudioDef=>({...base,id,order:900,shell:{...base.shell,header:{...base.shell.header,heroAction}}});
const offs=[registerStudio(make('herotest-with',hero)),registerStudio(make('herotest-none')),registerStudio(make('herotest-missing',{...hero,id:'herotest.absent'}))];
offs.push(registerCommand({id:'herotest.go',title:'Go',category:'Tools',shortcut:'Mod+G',run:()=>{}}),registerCommand({id:'herotest.extra',title:'Extra thing',category:'Tools',run:()=>{}}));
test('a studio with header.heroAction renders the slot from data, with menu entries and Publish last',()=>{
 patchState({activeStudio:'herotest-with'});
 const html=renderToStaticMarkup(<HeroActionSlot/>);
 assert.match(html,/data-testid="hero-action"[^>]*data-hero-id="herotest.go"/);
 assert.match(html,/aria-label="More actions"/,'label is the accessible name');
 assert.ok(html.includes('data-testid="hero-action-main"')&&html.includes('data-icon='));
 assert.ok(html.includes('class="max-w-[120px] truncate max-[960px]:hidden"'),'label collapses below 960px');
});
test('a studio without the field renders no hero slot (old Publish path)',()=>{
 patchState({activeStudio:'herotest-none'});assert.ok(!renderToStaticMarkup(<HeroActionSlot/>).includes('hero-action'));
 patchState({activeStudio:'herotest-missing'});assert.ok(!renderToStaticMarkup(<HeroActionSlot/>).includes('hero-action'),'unregistered hero command falls back');
});
test('Slides declares Present; unmigrated studios keep Publish',()=>{
 for(const id of ['design','vector','photos','sound','video'])assert.equal(getStudio(id).shell.header.heroAction,undefined,id);
 assert.equal(getStudio('slides').shell.header.heroAction?.id,'slides.present');
 });
test('code, documents and sheets declare their hero actions; the other studios keep Publish',()=>{
 assert.deepEqual(getStudio('code').shell.header.heroAction,{id:'view.livePreview',labelKey:'hero.preview',icon:'Play',pressedWhen:'preview',pressedTooltipKey:'hero.preview.close'});
 assert.deepEqual(getStudio('documents').shell.header.heroAction,{id:'documents.export.open',labelKey:'hero.export',icon:'Download',menu:['documents.saveCopy']});
 assert.deepEqual(getStudio('sheets').shell.header.heroAction,{id:'sheets.formulas.open',labelKey:'hero.smartFormula',icon:'CodeXml',menu:['sheets.saveCopy']});
 for(const id of ['design','vector','photos','sound','video'])assert.equal(getStudio(id).shell.header.heroAction,undefined,id);
});
test('the code hero renders Preview as a toggle whose pressed state follows livePreview',()=>{
 const off=registerCommand({id:'view.livePreview',title:'Toggle live preview',category:'View',run:()=>{}});
 patchState({activeStudio:'code',livePreview:false});
 let html=renderToStaticMarkup(<HeroActionSlot/>);
 assert.match(html,/data-testid="hero-action"[^>]*data-hero-id="view.livePreview"/);
 assert.match(html,/aria-label="Preview"/);
 assert.match(html,/aria-pressed="false"/);
 patchState({livePreview:true});
 html=renderToStaticMarkup(<HeroActionSlot/>);
 assert.match(html,/aria-pressed="true"/);
 assert.match(html,/bg-accent-soft/);
 patchState({livePreview:false});
 off();
});
test('the label is localized',()=>{
 patchState({activeStudio:'herotest-with'});setLocale('de');const de=renderToStaticMarkup(<HeroActionSlot/>);setLocale('en');
 assert.match(de,/aria-label="Weitere Aktionen"/);
});
test('shared JSX has no studio-ID branches and only talks to executeCommand',()=>{
 for(const f of ['../shell/HeroActionSlot.tsx','../../lib/shell/heroAction.ts']){
  const src=readFileSync(new URL(f,import.meta.url),'utf8');
  assert.ok(!/activeStudio\s*[=!]==|studio\.id\s*[=!]==|['"](code|design|vector|photos|sheets|slides|documents|sound|video|vibespace)['"]/.test(src),`${f} branches on a studio id`);
 }
 assert.ok(readFileSync(new URL('../shell/HeroActionSlot.tsx',import.meta.url),'utf8').includes('executeCommand(resolved.id)'));
});
test.after(()=>{patchState({activeStudio:'code'});offs.forEach(o=>o());});
