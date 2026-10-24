import type {StudioDef,StudioMode} from './registry';
export type {StudioMode} from './registry';

export type StudioModeMemory=Readonly<Record<string,string>>;
export const modeKey=(studio:string,document:string)=>JSON.stringify([studio,document]);
/** Old manifests remain compatible. Studios with no implemented modes show no picker. */
export function studioModes(studio:StudioDef):readonly StudioMode[]{
 return studio.modes??studio.shell.header.views.map(view=>({id:view.mode,label:'cmd.'+view.command,command:view.command,viewMode:view.mode}));
}
export function resolveStudioMode(studio:StudioDef,memory:StudioModeMemory,document:string):StudioMode|undefined{
 const modes=studioModes(studio);
 return modes.find(mode=>mode.id===memory[modeKey(studio.id,document)])??modes[0];
}
export function rememberStudioMode(studio:StudioDef,memory:StudioModeMemory,document:string,id:string):StudioModeMemory{
 const mode=studioModes(studio).find(mode=>mode.id===id||mode.viewMode===id);
 if(!mode)return memory;
 return {...memory,[modeKey(studio.id,document)]:mode.id};
}
