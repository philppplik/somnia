/** Legacy palette/menu registry. Kept separate so spec registration never imports Core registrations. */
import type { CommandMeta } from './shell/commandMeta';

/** Shell v2 (M1): `when/studio/argsSchema/agentCallable/risk` are optional metadata, see shell/commandMeta.ts. `category` is kept for compatibility; menu placement moves to MenuItemDef (M2). */
export interface Command extends CommandMeta {id:string;title:string;/** @deprecated read-only compat: menu placement is decided by MenuItemDef */category:'Project'|'Edit'|'View'|'Insert'|'Tools'|'Help';shortcut?:string;keywords?:string[];allowInInput?:boolean;enabled?:()=>boolean;run:(payload?:unknown)=>void|Promise<void>}
const scopes=new Set<(id:string)=>Command|undefined>();
/** Editors can route shared Save/Undo/Close without replacing the project's registrations. */
export function registerCommandScope(resolve:(id:string)=>Command|undefined){scopes.add(resolve);return()=>{scopes.delete(resolve);};}
export const scopedCommand=(id:string)=>[...scopes].reverse().map(resolve=>resolve(id)).find(Boolean);

export const commandRegistry = new Map<string, Command>();
export const registerCommand = (command: Command) => {
  commandRegistry.set(command.id, command);
  return () => {
    if (commandRegistry.get(command.id) === command) commandRegistry.delete(command.id);
  };
};
