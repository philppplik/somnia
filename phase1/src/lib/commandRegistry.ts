/** Legacy palette/menu registry. Kept separate so spec registration never imports Core registrations. */
import type { CommandMeta } from './shell/commandMeta';

/** Shell v2 (M1): `when/studio/argsSchema/agentCallable/risk` are optional metadata, see shell/commandMeta.ts. `category` is kept for compatibility; menu placement moves to MenuItemDef (M2). */
export interface Command extends CommandMeta {id:string;title:string;/** @deprecated read-only compat: menu placement is decided by MenuItemDef */category:'Project'|'Edit'|'View'|'Insert'|'Tools'|'Help';shortcut?:string;keywords?:string[];allowInInput?:boolean;enabled?:()=>boolean;
 /** i18n key explaining why the command is disabled (hero slot tooltip). Evaluated only while disabled. */
 disabledReason?:()=>string;
 run:(payload?:unknown)=>void|Promise<void>}
const scopes=new Set<(id:string)=>Command|undefined>();
/** Editors can route shared Save/Undo/Close without replacing the project's registrations. */
export function registerCommandScope(resolve:(id:string)=>Command|undefined){scopes.add(resolve);return()=>{scopes.delete(resolve);};}
export const scopedCommand=(id:string)=>[...scopes].reverse().map(resolve=>resolve(id)).find(Boolean);

let revision=0;const listeners=new Set<()=>void>();
export const commandRevision=()=>revision;
export const subscribeCommands=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
const changed=()=>{revision++;listeners.forEach(f=>f());};
export const commandRegistry = new Map<string, Command>();
/** Bumped on every register/unregister so consumers (e.g. the header hero slot) re-resolve mount-time commands. */
let registryVersion = 0;
const registryListeners = new Set<() => void>();
const bump = () => { registryVersion++; registryListeners.forEach((fn) => fn()); };
/** Enabled states read live stores, not the registry: consumers re-resolve on this without a register/unregister cycle. */
export const notifyCommandRegistry = () => bump();
export const getCommandRegistryVersion = () => registryVersion;
export const subscribeCommandRegistry = (fn: () => void) => { registryListeners.add(fn); return () => { registryListeners.delete(fn); }; };
export const registerCommand = (command: Command) => {
  commandRegistry.set(command.id, command);
  bump();changed();
  return () => {
    if (commandRegistry.get(command.id) === command) {
      commandRegistry.delete(command.id);
      bump();changed();
    }
  };
};
