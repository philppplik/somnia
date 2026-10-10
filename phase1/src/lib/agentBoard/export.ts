/** Defense in depth after engine redaction. Allowlist only machine facts; free text can hide secrets. */
export function exportPreview(input:unknown):string {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('board.error.export');
 const o=input as Record<string,unknown>;
 if(o.format==='somnia-session-export'){
  if(o.intent!==''||!Array.isArray(o.plan)||o.plan.length||!Array.isArray(o.notes)||o.notes.length||o.verification)throw Error('board.error.export');
  const allowed=['format','version','taskId','branch','baseSha','headSha','producer','status','intent','plan','diffSummary','cost','notes','review'];
  if(Object.keys(o).some(k=>!allowed.includes(k)))throw Error('board.error.export');
  const producer=o.producer as Record<string,unknown>|undefined,cost=o.cost as Record<string,unknown>|undefined,review=o.review as Record<string,unknown>|undefined,diff=o.diffSummary as Record<string,unknown>|undefined;
  const id=typeof o.taskId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(o.taskId)&&!o.taskId.includes('..');
  const sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{40,64}$/.test(v);
  const numbers=(v:Record<string,unknown>|undefined,keys:string[])=>!!v&&Object.keys(v).every(k=>keys.includes(k))&&Object.values(v).every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0);
  if(!id||o.branch!=='somnia/task/'+o.taskId||!sha(o.baseSha)||(o.headSha!==undefined&&!sha(o.headSha))||!producer||producer.kind!=='builtin'||producer.name!=='Somnia Agent'||Object.keys(producer).some(k=>!['kind','name'].includes(k))||!numbers(cost,['inputTokens','outputTokens','costUsd'])||(diff!==undefined&&!numbers(diff,['files','additions','deletions']))||!review||review.state!=='unreviewed'||!sha(review.contentHash)||Object.keys(review).some(k=>!['state','contentHash'].includes(k)))throw Error('board.error.export');
  return JSON.stringify(o,null,2);
 }
 const id=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,96}$/.test(v)?v:undefined;
 const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{40,64}$/.test(v)?v:undefined;
 const statuses=['queued','preparing','running','waiting-input','review','done','failed','cancelled'];
 const output={schemaVersion:1,taskId:id(o.taskId),status:statuses.includes(String(o.status))?o.status:undefined,
  baseSha:hash(o.baseSha),headSha:hash(o.headSha),contentHash:hash(o.contentHash),
  verification:['passed','failed','pending'].includes(String(o.verification))?o.verification:undefined,
  review:['accepted','rejected'].includes(String(o.review))?o.review:undefined};
 if(!output.taskId)throw Error('board.error.export');
 return JSON.stringify(output,null,2);
}
