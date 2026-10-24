import type {CommandRisk,JsonSchema,StudioContext} from './types';
import {evalWhen,validateWhen} from './when';
/**
 * M1: generic command metadata layered over the existing command registry (src/lib/commands.ts).
 * It does NOT add a second command system: a Command stays `{id,title,run,enabled?,...}` and the extra optional
 * fields below are structural (src/lib/commands.ts re-uses this shape). This keeps it compatible with the
 * engine command architecture (fixed ids + argsSchema): ids are plain strings, argsSchema is opaque JSON schema.
 */
export interface CommandMeta{
 /** owning studio; undefined = global */
 studio?:string;
 /** context expression, see when.ts */
 when?:string;
 argsSchema?:JsonSchema;
 /** flags consumed later by the AI gateway (M5b). Defaults: not callable, risk 'none'. */
 agentCallable?:boolean;
 risk?:CommandRisk;
}
export interface CommandLike extends CommandMeta{id:string;enabled?:()=>boolean}

/** Namespaced id: `<namespace>.<segment>(.<segment>)*`, lowercase, e.g. 'photos.tone.open'. */
const ID_RE=/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/i;
export const isNamespacedId=(id:string)=>ID_RE.test(id);
/** Problems for a studio-owned command definition. Empty array = ok. Existing global ids (e.g. 'edit.undo') pass too. */
export function validateCommandMeta(c:CommandLike):string[]{
 const p:string[]=[];
 if(!isNamespacedId(c.id))p.push(`id "${c.id}" is not namespaced (expected "<namespace>.<name>")`);
 if(c.studio&&!c.id.startsWith(`${c.studio}.`)&&!GLOBAL_PREFIXES.has(c.id.split('.')[0]))p.push(`id "${c.id}" must start with "${c.studio}." for studio-owned commands`);
 if(c.when!==undefined){const e=validateWhen(c.when);if(e)p.push(e);}
 if(c.agentCallable&&!c.argsSchema)p.push(`agentCallable command "${c.id}" needs an argsSchema`);
 return p;
}
const GLOBAL_PREFIXES=new Set(['edit','project','view','tools','help','insert','studio','agent','palette','sidebar']);

/**
 * One availability decision for palette, menu, toolbar and shortcut: studio ownership + `when` + legacy `enabled()`.
 * `ctx` is the merged StudioContext (or any object `when` reads from).
 */
export function commandAvailable(c:CommandLike,ctx:Pick<StudioContext,'studio'>&Record<string,unknown>):boolean{
 if(c.studio&&c.studio!==ctx.studio)return false;
 if(!evalWhen(c.when,ctx))return false;
 return c.enabled?c.enabled():true;
}

/**
 * Scoped registration tied to a document/canvas lifecycle. `register` is the host's registrar
 * (e.g. registerCommand or registerCommandScope-backed). Disposing removes everything; a disposed scope
 * ignores late registrations (stale async results cannot mutate another document).
 */
export function createCommandScope<C extends {id:string}>(register:(c:C)=>()=>void){
 const offs=new Map<string,()=>void>();let live=true;
 return {
  add(c:C):()=>void{
   if(!live)return()=>{};
   offs.get(c.id)?.();offs.set(c.id,register(c));
   return()=>{const off=offs.get(c.id);if(off){off();offs.delete(c.id);}};
  },
  get size(){return offs.size;},
  get live(){return live;},
  dispose(){if(!live)return;live=false;offs.forEach(f=>f());offs.clear();},
 };
}
