import type {VibeCommand,VibeEvent,VibeSnapshot,RunSnapshot,SnapshotReply,FolderGrant} from './types';
function fail(path:string):never{throw new Error(`Invalid Vibe Space data: ${path}`);}
function record(value:unknown,path:string,keys:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return fail(path);
 const result=value as Record<string,unknown>;
 if(Object.keys(result).some(key=>!keys.includes(key))||keys.some(key=>!(key in result)))fail(`${path} fields`);
 return result;
}
function text(value:unknown,path:string,max=8192,empty=false):asserts value is string{
 if(typeof value!=='string'||(!empty&&!value.trim())||value.length>max||value.includes('\0'))fail(path);
}
function number(value:unknown,path:string):asserts value is number{if(typeof value!=='number'||!Number.isFinite(value)||value<0)fail(path);}
function integer(value:unknown,path:string){number(value,path);if(!Number.isSafeInteger(value))fail(path);}
function boolean(value:unknown,path:string){if(typeof value!=='boolean')fail(path);}
function array(value:unknown,path:string,max=1000):unknown[]{if(!Array.isArray(value)||value.length>max)return fail(path);return value;}
function unique(values:unknown[],key:string,path:string){const ids=values.map(v=>(v as Record<string,unknown>)[key]);if(new Set(ids).size!==ids.length)fail(`${path} duplicate ${key}`);}
function date(value:unknown,path:string){text(value,path,64);if(!/^\d{4}-\d\d-\d\dT.*(?:Z|\+00:00)$/.test(value)||!Number.isFinite(Date.parse(value)))fail(path);}
function nullableText(value:unknown,path:string,max=8192){if(value!==null)text(value,path,max,true);}
function nullableDate(value:unknown,path:string){if(value!==null)date(value,path);}
function model(value:unknown,path:string){const m=record(value,path,['provider','model','locality']);text(m.provider,path,256);text(m.model,path,256);if(!['local','cloud'].includes(m.locality as string))fail(path);}
export function parseRun(value:unknown):RunSnapshot{
 const p=record(value,'run',['runId','studioId','spaceId','executionState','reviewState','goal','model','lastStep','startedAtUtc','finishedAtUtc','elapsedMs','usage','messages','pendingConsents','checkpoints','review','failure','capabilities']);
 for(const k of ['runId','studioId','spaceId'])text(p[k],k,256);
 text(p.goal,'goal');model(p.model,'model');nullableText(p.lastStep,'lastStep');nullableDate(p.startedAtUtc,'startedAtUtc');nullableDate(p.finishedAtUtc,'finishedAtUtc');integer(p.elapsedMs,'elapsedMs');
 if(!['pending','claimed','running','paused','stopped','done','failed','crashed'].includes(p.executionState as string))fail('executionState');
 if(!['none','ready','applied','discarded','conflict'].includes(p.reviewState as string))fail('reviewState');
 if(p.usage!==null){const u=record(p.usage,'usage',['inputTokens','outputTokens','cachedTokens','costUsd','costSource']);for(const k of ['inputTokens','outputTokens','cachedTokens'])integer(u[k],k);if(u.costUsd!==null)number(u.costUsd,'costUsd');nullableText(u.costSource,'costSource',256);}
 const messages=array(p.messages,'messages');messages.forEach(v=>{const m=record(v,'message',['id','role','text','timestampUtc']);text(m.id,'message.id',256);text(m.role,'message.role',64);text(m.text,'message.text',500000,true);date(m.timestampUtc,'message.timestampUtc');});unique(messages,'id','messages');
 const consents=array(p.pendingConsents,'pendingConsents',100);consents.forEach(v=>{const c=record(v,'consent',['requestId','action','scope','reason','allowForRun']);for(const k of ['requestId','action','scope','reason'])text(c[k],k);boolean(c.allowForRun,'allowForRun');});unique(consents,'requestId','consents');
 const checkpoints=array(p.checkpoints,'checkpoints');checkpoints.forEach(v=>{const c=record(v,'checkpoint',['checkpointId','label','createdAtUtc','fileCount','restorable']);text(c.checkpointId,'checkpointId',256);text(c.label,'label',256);date(c.createdAtUtc,'createdAtUtc');integer(c.fileCount,'fileCount');boolean(c.restorable,'restorable');});unique(checkpoints,'checkpointId','checkpoints');
 if(p.review!==null){
  const r=record(p.review,'review',['revision','summary','files','conflicts','checks']);text(r.revision,'review.revision',256);text(r.summary,'review.summary');
  const files=array(r.files,'files');files.forEach(v=>{const f=record(v,'reviewFile',['path','change','binary','beforeText','afterText','beforeBytes','afterBytes','currentText','currentBytes','conflict']);text(f.path,'path',4096);if(!['added','modified','deleted'].includes(f.change as string))fail('change');boolean(f.binary,'binary');nullableText(f.beforeText,'beforeText',500000);nullableText(f.afterText,'afterText',500000);integer(f.beforeBytes,'beforeBytes');integer(f.afterBytes,'afterBytes');integer(f.currentBytes,'currentBytes');nullableText(f.currentText,'currentText',500000);boolean(f.conflict,'conflict');if(f.binary&&(f.beforeText!==null||f.afterText!==null||f.currentText!==null))fail('binary must not decode');});unique(files,'path','files');
  const paths=new Set(files.map(f=>(f as {path:string}).path));array(r.conflicts,'conflicts').forEach(v=>{text(v,'conflict',4096);if(!paths.has(v))fail('unknown conflict path');});
  if(files.some(f=>{const file=f as {path:string;conflict:boolean};return file.conflict!==(r.conflicts as string[]).includes(file.path);}))fail('conflict projection mismatch');
  array(r.checks,'checks',100).forEach(v=>{const c=record(v,'check',['name','status','detail']);text(c.name,'check.name',256);if(!['passed','failed','not_run'].includes(c.status as string))fail('check.status');nullableText(c.detail,'check.detail');});
 }
 if(p.failure!==null){const f=record(p.failure,'failure',['code','message','retryable']);text(f.code,'failure.code',128);text(f.message,'failure.message');boolean(f.retryable,'failure.retryable');}
 const caps=record(p.capabilities,'capabilities',['stop','steer','pause','resume','apply','restore']);Object.values(caps).forEach(v=>boolean(v,'capability'));
 if(['ready','conflict'].includes(p.reviewState as string)&&p.review===null)fail('ready requires review');
 return value as RunSnapshot;
}
export function parseReply(value:unknown):SnapshotReply{
 const r=record(value,'reply',['protocolVersion','sequence','snapshot']);if(r.protocolVersion!==1)fail('protocolVersion');integer(r.sequence,'sequence');parseRun(r.snapshot);return value as SnapshotReply;
}
export function parseEvent(value:unknown):VibeEvent{
 const e=record(value,'event',['protocolVersion','runId','sequence','timestampUtc','kind','payload']);
 if(e.protocolVersion!==1||e.kind!=='run_snapshot')fail('event version/kind');text(e.runId,'runId',256);integer(e.sequence,'sequence');date(e.timestampUtc,'timestampUtc');
 if(parseRun(e.payload).runId!==e.runId)fail('event runId mismatch');return value as VibeEvent;
}
export function parseSnapshot(value:unknown):VibeSnapshot{
 const s=record(value,'snapshot',['revision','spaces','sessions','studios','models']);integer(s.revision,'revision');
 const spaces=parseSpaceSummaries(s.spaces);
 const models=array(s.models,'models',200);models.forEach(v=>model(v,'model'));
 const spaceIds=new Set(spaces.map(v=>(v as {spaceId:string}).spaceId));const sessions=parseStudioSummaries(s.sessions);sessions.forEach(v=>{if(!spaceIds.has(v.spaceId))fail('orphan session');});const studios=array(s.studios,'studios');
 studios.forEach(v=>{const {sequence,...run}=v as Record<string,unknown>;integer(sequence,'sequence');parseRun(run);if(!spaceIds.has(run.spaceId as string))fail('orphan run');});unique(studios,'runId','studios');
 return value as VibeSnapshot;
}
/** Binding collection conversion is explicit; every native read is a SnapshotReply. */
export function parseReadProjection(value:unknown):VibeSnapshot{
 const p=record(value,'readProjection',['revision','spaces','sessions','runs','models']);
 const studios=array(p.runs,'runs').map(raw=>{const reply=parseReply(raw);return {...reply.snapshot,sequence:reply.sequence};});
 return parseSnapshot({revision:p.revision,spaces:p.spaces,sessions:p.sessions,models:p.models,studios});
}
export function parseFolderGrant(value:unknown):FolderGrant{const g=record(value,'folderGrant',['folderGrantId','folder']);text(g.folderGrantId,'folderGrantId',256);text(g.folder,'folder',4096);return value as FolderGrant;}
export function validateCommand(command:VibeCommand):void{
 const extra:Record<string,string[]>={
 'create-space':['name','folderGrantId'],'create-studio':['spaceId','goal','model'],start:['studioId'],stop:['runId'],steer:['runId','message'],consent:['runId','requestId','choice'],review:['runId','reviewRevision','decision','paths'],restore:['runId','checkpointId'],retry:['runId']};
 record(command,'command',['type','commandId','expectedRevision',...(extra[command.type]??[])]);
 text(command.commandId,'commandId',256);integer(command.expectedRevision,'expectedRevision');if('runId'in command)text(command.runId,'runId',256);
 switch(command.type){
 case 'create-space':text(command.name,'name',120);text(command.folderGrantId,'folderGrantId',256);break;
 case 'create-studio':text(command.spaceId,'spaceId',256);text(command.goal,'goal');model(command.model,'model');break;
 case 'steer':text(command.message,'message');break;
 case 'consent':text(command.requestId,'requestId',256);if(!['allow_once','allow_for_run','deny'].includes(command.choice))fail('choice');break;
 case 'review':text(command.reviewRevision,'reviewRevision',256);if(!['apply','discard'].includes(command.decision))fail('decision');array(command.paths,'paths').forEach(v=>text(v,'path',4096));if(new Set(command.paths).size!==command.paths.length)fail('duplicate path');if(command.decision==='apply'&&!command.paths.length)fail('empty apply');break;
 case 'restore':text(command.checkpointId,'checkpointId',256);break;
 case 'start':text(command.studioId,'studioId',256);break;
 case 'stop':case 'retry':break;
 default:fail('command.type');
 }
}

export function parseStudioSummaries(value:unknown):import('./wire').StudioSummary[]{
 const sessions=array(value,'sessions');sessions.forEach(v=>{const p=record(v,'session',['studioId','spaceId','goal','model','canStart','latestRunId']);text(p.studioId,'studioId',256);text(p.spaceId,'spaceId',256);text(p.goal,'goal');model(p.model,'model');boolean(p.canStart,'canStart');if(p.latestRunId!==null)text(p.latestRunId,'latestRunId',256);});unique(sessions,'studioId','sessions');return value as import('./wire').StudioSummary[];
}

export function parseSpaceSummaries(value:unknown):import('./wire').SpaceSummary[]{
 const spaces=array(value,'spaces');spaces.forEach(v=>{const p=record(v,'space',['spaceId','name','autonomy','scopeLabel','studioCount']);text(p.spaceId,'spaceId',256);text(p.name,'space.name',120);text(p.scopeLabel,'scopeLabel',4096);integer(p.studioCount,'studioCount');if(p.autonomy!=='ask_for_writes')fail('autonomy');});unique(spaces,'spaceId','spaces');return value as import('./wire').SpaceSummary[];
}
