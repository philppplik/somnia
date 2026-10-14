import type {AgentImagePart,AgentMessage,AgentProvider,AgentToolCall,AgentToolDefinition} from './types';
export const LOCAL_PROBE_VERSION=1;
export interface ProbeIdentity {endpoint:string;model:string;digest:string;daemonVersion:string;numCtx?:number}
export interface ProbeReport {version:1;identity:ProbeIdentity;kind:'tools'|'vision';passed:boolean;checks:{id:string;passed:boolean}[];checkedAt:number;durationMs:number}
export function probeKey(id:ProbeIdentity,kind:ProbeReport['kind']){return JSON.stringify([LOCAL_PROBE_VERSION,id.endpoint,id.model,id.digest,id.daemonVersion,id.numCtx??null,kind]);}
const cache=new Map<string,ProbeReport>();
export function readProbe(id:ProbeIdentity,kind:ProbeReport['kind']):ProbeReport|undefined{const report=cache.get(probeKey(id,kind));return report?structuredClone(report):undefined;}
export function storeProbe(report:ProbeReport){if(!report.identity.digest||report.version!==LOCAL_PROBE_VERSION)throw Error('Cannot cache unversioned probe');if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(probeKey(report.identity,report.kind),structuredClone(report));}
const echo:AgentToolDefinition={name:'echo',description:'Return the supplied text.',parameters:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}};
const other:AgentToolDefinition={name:'add',description:'Add two integers.',parameters:{type:'object',properties:{a:{type:'integer'},b:{type:'integer'}},required:['a','b'],additionalProperties:false}};
async function ask(provider:AgentProvider,model:string,messages:AgentMessage[],tools:AgentToolDefinition[],signal:AbortSignal){
 let text='',finish=false;const fragments=new Map<number,AgentToolCall>();
 for await(const event of provider.stream({model,messages,tools,maxOutputTokens:256,signal})){
  signal.throwIfAborted();if(event.type==='text')text+=event.text;
  if(text.length>4000)throw Error('Probe output limit');
  if(event.type==='finish'){if(['length','error','content_filter','aborted'].includes(event.reason))throw Error('Probe did not complete');finish=true;}
  if(event.type==='tool-call'){
   if(event.index<0||event.index>3)throw Error('Probe call limit');
   const call=fragments.get(event.index)??{id:'',name:'',arguments:''};if(event.id)call.id=event.id;if(event.name)call.name=event.name;call.arguments+=event.arguments??'';if(call.arguments.length>1000)throw Error('Probe arguments limit');fragments.set(event.index,call);
  }
 }
 if(!finish)throw Error('Incomplete probe output');return {text,calls:[...fragments.values()]};
}
function echoPass(calls:AgentToolCall[]){if(calls.length!==1||calls[0].name!=='echo')return false;try{const args=JSON.parse(calls[0].arguments);return args&&Object.keys(args).length===1&&args.text==='ok';}catch{return false;}}
export async function runToolProbe(provider:AgentProvider,identity:ProbeIdentity,signal:AbortSignal):Promise<ProbeReport>{
 const start=Date.now(),checks:ProbeReport['checks']=[];
 for(let repeat=0;repeat<3;repeat++){
  signal.throwIfAborted();
  const first=await ask(provider,identity.model,[{role:'user',content:'Call echo exactly once with text "ok". Do not call any other tool.'}],[echo],signal);checks.push({id:`T1.${repeat+1}`,passed:echoPass(first.calls)});
  const choice=await ask(provider,identity.model,[{role:'user',content:'Repeat text "ok" using the appropriate tool. Do not calculate.'}],[echo,other],signal);checks.push({id:`T2.${repeat+1}`,passed:echoPass(choice.calls)});
  // Synthetic fixture tool result only. No real tool callback is ever invoked.
  const result=await ask(provider,identity.model,[{role:'user',content:'Repeat text "ok" with echo, then answer in plain text after its result.'},{role:'assistant',content:'',toolCalls:[{id:'fixture-echo',name:'echo',arguments:'{"text":"ok"}'}]},{role:'tool',toolCallId:'fixture-echo',content:'ok'}],[echo],signal);
  checks.push({id:`T3.${repeat+1}`,passed:result.calls.length===0&&result.text.toLowerCase().includes('ok')});
 }
 return {version:1,identity,kind:'tools',passed:checks.every(c=>c.passed),checks,checkedAt:Date.now(),durationMs:Date.now()-start};
}
export function visionFixtures():{id:string;image:AgentImagePart;prompt:string;answer:string}[]{
 const make=(id:string,draw:(ctx:CanvasRenderingContext2D)=>void,prompt:string,answer:string)=>{
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const context=canvas.getContext('2d');if(!context)throw Error('Fixture canvas unavailable');context.fillStyle='white';context.fillRect(0,0,256,256);draw(context);
  return {id,prompt,answer,image:{mime:'image/png' as const,base64:canvas.toDataURL('image/png').split(',')[1],width:256,height:256,label:'Synthetic '+id}};
 };
 return [make('V1',c=>{c.fillStyle='red';c.fillRect(64,64,128,128);},'What color is the square? Answer one English word.','red'),make('V2',c=>{c.fillStyle='black';c.font='bold 48px sans-serif';c.fillText('SOMNIA',12,140);},'Read the large word.','somnia'),make('V3',c=>{c.fillStyle='black';c.beginPath();c.arc(65,128,40,0,Math.PI*2);c.fill();c.fillRect(150,88,80,80);},'What shape is on the left? Answer one English word.','circle')];
}
export async function runVisionProbe(provider:AgentProvider,identity:ProbeIdentity,signal:AbortSignal,fixtures=visionFixtures()):Promise<ProbeReport>{
 const start=Date.now(),checks:ProbeReport['checks']=[];
 for(const fixture of fixtures){signal.throwIfAborted();const result=await ask(provider,identity.model,[{role:'user',content:fixture.prompt,images:[fixture.image]}],[],signal);checks.push({id:fixture.id,passed:!result.calls.length&&result.text.toLowerCase().includes(fixture.answer)});}
 return {version:1,identity,kind:'vision',passed:checks.every(c=>c.passed),checks,checkedAt:Date.now(),durationMs:Date.now()-start};
}
