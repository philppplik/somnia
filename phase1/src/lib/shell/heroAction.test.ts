import test from 'node:test';import assert from 'node:assert/strict';
import {resolveHeroAction,PUBLISH_COMMAND_ID,type HeroCommandInfo} from './heroAction';
import type {HeroActionDef} from './types';
const cmds:Record<string,HeroCommandInfo>={
 'x.go':{id:'x.go',title:'Go',shortcut:'Mod+G',enabled:true},
 'x.a':{id:'x.a',title:'A',enabled:true},
 'x.b':{id:'x.b',title:'B',enabled:false},
 [PUBLISH_COMMAND_ID]:{id:PUBLISH_COMMAND_ID,title:'Publish...',shortcut:'Mod+Shift+U',enabled:true}
};
const lookup=(id:string)=>cmds[id];
const def:HeroActionDef={id:'x.go',labelKey:'x.label',icon:'Play',menu:['x.a','x.b']};
const hero=(r:ReturnType<typeof resolveHeroAction>)=>{assert.equal(r.kind,'hero');return r as Extract<typeof r,{kind:'hero'}>;};
test('no field keeps the old Publish behaviour',()=>{assert.deepEqual(resolveHeroAction(undefined,{},lookup),{kind:'default'});});
test('hero keeps label key, icon, shortcut and enabled state from the command',()=>{
 const r=hero(resolveHeroAction(def,{},lookup));
 assert.deepEqual([r.id,r.labelKey,r.icon,r.shortcut,r.enabled],['x.go','x.label','Play','Mod+G',true]);
 cmds['x.go'].enabled=false;assert.equal(hero(resolveHeroAction(def,{},lookup)).enabled,false);cmds['x.go'].enabled=true;
});
test('menu keeps declared order, carries enabled flags and always ends with Publish',()=>{
 const r=hero(resolveHeroAction(def,{},lookup));
 assert.deepEqual(r.menu.map(m=>m.id),['x.a','x.b',PUBLISH_COMMAND_ID]);
 assert.deepEqual(r.menu.map(m=>m.enabled),[true,false,true]);assert.deepEqual(r.menu.map(m=>m.publish),[false,false,true]);
});
test('Publish is the last entry even when no menu is declared, or when the studio lists it elsewhere',()=>{
 assert.deepEqual(hero(resolveHeroAction({...def,menu:undefined},{},lookup)).menu.map(m=>m.id),[PUBLISH_COMMAND_ID]);
 assert.deepEqual(hero(resolveHeroAction({...def,menu:[PUBLISH_COMMAND_ID,'x.a']},{},lookup)).menu.map(m=>m.id),['x.a',PUBLISH_COMMAND_ID]);
});
test('duplicates, the hero id and unregistered commands are dropped',()=>{
 assert.deepEqual(hero(resolveHeroAction({...def,menu:['x.a','x.a','x.go','nope.cmd']},{},lookup)).menu.map(m=>m.id),['x.a',PUBLISH_COMMAND_ID]);
});
test('unregistered hero command, or Publish as hero, falls back to the default button',()=>{
 assert.deepEqual(resolveHeroAction({...def,id:'nope.cmd'},{},lookup),{kind:'default'});
 assert.deepEqual(resolveHeroAction({...def,id:PUBLISH_COMMAND_ID},{},lookup),{kind:'default'});
});
test('when uses the shell language: false or invalid falls back to Publish',()=>{
 const w={...def,when:'document.kind == "pptx"'};
 assert.deepEqual(resolveHeroAction(w,{document:{kind:'png'}},lookup),{kind:'default'});
 assert.equal(resolveHeroAction(w,{document:{kind:'pptx'}},lookup).kind,'hero');
 assert.deepEqual(resolveHeroAction({...def,when:'((('},{},lookup),{kind:'default'});
});
test('Publish entry stays present but disabled when Publish is not registered or unavailable',()=>{
 const r=hero(resolveHeroAction(def,{},id=>id===PUBLISH_COMMAND_ID?undefined:cmds[id]));
 const last=r.menu[r.menu.length-1];assert.equal(last.id,PUBLISH_COMMAND_ID);assert.equal(last.enabled,false);
});
test('toggle hero: pressedWhen drives the pressed state, invalid expression means not pressed',()=>{
 const t={...def,pressedWhen:'preview',pressedTooltipKey:'x.close'};
 let r=hero(resolveHeroAction(t,{preview:true},lookup));
 assert.deepEqual([r.toggle,r.pressed,r.pressedTooltipKey],[true,true,'x.close']);
 r=hero(resolveHeroAction(t,{preview:false},lookup));
 assert.deepEqual([r.toggle,r.pressed],[true,false]);
 r=hero(resolveHeroAction({...t,pressedWhen:'((('},{preview:true},lookup));
 assert.equal(r.pressed,false);
 assert.equal(hero(resolveHeroAction(def,{},lookup)).toggle,false,'no pressedWhen, no toggle');
});
test('a disabled hero carries the command disabled reason for the tooltip',()=>{
 const r=hero(resolveHeroAction(def,{},id=>id==='x.go'?{id:'x.go',title:'Go',enabled:false,disabledReason:'hero.preview.none'}:cmds[id]));
 assert.deepEqual([r.enabled,r.disabledReason],[false,'hero.preview.none']);
 const enabled=hero(resolveHeroAction(def,{},lookup));
 assert.equal(enabled.disabledReason,undefined,'enabled heroes show label and shortcut instead');
});
test('first matching generic variant wins, with base fallback and registry gates',()=>{
 const variants=[{when:'services.space',id:'x.a',labelKey:'a',icon:'Plus'},{when:'services.ready',id:'x.b',labelKey:'b',icon:'Bot'}];
 assert.equal(hero(resolveHeroAction({...def,variants},{services:{space:true,ready:true}},lookup)).id,'x.a');
 assert.equal(hero(resolveHeroAction({...def,variants},{services:{ready:true}},lookup)).enabled,false);
 assert.equal(hero(resolveHeroAction({...def,variants},{},lookup)).id,'x.go');
});
