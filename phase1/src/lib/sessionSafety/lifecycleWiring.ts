import {checksumParts} from '../lifecycle/checksum';
import {registerLifecycleAdapter} from '../lifecycle/adapters';
import type {StudioLifecycleAdapter} from '../lifecycle/types';
import {setLifecycleHost,type LifecycleHost} from './lifecycleBridge';
import {registerRecoveryLifecycleAdapter} from './lifecycleAdapter';

/** Recovery-backed studios: the session-safety store holds their unsaved edits, so they get lifecycle hooks. */
export const RECOVERY_LIFECYCLE_STUDIOS=['documents','sheets'] as const;

/** The real Lifecycle host: shared checksum plus registration into the lifecycle adapter registry. */
export const createLifecycleHost=():LifecycleHost=>({
 checksum:checksumParts,
 registerAdapter:(studioId,hooks)=>registerLifecycleAdapter(studioId,()=>hooks as StudioLifecycleAdapter),
});

/**
 * Connect session safety to the Lifecycle subsystem. Call once, after the lifecycle manager started.
 * Returns a disposer that unregisters the adapters and restores the no-op host (HMR, tests).
 */
export function connectSessionSafetyToLifecycle():()=>void{
 setLifecycleHost(createLifecycleHost());
 const offs=RECOVERY_LIFECYCLE_STUDIOS.map(id=>registerRecoveryLifecycleAdapter(id));
 return()=>{for(const off of offs)off();setLifecycleHost(null);};
}
