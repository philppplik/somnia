import {registerCommand} from '../lib/commandRegistry';
import {getState} from './appStore';
import {getStudio} from '../lib/studios';
import {applyRailOp,getFocusedRailItem,railCustomizable,type RailOp,type RailTarget} from './railActions';
const target=(p:unknown):RailTarget|null=>{
 const x=p as Partial<RailTarget>|undefined;
 if(x&&(x.side==='left'||x.side==='right')&&typeof x.id==='string')return {side:x.side,id:x.id};
 return getFocusedRailItem();
};
const active=()=>getStudio(getState().activeStudio);
const OPS:[RailOp,string][]=[['moveUp','Move rail icon up'],['moveDown','Move rail icon down'],['pin','Pin rail icon'],['unpin','Move rail icon to overflow'],['hide','Hide rail icon'],['show','Show hidden rail icon'],['reset','Reset rails of this studio']];
/** Rail customization commands (palette, context menus, shortcuts). Acts on the payload `{side,id}` or on the last focused rail icon. */
export function registerRailCommands(){
 const offs=OPS.map(([op,title])=>registerCommand({
  id:`shell.rail.${op}`,title,category:'View',keywords:['rail','icon','sidebar','customize'],
  enabled:()=>railCustomizable(active())&&(op==='reset'||!!getFocusedRailItem()||op==='show'),
  run:payload=>{
   const studio=active();
   if(op==='reset'){applyRailOp(studio,'reset',{side:'left',id:''});return;}
   const t=target(payload);if(!t||!applyRailOp(studio,op,t))throw Object.assign(new Error('That rail icon cannot be changed here.'),{expected:true});
  },
 }));
 return()=>offs.forEach(f=>f());
}
registerRailCommands();
