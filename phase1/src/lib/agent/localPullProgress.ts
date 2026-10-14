import type {PullJob} from './localModelManager';
/** Only current downloading phase can advertise byte progress. Not overall install. */
export function localPullProgress(job:PullJob):{state:'bytes'|'unknown'|'not-downloading';completed:number|null;total:number|null;percent:number|null}{
 if(job.phase!=='downloading')return {state:'not-downloading',completed:null,total:null,percent:null};
 const completed=job.layer?.completed,total=job.layer?.total;
 if(!Number.isSafeInteger(completed)||completed==null||completed<0||!Number.isSafeInteger(total)||total==null||total<=0||completed>total)return {state:'unknown',completed:null,total:null,percent:null};
 return {state:'bytes',completed,total,percent:Math.floor(completed/total*100)};
}
