/**
 * Intake policy setting (12.0.1, work package D2-E).
 *
 * The only policy knob today: whether the native argv parser accepts UNC
 * (network) paths. Default is OFF (owner decision relayed through the design);
 * the host fails closed, so a missing/desynced renderer pref can only deny.
 *
 * Persistence follows the workflowPrefs pattern (localStorage, sanitized
 * read). The native side is authoritative at parse time, so changes are pushed
 * via `set_intake_policy` BEFORE they are persisted locally: when the native
 * call fails the setting does not silently pretend to apply. The same sync
 * runs once after boot, before the orchestrator's first drain.
 *
 * The Settings UI checkbox ("File access" section) is an integrator hunk and
 * deliberately not part of this package.
 */
import type {IntakePolicy} from '../commandContracts';
import type {OpenRequestClient} from './openRequestClient';

export type {IntakePolicy} from '../commandContracts';

export const DEFAULT_INTAKE_POLICY:IntakePolicy={allowUnc:false};
const KEY='somnia.intakePolicy.v1';

type StorageLike=Pick<Storage,'getItem'|'setItem'>;
function store(custom?:StorageLike):StorageLike|undefined{return custom??(typeof localStorage==='undefined'?undefined:localStorage);}

export function sanitizeIntakePolicy(x:unknown):IntakePolicy{
 return{allowUnc:typeof x==='object'&&x!==null&&(x as {allowUnc?:unknown}).allowUnc===true};
}
export function readIntakePolicy(storage?:StorageLike):IntakePolicy{
 const s=store(storage);if(!s)return{...DEFAULT_INTAKE_POLICY};
 try{return sanitizeIntakePolicy(JSON.parse(s.getItem(KEY)||'{}'));}catch{return{...DEFAULT_INTAKE_POLICY};}
}

/** Current renderer-side value. Pure read; never touches native. */
export function getIntakePolicy(storage?:StorageLike):IntakePolicy{return readIntakePolicy(storage);}

/**
 * Change the policy. With a native client the command runs first and the local
 * copy is persisted only after the host accepted it; a native failure rejects
 * and leaves the old setting in place. Without a client (web build) the value
 * is persisted locally and simply has no intake effect.
 */
export async function setIntakePolicy(policy:IntakePolicy,client?:Pick<OpenRequestClient,'setIntakePolicy'>|null,storage?:StorageLike):Promise<void>{
 const next=sanitizeIntakePolicy(policy);
 if(client)await client.setIntakePolicy(next);
 try{store(storage)?.setItem(KEY,JSON.stringify(next));}catch{/* session only */}
}

/**
 * Boot sync: push the persisted renderer value to the host. The orchestrator
 * awaits this once before its first drain so a cold second-instance callback
 * cannot parse against a stale default.
 */
export async function syncIntakePolicyToNative(client:Pick<OpenRequestClient,'setIntakePolicy'>,storage?:StorageLike):Promise<void>{
 await client.setIntakePolicy(readIntakePolicy(storage));
}
