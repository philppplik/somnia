import {test} from 'node:test';import assert from 'node:assert/strict';
import {AnimationSession} from '../animation/session';
import {findComp,findLayer} from '../animation/model';
import {createAnimationKeyPort,type AnimationKeyProposal} from './animationKeyPort';
import {AnimationKeyTransactions} from './animationKeyTransactions';

const signal=()=>new AbortController().signal;
function setup(){
 const session=new AnimationSession(null);
 session.createBlank('test');
 session.dispatch([{type:'layer.add',kind:'shape',id:'L'},{type:'prop.animate',layer:'L',prop:'opacity',on:true,t:0}]);
 session.setView({selectedLayer:'L'});
 session.selectKeys([{layer:'L',prop:'opacity',t:0}]);
 const transactions=new AnimationKeyTransactions();
 let proposal!:AnimationKeyProposal;
 const port=createAnimationKeyPort({session,permission:()=>{},stage:(p:AnimationKeyProposal)=>{proposal=p;transactions.stage('p',{proposal:p,port,origin:'ai:test'});},execution:{permission:()=>{}}});
 const ctx={files:()=>({}),propose:async()=>{throw Error('No whole file writes');}};
 return {session,transactions,port,ctx,get proposal(){return proposal;},value:()=>findLayer(findComp(session.document!),'L')!.transform.opacity.keys[0].v};
}

test('propose stages one pending review; accept applies exactly one native step and owned undo restores',async()=>{
 const f=await setup();
 assert.equal(f.transactions.hasPending,false);
 await f.port.run('animation_propose_key',{value:55},f.ctx,signal());
 assert.equal(f.transactions.hasPending,true);
 assert.equal(f.value(),100,'staging never mutates the session');
 await f.transactions.accept('p',signal());
 assert.equal(f.value(),55);
 assert.equal(f.session.getState().canUndo,true);
 await f.transactions.undo('p',signal());
 assert.equal(f.value(),100);
 await assert.rejects(f.transactions.undo('p',signal()),/No owned animation receipt/);
});

test('reject dismisses the preview and consumes the port capability',async()=>{
 const f=await setup();
 await f.port.run('animation_propose_key',{value:55},f.ctx,signal());
 assert.equal(f.transactions.reject('p'),true);
 assert.equal(f.transactions.reject('p'),false);
 await assert.rejects(f.transactions.accept('p',signal()),/no longer pending/);
 assert.throws(()=>f.port.acceptReviewed(f.proposal,f.proposal.reviewId!,55,'ai:test',signal()));
 assert.equal(f.value(),100);
});

test('duplicate stage id and clear during pending refuse honestly',async()=>{
 const f=await setup();
 await f.port.run('animation_propose_key',{value:55},f.ctx,signal());
 assert.throws(()=>f.transactions.stage('p',{proposal:f.proposal,port:f.port,origin:'ai:test'}),/Duplicate/);
 f.transactions.clear();
 assert.equal(f.transactions.hasPending,false);
 await assert.rejects(f.transactions.accept('p',signal()),/no longer pending/);
 assert.equal(f.value(),100);
});

test('manual edit after staging makes the accept fail instead of overwriting',async()=>{
 const f=await setup();
 await f.port.run('animation_propose_key',{value:55},f.ctx,signal());
 f.session.dispatch({type:'prop.set',layer:'L',prop:'opacity',t:0,value:70});
 await assert.rejects(f.transactions.accept('p',signal()));
 assert.equal(f.value(),70,'the manual edit wins; nothing is restored over it');
});
