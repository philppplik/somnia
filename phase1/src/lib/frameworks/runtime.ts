import {requestConfirm} from '../confirmService';
import {t} from '../i18n';
import {createFrameworkSession} from './session';
import type {ProjectRunner,RunnerLog} from './runnerContract';
import {redactText} from '../log';
import {problemsStore} from '../problemsRuntime';
// Lazy loading keeps pure template and detection code usable without native APIs.
const runner:ProjectRunner={
 async start(projectId,kind){const native=await import('./runner');await ensureFrameworkRuntime(native);return native.projectRunner.start(projectId,kind);},
 async stop(id){return (await import('./runner')).projectRunner.stop(id);},
 async status(id){return (await import('./runner')).projectRunner.status(id);},
 async onLog(id,listener){return (await import('./runner')).projectRunner.onLog(id,line=>listener({stream:line.stream,line:line.text}));}
};
export function reportFrameworkLog(line:RunnerLog){
 if(line.stream==='stderr'||/\b(error|warning|warn|failed)\b/i.test(line.line)){
  const location=/(?:^|\s)(src\/[^:\s]+):(\d+)(?::(\d+))?/.exec(line.line);
  problemsStore.add({studio:'code',file:location?.[1],line:location?Number(location[2]):undefined,col:location?.[3]?Number(location[3]):undefined,severity:/\b(error|failed)\b/i.test(line.line)?'error':'warning',source:'frameworks.runner',message:redactText(line.line),details:'',ts:new Date().toISOString()});
 }
}
export const frameworkSession=createFrameworkSession(runner,redactText,reportFrameworkLog);

let setup:Promise<void>|null=null;
/** No automatic network download: first framework run asks once through the app's reviewed prompt. */
async function ensureFrameworkRuntime(native:typeof import('./runner')){
 const status=await native.runtimeStatus();if(status.installed)return;if(!status.supported)throw Error('frameworks.desktopPreview');
 if(!setup)setup=(async()=>{const approved=await requestConfirm({title:t('frameworks.helper'),message:t('frameworks.downloadConsent'),confirmLabel:t('frameworks.download'),cancelLabel:t('dialogs.cancel')});if(!approved)throw Error('frameworks.helperCancelled');await native.installRuntime();})().finally(()=>{setup=null;});
 await setup;
}
