import type {CommandSpec,CommandSchema} from '../commandSpec';
import {addToQueue,runQueue,cancelQueue,removeFromQueue,clearQueueFinished,queueState} from './renderQueueRun';
import {EXPORT_FORMATS,type ExportFormat} from './exportSettings';
import {animationSession} from './session';
const object=(properties:Record<string,unknown>,required:string[]):CommandSchema=>({type:'object',properties,required,additionalProperties:false});
const expected=(e:unknown):never=>{throw Object.assign(e instanceof Error?e:new Error(String(e)),{expected:true});};
const open=()=>!!animationSession().document;
const mk=(id:string,title:string,run:(p:never)=>unknown,params:CommandSchema|undefined,enabled:()=>boolean):CommandSpec<unknown,unknown>=>
 ({id,title,category:'Project',level:'ui',params,enabled,keywords:['animation','export','render','queue'],run:run as (p:unknown)=>unknown});
const finished=()=>queueState().jobs.some(j=>j.status==='done'||j.status==='error'||j.status==='cancelled');
/** Render queue commands. Kept apart from the main animation command list so its type inference stays cheap. */
export const renderQueueSpecs=():CommandSpec<unknown,unknown>[]=>[
 mk('animation.export.queue.add','Add the current export setup to the render queue',((p:{format:ExportFormat})=>{try{addToQueue(p.format);}catch(e){expected(e);}}) as never,object({format:{enum:[...EXPORT_FORMATS]}},['format']),open),
 mk('animation.export.queue.run','Render all queued jobs',(()=>runQueue().catch(expected)) as never,undefined,()=>open()&&!queueState().running&&queueState().jobs.some(j=>j.status!=='done')),
 mk('animation.export.queue.cancel','Stop the render queue',(()=>cancelQueue()) as never,undefined,()=>queueState().running),
 mk('animation.export.queue.remove','Remove a job from the render queue',((p:{id:string})=>{try{removeFromQueue(p.id);}catch(e){expected(e);}}) as never,object({id:{type:'string',minLength:1,maxLength:64}},['id']),()=>queueState().jobs.length>0),
 mk('animation.export.queue.clear','Clear finished render queue jobs',(()=>clearQueueFinished()) as never,undefined,finished),
];
