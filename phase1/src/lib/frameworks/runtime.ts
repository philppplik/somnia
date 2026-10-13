import {createFrameworkSession} from './session';
import type {ProjectRunner,RunnerLog} from './runnerContract';
import {redactText} from '../log';
import {problemsStore} from '../problemsRuntime';
// Lazy loading keeps pure template and detection code usable without native APIs.
const runner:ProjectRunner={
 async start(projectId,kind){return (await import('./runner')).projectRunner.start(projectId,kind);},
 async stop(id){return (await import('./runner')).projectRunner.stop(id);},
 async status(id){return (await import('./runner')).projectRunner.status(id);},
 async onLog(id,listener){return (await import('./runner')).projectRunner.onLog(id,listener);}
};
export function reportFrameworkLog(line:RunnerLog){
 if(line.stream==='stderr'||/\b(error|warning|warn|failed)\b/i.test(line.line)){
  const location=/(?:^|\s)(src\/[^:\s]+):(\d+)(?::(\d+))?/.exec(line.line);
  problemsStore.add({studio:'code',file:location?.[1],line:location?Number(location[2]):undefined,col:location?.[3]?Number(location[3]):undefined,severity:/\b(error|failed)\b/i.test(line.line)?'error':'warning',source:'frameworks.runner',message:redactText(line.line),details:'',ts:new Date().toISOString()});
 }
}
export const frameworkSession=createFrameworkSession(runner,redactText,reportFrameworkLog);
