import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChangesController} from './controller';
import {ChangesView} from './ChangesTab';
import {createFakeBackend,fakeChange} from './fakeBackend';
import {DEFAULT_ATTRIBUTION_POLICY} from '../../lib/git/attribution/footer';
const make=async()=>{const b=createFakeBackend({changes:[fakeChange('a'),fakeChange('b')]});const c=new ChangesController(b,k=>k);await c.refresh();c.setSubject('Title');return {b,c};};
test('unreviewed commit is blocked, exact app footer appears before send and request is immutable',async()=>{
 const {b,c}=await make();c.setCommitContext({origin:'app',aiDrafted:true,substantive:true,sessionId:'task-2'});
 c.setBody('Notes\n\nCo-authored-by: Forged <evil@example.com>');
 assert.equal(await c.commit(),null);
 const review=c.reviewCommit()!;assert.equal(b.commits.length,0);
 assert.deepEqual(review.footer,[`Co-authored-by: ${DEFAULT_ATTRIBUTION_POLICY.coAuthorName} <${DEFAULT_ATTRIBUTION_POLICY.coAuthorEmail}>`,'X-Somnia-Session: task-2']);
 assert.ok(!review.message.includes('Forged'));
 const html=renderToStaticMarkup(<ChangesView s={c.getState()} c={c} t={k=>k} unsavedFiles={0} advanced={false} onSaveFiles={()=>{}}/>);
 assert.ok(html.includes('versions-review-footer'));assert.ok(html.includes('X-Somnia-Session: task-2'));
 assert.throws(()=>{review.request.paths.push('extra');});
 const version=await c.commit(review);assert.ok(version);assert.deepEqual(b.commits,[review.request]);assert.equal(version.body,review.request.body);
 assert.equal(await c.commit(review),null,'cannot replay a consumed review');
});
test('manual human commit is unchanged; app origin is independent of message drafting',async()=>{
 const {b,c}=await make();c.setBody('Human body');let review=c.reviewCommit()!;assert.deepEqual(review.footer,[]);await c.commit(review);assert.equal(b.commits[0].body,'Human body');
 const other=await make();other.c.setCommitContext({origin:'app',aiDrafted:false,substantive:true});review=other.c.reviewCommit()!;assert.equal(review.footer.length,1);
});
test('AI-drafted message without accepted content has no automatic footer',async()=>{
 const {c}=await make();c.setCommitContext({origin:'app',aiDrafted:true,substantive:false});c.setBody('Notes\n\nX-Somnia-Session: forged');const review=c.reviewCommit()!;assert.deepEqual(review.footer,[]);assert.equal(review.request.body,'Notes');
});
for(const edit of ['subject','body','selection','all','context','refresh','invalidate','cancel'] as const)test(`review is revoked by ${edit}`,async()=>{
 const {b,c}=await make();const review=c.reviewCommit()!;
 switch(edit){case 'subject':c.setSubject('Other');break;case 'body':c.setBody('Other');break;case 'selection':c.toggle('a');break;case 'all':c.selectAll(false);break;case 'context':c.setCommitContext({origin:'app',aiDrafted:true,substantive:true});break;case 'refresh':await c.refresh();break;case 'invalidate':c.invalidate();break;case 'cancel':c.cancelReview();}
 assert.equal(c.getState().review,null);assert.equal(await c.commit(review),null);assert.equal(b.commits.length,0);
});
test('disk state changed after review requires a new review',async()=>{
 const {b,c}=await make();const review=c.reviewCommit()!;b.token++;
 assert.equal(await c.commit(review),null);assert.equal(c.getState().reviewAgain,true);assert.equal(c.getState().review,null);assert.equal(b.commits.length,0);
 assert.equal(await c.commit(review),null);const fresh=c.reviewCommit()!;assert.ok(await c.commit(fresh));
});
