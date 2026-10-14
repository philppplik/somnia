import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {listStudios} from '../studios';
import {studioDefaultLayout,studioPanels} from './codePanels';
import {createShellLayoutStore,sanitizeShellLayout} from '../../store/shellLayoutStore';

const KEY='somnia.shellLayout.v1';
const studios=listStudios();
function memory(seed?:unknown){
 const data=new Map<string,string>(seed?[[KEY,JSON.stringify(seed)]]:[]);
 return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
}
for(const studio of studios){
 const defaults=studioDefaultLayout(studio),panels=studioPanels(studio);
 test(`${studio.id}: first visit opens inspector; restore preserves closed sides, stacks, active panels and widths`,()=>{
  assert.ok(panels.length);
  const storage=memory(),store=createShellLayoutStore(storage);
  const initial=store.get(studio.id,defaults,panels);
  assert.equal(initial.rightOpen,true);
  assert.ok(initial.rightPanels.length,'inspector/develop stack is present');
  assert.deepEqual(initial.rightPanels,defaults.rightPanels);
  const left=panels.filter(p=>p.side==='left').map(p=>p.id).slice(-2);
  const right=panels.filter(p=>p.side==='right').map(p=>p.id).slice(-2);
  const changed=store.update(studio.id,{leftOpen:false,rightOpen:false,leftWidth:331,rightWidth:377,leftPanels:left,rightPanels:right,activeLeft:left.at(-1),activeRight:right.at(-1),collapsedPanels:[...left,...right]},defaults,panels);
  const restored=createShellLayoutStore(storage).get(studio.id,defaults,panels);
  assert.deepEqual(restored,changed);
  store.update(studio.id,{leftPanels:[],rightPanels:[],leftOpen:false,rightOpen:false},defaults,panels);
  const closed=createShellLayoutStore(storage).get(studio.id,defaults,panels);
  assert.deepEqual(closed.leftPanels,[]);assert.deepEqual(closed.rightPanels,[]);
  assert.equal(closed.rightOpen,false);
 });
 test(`${studio.id}: partial/stale saved stacks recover defaults without overriding saved visibility`,()=>{
  const partial=sanitizeShellLayout({rightOpen:false,rightWidth:367},defaults,panels);
  assert.deepEqual(partial.rightPanels,defaults.rightPanels);assert.equal(partial.rightOpen,false);
  const stale=sanitizeShellLayout({leftPanels:['removed'],rightPanels:['removed']},defaults,panels);
  assert.deepEqual(stale.leftPanels,defaults.leftPanels);assert.deepEqual(stale.rightPanels,defaults.rightPanels);
 });
}
test('Code legacy right tabs migrate into the shared inspector, including collapse and closed visibility',()=>{
 const code=studios.find(s=>s.id==='code')!;
 const store=createShellLayoutStore(memory({version:1,layouts:{code:{rightOpen:false,rightWidth:365,rightPanels:['design','prototype','code'],activeRight:'prototype',collapsedPanels:['design']}}}));
 const restored=store.get('code',studioDefaultLayout(code),studioPanels(code));
 assert.deepEqual(restored.rightPanels,['inspector']);assert.equal(restored.activeRight,'inspector');
 assert.deepEqual(restored.collapsedPanels,['inspector']);assert.equal(restored.rightOpen,false);assert.equal(restored.rightWidth,365);
});
test('updating one studio retains unvisited saved layouts',()=>{
 const storage=memory(),store=createShellLayoutStore(storage);
 for(const studio of studios)store.update(studio.id,{rightWidth:381,rightOpen:false},studioDefaultLayout(studio),studioPanels(studio));
 const reload=createShellLayoutStore(storage),code=studios.find(s=>s.id==='code')!;
 reload.update('code',{rightOpen:true},studioDefaultLayout(code),studioPanels(code));
 const again=createShellLayoutStore(storage);
 for(const studio of studios){const restored=again.get(studio.id,studioDefaultLayout(studio),studioPanels(studio));assert.equal(restored.rightWidth,381);assert.equal(restored.rightOpen,studio.id==='code');}
});
// Separate processes model a real module/app restart, not just a new storage wrapper.
function appRun(script:string,storage:Record<string,string>={}){
 const result=spawnSync(process.execPath,['--import','tsx','--import','./scripts/test-css-register.mjs','--input-type=module','-e',`
  import assert from 'node:assert/strict';
  const data=new Map(Object.entries(JSON.parse(process.env.LAYOUT_STORAGE)));
  globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const {getState,patchState}=await import('./src/store/appStore.ts');
  const {listStudios}=await import('./src/lib/studios/index.ts');
  const {studioPanels,studioDefaultLayout}=await import('./src/lib/shell/codePanels.ts');
  const {shellLayoutStore}=await import('./src/store/shellLayoutStore.ts');
  ${script}
  console.log(JSON.stringify(Object.fromEntries(data)));
 `],{encoding:'utf8',env:{...process.env,LAYOUT_STORAGE:JSON.stringify(storage)}});
 assert.equal(result.status,0,result.stderr||result.stdout);
 return JSON.parse(result.stdout.trim().split('\n').at(-1)!) as Record<string,string>;
}
test('appStore ignores global legacy visibility on first Code visit and restores every studio across switches and restart',()=>{
 const saved=appRun(`
  assert.equal(getState().inspectorOpen,true);assert.equal(getState().sidebarOpen,true);
  for(const studio of listStudios()){
   patchState({activeStudio:studio.id});
   assert.equal(getState().inspectorOpen,true,studio.id+' first inspector');
   const panels=studioPanels(studio),defaults=studioDefaultLayout(studio);
   const left=panels.filter(p=>p.side==='left').at(-1)?.id;
   const right=panels.filter(p=>p.side==='right').at(-1)?.id;
   shellLayoutStore.update(studio.id,{leftPanels:left?[left]:[],rightPanels:right?[right]:[],activeLeft:left,activeRight:right},defaults,panels);
   patchState({sidebarOpen:false,inspectorOpen:false,sidebarWidth:339,inspectorWidth:379});
  }
 `,{'somnia.panels.v1':JSON.stringify({sidebarOpen:false,inspectorOpen:false})});
 appRun(`
  for(const studio of [...listStudios(),...listStudios()]){
   patchState({activeStudio:studio.id});
   assert.equal(getState().sidebarOpen,false,studio.id);assert.equal(getState().inspectorOpen,false,studio.id);
   assert.equal(getState().sidebarWidth,339,studio.id);assert.equal(getState().inspectorWidth,379,studio.id);
   const layout=shellLayoutStore.get(studio.id,studioDefaultLayout(studio),studioPanels(studio));
   const left=studioPanels(studio).filter(p=>p.side==='left').at(-1)?.id;
   assert.equal(layout.activeLeft,left,studio.id+' active left');
   assert.equal(getState().leftTab,left??'layers',studio.id+' app active left');
   assert.equal(getState().rightTab,layout.activeRight,studio.id+' app active right');
  }
 `,saved);
});

test('unavailable storage keeps the current session usable; malformed data recovers studio defaults',()=>{
 const code=studios.find(s=>s.id==='code')!,defaults=studioDefaultLayout(code),panels=studioPanels(code);
 for(const raw of ['{bad',JSON.stringify({version:1,layouts:[]}),JSON.stringify({version:99,layouts:{code:{rightOpen:false}}})]){
  const store=createShellLayoutStore({getItem:()=>raw,setItem:()=>{throw Error('quota');}});
  assert.equal(store.get('code',defaults,panels).rightOpen,true);
  assert.equal(store.update('code',{rightOpen:false},defaults,panels).rightOpen,false);
  assert.equal(store.get('code',defaults,panels).rightOpen,false);
 }
});
