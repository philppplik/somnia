import type {ErrorId} from '../generated/errorIds';
import fields from '../../shared/log-fields.json';
/** Level of a schema v2 line. */
export type Level='debug'|'info'|'warn'|'error';
export const LEVELS_V2:readonly Level[]=['debug','info','warn','error'];
export interface BuildIdentity{release:string;sha:string;channel:string;arch:string;frontend_build:string}
export type CtxValue=string|number|boolean;
export type Ctx=Record<string,CtxValue>;
/** Context keys that may appear in a log line, with their value type. Generated from phase1/shared/log-fields.json. */
export const CONTEXT_ALLOW:Readonly<Record<string,'string'|'number'>>=fields.context as Record<string,'string'|'number'>;
/** Subset of CONTEXT_ALLOW that is safe for the diagnostics export (counters and short technical tokens). */
export const EXPORT_CONTEXT_ALLOW:readonly string[]=fields.export_context;
/** One schema v2 JSONL line as written by the renderer. */
export interface LogLine{
 v:2;ts:string;level:Level;level_raw?:string;fatal?:boolean;
 source:'ts'|'rust';id:ErrorId;category:string;
 /** Redacted and normalized cause text. Internal only: the export drops it. */
 message:string;
 context:Ctx;session:string;seq:number;
 incident_id?:string;corr?:string;build:BuildIdentity;window?:string;dur_ms?:number;
 expected:boolean;cause?:string;fingerprint:string;suppressed?:number;
}
/**
 * Export-safe form of a log line (diagnostics ZIP, error report). It has no free text:
 * only the id, the merge key (session, source, seq), window, technical counters and flags.
 */
export interface SafeLogEvent{
 v:2;ts:string;level:Level;fatal?:boolean;source:'ts'|'rust';id:ErrorId;
 session:string;seq:number;window?:string;
 incident_id?:string;corr?:string;expected:boolean;fingerprint:string;suppressed?:number;dur_ms?:number;
 build:BuildIdentity;
 context:Record<string,string|number|boolean>;
}
/** Reasons accepted by swallow()/ignore!. Closed set. D1-F owns swallow.ts and imports this list. */
export const SWALLOW_REASONS=['storage-unavailable','clipboard-denied','pointer-capture','best-effort-cleanup','best-effort-window','expected-cancel','ime-composition','resize-observer'] as const;
export type SwallowReason=typeof SWALLOW_REASONS[number];
