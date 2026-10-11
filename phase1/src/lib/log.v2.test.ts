import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ERROR_IDS,ERROR_META,RETIRED_ERROR_IDS,type ErrorId} from './../generated/errorIds';
import {logEvent,logFatal,subscribeReportedFailures,getRing,clearRing,getLoggerHealth,fp64,normalizeForFingerprint,newUlid,toSafeLogEvent,toSafeLogEvents,publishReportedFailure,logSession,adoptBootBuffer} from './log';
import {SWALLOW_REASONS} from './log.types';

const reset=()=>clearRing();
const withClock=<T>(start:number,fn:(set:(t:number)=>void)=>T):T=>{
 const real=Date.now;let t=start;Date.now=()=>t;
 try{return fn(n=>{t=n;});}finally{Date.now=real;}
};

test('registry: 76 active ids, value union, meta for each, deprecated/reserved/ci-only excluded',()=>{
 const values=Object.values(ERROR_IDS);
 assert.equal(values.length,76);
 for(const [k,v] of Object.entries(ERROR_IDS)){assert.equal(k,v.replace(/^SOM-/,'').replace(/-/g,'_'));assert.match(v,/^SOM-[A-Z]{2,4}-\d{3}$/);assert.ok(ERROR_META[v],v);assert.match(ERROR_META[v].messageKey,/^err\.[a-z]+\.\d{3}$/);}
 for(const r of RETIRED_ERROR_IDS)assert.ok(!values.includes(r as never),r);
 const fatal=values.filter(v=>ERROR_META[v].fatal).sort();
 assert.deepEqual(fatal,['SOM-APP-001','SOM-APP-009','SOM-DOC-002']);
 const seed=JSON.parse(readFileSync(new URL('../../../docs/errors/registry.json',import.meta.url),'utf8'));
 assert.equal(seed.entries.filter((e:{status:string})=>e.status==='active').length,values.length);
});

test('fp64 is FNV-1a 64 (published test vectors) and normalization collapses variable parts',()=>{
 assert.equal(fp64(''),'cbf29ce484222325');
 assert.equal(fp64('a'),'af63dc4c8601ec8c');
 assert.equal(fp64('foobar'),'85944171f73967e8');
 assert.equal(normalizeForFingerprint('open C:\\Users\\bob\\secret.html failed 42'),'open <path> failed #');
 assert.equal(normalizeForFingerprint('id 0123456789abcdef and 01ARZ3NDEKTSV4RRFFQ69G5FAV'),'id <hex> and <id>');
 assert.equal(newUlid().length,26);assert.match(newUlid(),/^[0-9A-HJKMNP-TV-Z]{26}$/);
});

test('unexpected error returns a ReportedFailure with incidentId and notifies subscribers once',()=>{
 reset();const seen:unknown[]=[];const off=subscribeReportedFailures(f=>seen.push(f));
 const f=logEvent(ERROR_IDS.APP_002,{cause:'read /home/bob/a.html failed',corr:'req-1',context:{ordinal:3}});
 assert.ok(f);assert.equal(f.id,'SOM-APP-002');assert.match(f.incidentId,/^[0-9A-HJKMNP-TV-Z]{26}$/);
 assert.equal(f.level,'error');assert.equal(f.expected,false);assert.equal(f.fatal,false);assert.equal(f.corr,'req-1');assert.equal(f.ordinal,3);
 assert.equal(f.userMessageKey,'err.app.002');assert.match(f.fingerprint,/^[0-9a-f]{16}$/);
 assert.deepEqual(seen,[f]);
 const line=getRing().at(-1)!;assert.equal(line.incident_id,f.incidentId);assert.equal(line.session,logSession);assert.equal(line.source,'ts');
 assert.doesNotMatch(JSON.stringify(line),/bob|a\.html/);
 off();logEvent(ERROR_IDS.APP_002,{cause:'again x'});assert.equal(seen.length,1);
});

test('expected events are logged but return null and never notify',()=>{
 reset();let n=0;const off=subscribeReportedFailures(()=>n++);
 assert.equal(logEvent(ERROR_IDS.APP_011,{expected:true,cause:'policy'}),null);
 assert.equal(n,0);const line=getRing().at(-1)!;assert.equal(line.expected,true);assert.equal(line.incident_id,undefined);assert.equal(getLoggerHealth().expected,1);off();
});

