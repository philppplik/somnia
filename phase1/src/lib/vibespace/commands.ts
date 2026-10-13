import {registerCommand} from '../commandRegistry';
import {getVibeShellState,vibeShellReady} from './shellSession';
/** Navigation only. Native writes, run consent and review stay in their existing confirmation UI. */
export interface VibeShellActions {selectSpace:(id:string)=>void;openRun:(id:string)=>void;home:()=>void;newSpace:()=>void;newStudio:()=>void;refresh:()=>void|Promise<void>}
export type SelectSpaceArgs={spaceId:string};
export type OpenRunArgs={runId:string};
export const VIBESPACE_COMMANDS=['vibespace.space.select','vibespace.run.open','vibespace.home','vibespace.space.new','vibespace.studio.new','vibespace.refresh'] as const;
const unavailable=()=>{throw Object.assign(new Error('Vibe Space is not mounted.'),{expected:true});};
const noActions:VibeShellActions={selectSpace:unavailable,openRun:unavailable,home:unavailable,newSpace:unavailable,newStudio:unavailable,refresh:unavailable};
const idArg=(p:unknown,key:string)=>{const id=p&&typeof p==='object'?(p as Record<string,unknown>)[key]:null;if(typeof id!=='string'||!id.trim())throw Object.assign(new Error(`Missing ${key}.`),{expected:true});return id;};
export function registerVibeSpaceCommands(actions:VibeShellActions=noActions){
 const add=(id:string,title:string,run:(p?:unknown)=>void|Promise<void>,enabled:()=>boolean=vibeShellReady,argsSchema:Record<string,unknown>={type:'object',additionalProperties:false,properties:{}})=>registerCommand({id,title,studio:'vibespace',category:'View',risk:'none',agentCallable:false,argsSchema,enabled,run,keywords:['vibespace','studio','agent']});
 const schema=(key:string)=>({type:'object',additionalProperties:false,required:[key],properties:{[key]:{type:'string',minLength:1}}});
 const offs=[
 add('vibespace.space.select','Select Vibe Space',p=>{const id=idArg(p,'spaceId');if(!getVibeShellState().view.snapshot?.spaces.some(s=>s.spaceId===id))throw Object.assign(new Error('Space is not loaded.'),{expected:true});actions.selectSpace(id);},vibeShellReady,schema('spaceId')),
 add('vibespace.run.open','Open Studio run',p=>{const id=idArg(p,'runId');if(!getVibeShellState().view.snapshot?.studios.some(s=>s.runId===id))throw Object.assign(new Error('Run is not loaded.'),{expected:true});actions.openRun(id);},vibeShellReady,schema('runId')),
 add('vibespace.home','Back to Vibe Space',actions.home),
 add('vibespace.space.new','Create Vibe Space',actions.newSpace,()=>vibeShellReady()&&getVibeShellState().canCreateSpace),
 add('vibespace.studio.new','Create Studio',actions.newStudio,()=>vibeShellReady()&&!!getVibeShellState().spaceId&&getVibeShellState().canCreateStudio),
 add('vibespace.refresh','Reload Vibe Space state',actions.refresh,()=>!getVibeShellState().view.pending),
 ];return()=>offs.forEach(off=>off());
}
