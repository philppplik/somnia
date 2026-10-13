import test from 'node:test';
import assert from 'node:assert/strict';
import {vibespaceShell,VIBESPACE_LAYOUT} from '../studios/vibespace';
import {validateStudioShell,resolveInspectorSections,stackPanels} from '../shell/panels';
import {effectiveRail} from '../shell/railResolver';
import {registerRailIcons,hasRailIcon} from '../shell/railIcons';
import {Bot,Info,LayoutTemplate,AlertTriangle,Lightbulb,Puzzle} from '../icons';
import {claimVibeShell,getVibeShellState,vibeShellReady} from './shellSession';
import {registerVibeSpaceCommands,VIBESPACE_COMMANDS} from './commands';
import {commandRegistry} from '../commandRegistry';
import {fixtureSnapshot} from './fixture';
import {VIBESPACE_CATALOGUES} from './i18n';
registerRailIcons({Bot,Info,LayoutTemplate,AlertTriangle,Lightbulb,Puzzle});
const loaded=()=>({view:{snapshot:fixtureSnapshot(),loading:false,pending:false,error:null},spaceId:'space-demo',runId:null,native:false,canCreateSpace:true,canCreateStudio:true});
test('manifest has valid icons, hosts, commands and default stacks',()=>{
 const hosts=new Set(vibespaceShell.panels!.map(p=>p.component)),sections=new Set(vibespaceShell.inspector!.sections.map(s=>s.component));
 assert.deepEqual(validateStudioShell('vibespace',vibespaceShell,{hostExists:id=>hosts.has(id),sectionHostExists:id=>sections.has(id),iconExists:hasRailIcon,commandExists:id=>(VIBESPACE_COMMANDS as readonly string[]).includes(id)}),[]);
 const ctx={studio:'vibespace',selection:{kind:'none',count:0},services:{}};
 assert.deepEqual(stackPanels(vibespaceShell.panels!,'left',VIBESPACE_LAYOUT.leftPanels,ctx).map(p=>p.id),['spaces']);
 assert.deepEqual(stackPanels(vibespaceShell.panels!,'right',VIBESPACE_LAYOUT.rightPanels,ctx).map(p=>p.id),['inspector']);
 assert.deepEqual(resolveInspectorSections(vibespaceShell.inspector!.sections,ctx).map(s=>s.id),['space']);
 assert.deepEqual(resolveInspectorSections(vibespaceShell.inspector!.sections,{...ctx,selection:{kind:'one',count:1},services:{usage:true,checkpoints:true}}).map(s=>s.id),['space','run','usage','checkpoints']);
});
test('rails reorder, hide, pin and overflow without changing definitions',()=>{
 const rail=vibespaceShell.leftRail!;
 assert.deepEqual(effectiveRail(rail,undefined,{ctx:{}}).visible.map(r=>r.id),['spaces','runs','attention']);
 assert.deepEqual(effectiveRail(rail,{order:['attention','runs','spaces'],hidden:['runs'],unpinned:['spaces']},{ctx:{}}).visible.map(r=>r.id),['attention']);
 assert.deepEqual(effectiveRail(rail,{unpinned:['spaces']},{ctx:{}}).overflow.map(r=>r.id),['spaces']);
 assert.equal(rail[0].id,'spaces');
 assert.deepEqual(effectiveRail(vibespaceShell.rightRail!,undefined,{ctx:{services:{space:true,native:true}}}).overflow.map(r=>r.id),['skills']);
 assert.deepEqual(effectiveRail(vibespaceShell.rightRail!,undefined,{ctx:{services:{space:true,native:false}}}).visible.map(r=>r.id),['inspector']);
});
test('stale canvas cannot clear or overwrite current shell projection',()=>{
 const a=claimVibeShell(),b=claimVibeShell();b.report(loaded());a.release();assert.equal(getVibeShellState().spaceId,'space-demo');a.report({...loaded(),spaceId:'wrong'});assert.equal(getVibeShellState().spaceId,'space-demo');b.release();assert.equal(getVibeShellState().view.snapshot,null);
});
test('commands only navigate and validate exact loaded ids; errors lock navigation',async()=>{
 const b=claimVibeShell();b.report(loaded());const calls:string[]=[];
 const off=registerVibeSpaceCommands({selectSpace:id=>{calls.push(id);},openRun:id=>{calls.push(id);},home:()=>{calls.push('home');},newSpace:()=>{calls.push('newSpace');},newStudio:()=>{calls.push('newStudio');},refresh:()=>{calls.push('refresh');}});
 try{
  const select=commandRegistry.get('vibespace.space.select')!,open=commandRegistry.get('vibespace.run.open')!;
  assert.equal(select.enabled!(),true);assert.deepEqual((select.argsSchema?.required),['spaceId']);
  await select.run({spaceId:'space-demo'});await open.run({runId:'run-copy'});
  await assert.rejects(async()=>open.run({runId:'wrong'}),/not loaded/);await assert.rejects(async()=>select.run({spaceId:17}),/Missing/);
  assert.deepEqual(calls,['space-demo','run-copy']);
  assert.equal(select.agentCallable,false);assert.equal(select.risk,'none');
  b.report({...loaded(),view:{...loaded().view,error:'reconcile'}});assert.equal(vibeShellReady(),false);assert.equal(select.enabled!(),false);assert.equal(commandRegistry.get('vibespace.refresh')!.enabled!(),true);
  b.report({...loaded(),view:{...loaded().view,pending:true}});assert.equal(commandRegistry.get('vibespace.refresh')!.enabled!(),false);
 }finally{off();b.release();}
 for(const id of VIBESPACE_COMMANDS)assert.equal(commandRegistry.has(id),false);
});
test('all shell and command keys have parity and translated values in five locales',()=>{
 const entries=Object.entries(VIBESPACE_CATALOGUES);assert.equal(entries.length,5);
 const keys=Object.keys(entries[0][1]).filter(k=>k.startsWith('vibespace.shell.')||k.startsWith('cmd.vibespace.')).sort();
 for(const [locale,c] of entries){assert.deepEqual(Object.keys(c).filter(k=>k.startsWith('vibespace.shell.')||k.startsWith('cmd.vibespace.')).sort(),keys,locale);for(const key of keys)assert.ok(c[key].trim(),`${locale}:${key}`);}
});

test('New task opens the right existing form and rejects stale/missing capabilities',async()=>{
 const owner=claimVibeShell(),calls:string[]=[];const off=registerVibeSpaceCommands({selectSpace:()=>{},openRun:()=>{},home:()=>{},refresh:()=>{},newSpace:()=>{calls.push('space');},newStudio:()=>{calls.push('studio');}});
 const c=commandRegistry.get('vibespace.task.new')!;
 try{
  owner.report(loaded());assert.equal(c.enabled!(),true);await c.run();assert.deepEqual(calls,['studio']);assert.equal(c.agentCallable,false);
  owner.report({...loaded(),spaceId:null});await c.run();assert.deepEqual(calls,['studio','space']);
  owner.report({...loaded(),spaceId:'removed',canCreateSpace:false});assert.equal(c.enabled!(),false);
  owner.report({...loaded(),canCreateStudio:false});assert.equal(c.enabled!(),false);
  owner.report({...loaded(),view:{...loaded().view,loading:true}});assert.equal(c.enabled!(),false);
 }finally{off();owner.release();}
});