test('unexpected warn gets an incidentId, debug and info do not report',()=>{
 reset();
 const warn=Object.values(ERROR_IDS).find(i=>ERROR_META[i].severity==='warn'&&!ERROR_META[i].expected)!;
 const f=logEvent(warn,{cause:'x'});assert.ok(f);assert.equal(f.level,'warn');assert.ok(f.incidentId);
 const debug=Object.values(ERROR_IDS).find(i=>ERROR_META[i].severity==='debug')!;
 assert.equal(logEvent(debug,{cause:'y'}),null);assert.equal(getRing().at(-1)!.level,'debug');
});

test('fatal is set only on request and only for registry-fatal ids',()=>{
 reset();
 assert.equal(logEvent(ERROR_IDS.APP_001,{cause:'boot'})!.fatal,false);
 assert.equal(logFatal(ERROR_IDS.APP_001,{cause:'boot2'})!.fatal,true);
 assert.equal(getRing().at(-1)!.fatal,true);
 assert.equal(logFatal(ERROR_IDS.APP_002,{cause:'not fatal id'})!.fatal,false);
 assert.equal(getRing().at(-1)!.fatal,undefined);
});

test('unknown level becomes error with level_raw',()=>{
 reset();logEvent(ERROR_IDS.APP_005,{cause:'z',level:'catastrophic'});
 const l=getRing().at(-1)!;assert.equal(l.level,'error');assert.equal(l.level_raw,'catastrophic');
});

test('rate limit: 5 per fingerprint per minute, then null; next pass carries suppressed count; no second notice',()=>withClock(1_000_000,set=>{
 reset();let n=0;const off=subscribeReportedFailures(()=>n++);
 for(let i=0;i<5;i++)assert.ok(logEvent(ERROR_IDS.FS_010,{cause:'same'}),`#${i}`);
 for(let i=0;i<4;i++)assert.equal(logEvent(ERROR_IDS.FS_010,{cause:'same'}),null);
 assert.equal(n,5);assert.equal(getLoggerHealth().suppressed,4);
 assert.ok(logEvent(ERROR_IDS.FS_010,{cause:'different'}));
 set(1_000_000+13_000);
 const f=logEvent(ERROR_IDS.FS_010,{cause:'same'});assert.ok(f);
 assert.equal(getRing().at(-1)!.suppressed,4);
 off();
}));

test('context allowlist: unknown keys, wrong types and paths are dropped or masked',()=>{
 reset();
 logEvent(ERROR_IDS.APP_002,{cause:'c',context:{ordinal:2,count:'x',cmd:'read_file',path:'/home/bob/x.html',prompt:'secret prompt',ext:'/tmp/dir/evil.html',size:Number.NaN}});
 const c=getRing().at(-1)!.context;
 assert.deepEqual(Object.keys(c).sort(),['cmd','ext','ordinal']);assert.equal(c.ext,'<path>');
 assert.equal(getLoggerHealth().droppedFields,4);
});

test('secrets in cause never reach the ring',()=>{
 reset();logEvent(ERROR_IDS.AUTH_001,{cause:'failed token=ghp_abcdefghijklmnop1234 and Bearer abc123def456ghi'});
 assert.doesNotMatch(JSON.stringify(getRing()),/ghijklmnop|abc123def/);
});

test('ring keeps the last 500 lines and counts dropped',()=>{
 reset();for(let i=0;i<510;i++)logEvent(ERROR_IDS.APP_005,{cause:`n${'a'.repeat(i%7)}b`,expected:true,context:{count:i}});
 assert.ok(getRing().length<=500);
});

test('subscriber errors do not break logging; publishReportedFailure fans out Rust-origin failures',()=>{
 reset();const got:string[]=[];
 const a=subscribeReportedFailures(()=>{throw new Error('boom');});const b=subscribeReportedFailures(f=>got.push(f.id));
 assert.ok(logEvent(ERROR_IDS.APP_002,{cause:'q'}));
 publishReportedFailure({id:ERROR_IDS.FS_006,incidentId:'01ARZ3NDEKTSV4RRFFQ69G5FAV' as never,expected:false,level:'error',fatal:false,fingerprint:'0'.repeat(16),userMessageKey:'err.fs.006'});
 assert.deepEqual(got,['SOM-APP-002','SOM-FS-006']);a();b();
});

