import {invoke} from '@tauri-apps/api/core';
export type MisfirePolicy={kind:'skip'}|{kind:'coalesce'}|{kind:'catch_up';cap:number};
export type ConsentLevel='ask_for_everything'|'ask_for_writes'|'autonomous_in_scope';
export interface ScheduleSpec {name:string;studioId:string;cronExpr:string;timezone:string;misfirePolicy:MisfirePolicy;consentLevel:ConsentLevel;autoApply:boolean}
export interface SchedulePreview {description:string;nextFireTimes:number[];appMustBeOpen:boolean}
export interface Schedule {id:string;spec:ScheduleSpec;enabled:boolean;nextRunMs:number}
export interface ScheduleTransport {preview(spec:ScheduleSpec):Promise<SchedulePreview>;create(spec:ScheduleSpec):Promise<Schedule>;list():Promise<Schedule[]>;setEnabled(id:string,enabled:boolean):Promise<void>}
export const nativeScheduleTransport:ScheduleTransport={
 preview:request=>invoke('vibespace_schedule_preview',{request}),
 create:request=>invoke('vibespace_schedule_create',{request}),
 list:()=>invoke('vibespace_schedule_list'),
 setEnabled:(scheduleId,enabled)=>invoke('vibespace_schedule_set_enabled',{scheduleId,enabled}),
};
export function defaultSchedule(studioId:string,timezone=Intl.DateTimeFormat().resolvedOptions().timeZone):ScheduleSpec{
 return {name:'',studioId,cronExpr:'0 9 * * 1',timezone,misfirePolicy:{kind:'coalesce'},consentLevel:'ask_for_writes',autoApply:false};
}
/** Preference validation only. Rust owns cron parsing, DST, planning and consent. */
export function scheduleError(s:ScheduleSpec):'fields'|'cap'|'autoConsent'|null {
 if(!s.name.trim()||s.name.length>200||!s.studioId||s.cronExpr.trim().split(/\s+/).length!==5||s.cronExpr.length>200)return 'fields';
 try{new Intl.DateTimeFormat('en',{timeZone:s.timezone}).format();}catch{return 'fields';}
 if(s.misfirePolicy.kind==='catch_up'&&(!Number.isInteger(s.misfirePolicy.cap)||s.misfirePolicy.cap<1||s.misfirePolicy.cap>100))return 'cap';
 if(s.autoApply&&s.consentLevel!=='autonomous_in_scope')return 'autoConsent';
 return null;
}
/** Prevent a stale successful preview from validating a changed rule. */
export const scheduleFingerprint=(s:ScheduleSpec)=>JSON.stringify(s);
