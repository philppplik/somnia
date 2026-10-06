import type {Awareness} from 'y-protocols/awareness';
import type {CollabDoc} from './collabDoc';
import {safeAwareness} from './awarenessSafe';
/** The active shared project of this window. Null while not sharing or joined. */
let current:CollabDoc|null=null;let safe:Awareness|null=null;
const listeners=new Set<()=>void>();
export const getCollab=()=>current;
/** Awareness for the editor's cursor layer: remote names and colours are sanitised (see awarenessSafe.ts). */
export const getSafeAwareness=()=>safe;
export function setSession(c:CollabDoc|null){current=c;safe=c?safeAwareness(c.awareness):null;listeners.forEach(f=>f());}
/** Tell the editor to re-bind (a shared file appeared or went away). */
export const notifySession=()=>listeners.forEach(f=>f());
export function onSessionChange(f:()=>void){listeners.add(f);return()=>{listeners.delete(f);};}
