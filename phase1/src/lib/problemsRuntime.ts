import {getState,jumpToLine,openFileTab,requestStudio} from '../store/appStore';
import {findMedia,getMedia,setActiveMedia} from './media';
import {hasStudio} from './studios/registry';
import {createProblemsStore,type ProblemTarget} from './problemsStore';
import {reportError} from './log';
import type {CommandError} from './invokeCmd';
const target=():ProblemTarget=>({studio:getState().activeStudio,file:getMedia().active??getState().activeFile??undefined});
export const problemsStore=createProblemsStore(target);
export function reportCommandProblem(error:CommandError){if(!error.expected)reportError('app_command_error',error,{context:{...target(),cmd:error.cmd,id:error.id,incident_id:error.incident_id,detail:error.detail,code:error.code,corr:error.corr}});}
/** A row never reopens a removed source, or pretends a source-less failure has a code location. */
export function canNavigateProblem(p:ProblemTarget){return !!p.file&&(p.file in getState().files||!!findMedia(p.file))||hasStudio(p.studio);}
export function navigateProblem(p:ProblemTarget){
 if(p.file&&p.file in getState().files){if(p.line)jumpToLine(p.file,p.line,p.col??1);else openFileTab(p.file);if(p.studio!=='code'&&hasStudio(p.studio))requestStudio(p.studio,'open',false,p.file);return;}
 if(p.file&&findMedia(p.file)){setActiveMedia(p.file);if(hasStudio(p.studio))requestStudio(p.studio,'open',false,'media:'+p.file);return;}
 if(hasStudio(p.studio))requestStudio(p.studio,'manual');
}
/** Capture fetch failures even when a studio catches them as an inline error. HTTP responses are returned untouched. */
export function installProblemsFetch(host:Pick<typeof globalThis,'fetch'>=globalThis){
 const original=host.fetch;
 const wrapped:typeof fetch=async(...args)=>{const origin=target();try{const response=await original.apply(host,args);if(!response.ok)reportError('frontend.fetch',`HTTP ${response.status} ${response.statusText}`,{context:{...origin,url:response.url.split('?')[0]}});return response;}catch(error){if(!(error instanceof Error&&error.name==='AbortError'))reportError('frontend.fetch',error,{context:origin});throw error;}};
 host.fetch=wrapped;return()=>{if(host.fetch===wrapped)host.fetch=original;};
}
