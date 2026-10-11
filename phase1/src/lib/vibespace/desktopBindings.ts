import {invoke} from '@tauri-apps/api/core';
import {createNativeVibeSpaceTransport} from './native';
import type {NativeVibeBindings} from './native';
import type {SpaceSummary,StudioSummary} from './wire';
import {parseNativeCapabilities} from './nativeCapabilities';
/** All native shapes are explicit. No fixtures, arbitrary paths or credentials. */
const bindings:NativeVibeBindings={
 capabilities:[],
 readCapabilities:async()=>parseNativeCapabilities(await invoke('vibespace_capabilities')),
 readSnapshot:()=>invoke('vibespace_read_snapshot'),
 listSpaces:()=>invoke<SpaceSummary[]>('vibespace_list_spaces'),
 listStudios:()=>invoke<StudioSummary[]>('vibespace_list_studios'),
 createStudio:request=>invoke<StudioSummary>('vibespace_create_studio',{request}),
 reviewRequest:command=>({runId:command.runId,reviewRevision:command.reviewRevision,paths:command.paths}),
};
/** Stable module-owned transport; reconnecting a panel never recreates native runs. */
export const desktopVibeSpaceTransport=createNativeVibeSpaceTransport(bindings);
