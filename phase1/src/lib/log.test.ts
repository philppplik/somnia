import test from 'node:test';
import assert from 'node:assert/strict';
import {redactText,redactValue,describeError,log,reportError,recentLog,clearLogBuffer,setNoticeSink,buildErrorReport,installGlobalErrorHandlers} from './log';
import {ProviderError} from './agent/errors';
test('secrets are masked in text',()=>{
 for(const s of ['failed sk-or-v1-abcdef1234567890 now','Authorization: Bearer abc123def456ghi','https://x.test/v1?api_key=hunter2hunter2&a=1','{"apiKey":"zzzzzzzz1234"}','token=ghp_abcdefghijklmnop1234','password: s3cretvalue'])
  assert.doesNotMatch(redactText(s),/abcdef1234|abc123def|hunter2|zzzzzzzz|ghijklmnop|s3cretvalue/,s);
 assert.match(redactText('https://x.test/?api_key=hunter2hunter2&a=1'),/a=1/);
 assert.equal(redactText('Cannot read index.html at line 3'),'Cannot read index.html at line 3');
});
test('object values mask sensitive keys and keep errors compact',()=>{
 const v=redactValue({file:'a.html',apiKey:'sk-live-123456789012',nested:{Authorization:'x'},err:new Error('bad sk-abcdefghijkl')}) as any;
 const j=JSON.stringify(v);
 assert.doesNotMatch(j,/123456789012|abcdefghijkl/);assert.match(j,/a\.html/);assert.equal(v.nested.Authorization,'[redacted]');
});
test('describeError includes ProviderError code and never the key',()=>{
 const d=describeError(new ProviderError('http','401 for key sk-or-v1-0123456789abcdef'));
 assert.match(d,/ProviderError/);assert.doesNotMatch(d,/0123456789abcdef/);
 assert.match(describeError('plain'),/plain/);assert.ok(describeError({a:1}).length>0);
});
test('ring buffer, dedupe and notify hint',()=>{
 clearLogBuffer();const hints:string[]=[];setNoticeSink(t=>hints.push(t));
 for(let i=0;i<5;i++)log('error','t','same');
 assert.equal(recentLog().length,1);
 reportError('ext.load',new Error('module x failed'),{notify:'Extension X could not be loaded.'});
 assert.equal(hints.length,1);assert.match(hints[0],/could not be loaded/);assert.match(hints[0],/error report/);
 const last=recentLog().at(-1)!;assert.equal(last.level,'error');assert.equal(last.source,'ext.load');assert.match(last.message,/module x failed/);assert.ok(Date.parse(last.ts));
 setNoticeSink(null);
});
test('error report has version header and redacted log lines',async()=>{
 clearLogBuffer();log('warn','t','oops token=abcdefabcdef123456');
 const r=await buildErrorReport();
 assert.match(r,/^Somnia /);assert.match(r,/oops/);assert.doesNotMatch(r,/abcdefabcdef123456/);
});
test('global handlers log unhandled errors and rejections once installed',()=>{
 clearLogBuffer();const l:Record<string,(e:any)=>void>={};
 installGlobalErrorHandlers({addEventListener:((n:string,f:any)=>{l[n]=f;}) as any});
 l.unhandledrejection({reason:new Error('async boom')});l.error({error:new Error('sync boom'),filename:'a.js',lineno:1,colno:2});
 const m=recentLog().map(e=>e.source+':'+e.message).join('|');
 assert.match(m,/frontend\.rejection:.*async boom/);assert.match(m,/frontend\.unhandled:.*sync boom/);
});
