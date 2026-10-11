import {invoke} from '@tauri-apps/api/core';
import {createNativeVibeSpaceTransport} from './native';
import type {NativeVibeBindings} from './native';
import type {SpaceSummary,StudioSummary} from './wire';
/** All native shapes are explicit. No fixtures, arbitrary paths or credentials. */
const bindings:NativeVibeBindings={
 capabilities:['create-space','create-studio','start','stop','steer','consent','review','restore','retry'],
 readSnapshot:()=>invoke('vibespace_read_snapshot'),
 listSpaces:()=>invoke<SpaceSummary[]>('vibespace_list_spaces'),
 listStudios:()=>invoke<StudioSummary[]>('vibespace_list_studios'),
 createStudio:request=>invoke<StudioSummary>('vibespace_create_studio',{request}),
 reviewRequest:command=>({runId:command.runId,reviewRevision:command.reviewRevision,...(command.decision==='apply'?{paths:command.paths}:{} )}),
};
/** Stable module-owned transport; reconnecting a panel never recreates native runs. */
export const desktopVibeSpaceTransport=createNativeVibeSpaceTransport(bindings);
