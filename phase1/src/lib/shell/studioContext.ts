import {useMemo,useSyncExternalStore} from 'react';
import {createContextStore,type ContextPatch} from './contextStore';
import {EMPTY_STUDIO_CONTEXT,type StudioContext} from './types';
/**
 * The one live StudioContext of the app. The active canvas `claim`s it (selection, mode, services); the shell
 * reads it for `when`, panels and the inspector. A canvas that never claims leaves the empty context, so panels
 * with a `selection` condition simply stay unavailable instead of guessing.
 */
export const studioContextStore=createContextStore();
export const getStudioContext=()=>studioContextStore.get();
export const useStudioContextRaw=()=>useSyncExternalStore(studioContextStore.subscribe,studioContextStore.get,studioContextStore.get);
/** Context for the shell: the claimed context, with `studio` forced to the active studio so `studio == 'x'` always works. */
export function useStudioContext(activeStudio:string):StudioContext{
 const raw=useStudioContextRaw();
 return useMemo(()=>raw.studio===activeStudio?raw:{...EMPTY_STUDIO_CONTEXT,...(raw.studio?{}:raw),studio:activeStudio},[raw,activeStudio]);
}
export type {ContextPatch};
