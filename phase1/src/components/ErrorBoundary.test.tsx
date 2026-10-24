import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ErrorBoundary} from './ErrorBoundary';

/** Drives the boundary like React does: getDerivedStateFromError, then componentDidCatch, then render. */
function crashed(error:unknown,stack?:string){
 const b=new ErrorBoundary({label:'Somnia',children:null});
 Object.assign(b.state,{failed:true}); // getDerivedStateFromError()
 type St={failed:boolean;detail?:string;component?:string};
 let update:Partial<St>|undefined;
 b.setState=((u:Partial<St>|((s:St)=>Partial<St>))=>{update=typeof u==='function'?u(b.state):u;}) as never;
 b.componentDidCatch(error,{componentStack:stack} as never);
 if(update)Object.assign(b.state,update);
 return renderToStaticMarkup(b.render());
}

test('a crashed boundary names the error and the throwing component for the e2e snapshot',()=>{
 const html=crashed(new Error('boom: token sk-secret123456'),'\n    at PhotosWorkspace\n    at PhotosCanvas');
 assert.match(html,/role="alert"/);
 assert.match(html,/Somnia could not be loaded\./);
 assert.match(html,/boom/);
 assert.match(html,/at PhotosWorkspace/);
 assert.doesNotMatch(html,/sk-secret123456/); // redacted like the log
});
test('the boundary stays quiet when there is nothing to diagnose',()=>{
 const html=crashed(undefined,undefined);
 assert.match(html,/Somnia could not be loaded\./);
 assert.doesNotMatch(html,/sr-only/);
});