test('seq is monotonic and (session, source, seq) is unique',()=>{
 reset();for(let i=0;i<3;i++)logEvent(ERROR_IDS.APP_005,{cause:`s${'x'.repeat(i)}`});
 const s=getRing().map(l=>l.seq);assert.deepEqual(s,[...s].sort((x,y)=>x-y));assert.equal(new Set(s).size,s.length);
});

test('adoptBootBuffer routes boot events through the normal path',()=>{
 reset();adoptBootBuffer([{id:ERROR_IDS.APP_001,cause:'boot import failed at /app/main.js'}]);
 const l=getRing().at(-1)!;assert.equal(l.id,'SOM-APP-001');assert.doesNotMatch(l.message,/\/app\/main/);
});

test('export contract: SafeLogEvent drops free text, legacy lines and poison values, keeps the merge key',()=>{
 reset();
 const poison='<img src=x onerror=alert(1)>\u202e'+'A'.repeat(5000)+'\n/home/bob/Taxes 2025.pdf';
 logEvent(ERROR_IDS.APP_002,{cause:poison,context:{ordinal:1,count:7,cmd:'read_file',ext:poison,code:poison},corr:'req-9'});
 const raw=getRing().at(-1)!;
 const safe=toSafeLogEvent(raw)!;
 assert.ok(safe);
 const j=JSON.stringify(safe);
 assert.doesNotMatch(j,/bob|Taxes|onerror|AAAA|message|cause/);
 assert.deepEqual(safe.context,{ordinal:1,count:7,cmd:'read_file'});
 assert.equal(safe.session,raw.session);assert.equal(safe.seq,raw.seq);assert.equal(safe.source,'ts');assert.equal(safe.id,raw.id);assert.equal(safe.incident_id,raw.incident_id);
 // Legacy / malformed input is rejected, never passed through.
 for(const bad of [null,'x',{ts:'t',level:'error',source:'frontend.unhandled',message:'/home/bob/a.html'},{v:1,id:'SOM-APP-002'},{...raw,id:'SOM-ZZZ-999'},{...raw,session:undefined}])assert.equal(toSafeLogEvent(bad),null);
 // Foreign string fields inside an otherwise valid line cannot smuggle text.
 const tampered=toSafeLogEvent({...raw,fingerprint:poison,corr:poison,window:poison,build:{...raw.build,release:poison}})!;
 assert.doesNotMatch(JSON.stringify(tampered),/bob|onerror|Taxes/);
});

test('toSafeLogEvents dedupes by (session, source, seq) and keeps the original key',()=>{
 reset();logEvent(ERROR_IDS.APP_005,{cause:'p'});logEvent(ERROR_IDS.APP_005,{cause:'p2 q'});
 const ring=getRing();const merged=toSafeLogEvents([...ring,...ring,{...ring[0],source:'rust'}]);
 assert.equal(merged.length,3);assert.deepEqual(merged.filter(e=>e.source==='ts').map(e=>e.seq),ring.map(l=>l.seq));
});

test('swallow reasons include best-effort-window and are a closed set',()=>{
 assert.ok(SWALLOW_REASONS.includes('best-effort-window'));assert.equal(new Set(SWALLOW_REASONS).size,SWALLOW_REASONS.length);
});

import {reportAclDenied} from './log';
test('reportAclDenied logs SOM-ACL-001 with cmd and window only, never the message',()=>{
 reset();let seen:string|undefined;const off=subscribeReportedFailures(f=>{seen=f.id;});
 reportAclDenied({cmd:'read_file',window:'main',message:'denied for /home/bob/Taxes 2025.pdf'});
 const l=getRing().at(-1)!;
 assert.equal(l.id,'SOM-ACL-001');assert.deepEqual(l.context,{cmd:'read_file',window:'main'});
 assert.doesNotMatch(JSON.stringify(l),/bob|Taxes/);assert.equal(seen,'SOM-ACL-001');off();
});
test('registry flags: expected only for cancelled/user-input at info or debug; fatal ids are never recoverable',()=>{
 for(const id of Object.values(ERROR_IDS)){const m=ERROR_META[id];
  if(m.expected){assert.ok(['cancelled','user-input'].includes(m.category),id);assert.ok(['info','debug'].includes(m.severity),id);}
  if(m.fatal)assert.equal(m.recoverable,false,id);}
 assert.equal(ERROR_META['SOM-APP-011'].expected,false);
});
