import test from 'node:test';import assert from 'node:assert/strict';
import {trackNativeDrop,nativeDropIsChat,nativeDropIsInApp,consumeNativeChatDrop,consumeNativeConvertDrop} from './nativeChatDrop';
test('native target is conservative without a DOM, consuming resets the route',()=>{trackNativeDrop('over',{x:12,y:12});assert.equal(nativeDropIsChat(),false);assert.equal(consumeNativeChatDrop(),false);trackNativeDrop('leave');assert.equal(nativeDropIsChat(),false);});
test('native drop routes to chat, converter or neither by pointer position (physical pixels)',()=>{
 const rect=(l:number,t:number,r:number,b:number)=>({getBoundingClientRect:()=>({left:l,top:t,right:r,bottom:b})});
 const els:Record<string,unknown>={'.sc-panel':rect(0,0,100,100),'.cv-drop':rect(200,200,400,300)};
 const g=globalThis as unknown as Record<string,unknown>;const oldDoc=g.document,oldWin=g.window;
 g.document={querySelector:(s:string)=>els[s]??null};g.window={devicePixelRatio:2};
 try{
  trackNativeDrop('over',{x:100,y:100});assert.equal(nativeDropIsChat(),true);assert.equal(nativeDropIsInApp(),true);assert.equal(consumeNativeConvertDrop(),false);assert.equal(consumeNativeChatDrop(),true);
  trackNativeDrop('over',{x:500,y:500});assert.equal(nativeDropIsChat(),false);assert.equal(nativeDropIsInApp(),true);assert.equal(consumeNativeChatDrop(),false);assert.equal(consumeNativeConvertDrop(),true);assert.equal(nativeDropIsInApp(),false);
  trackNativeDrop('over',{x:900,y:900});assert.equal(nativeDropIsInApp(),false);
  trackNativeDrop('over',{x:500,y:500});trackNativeDrop('leave');assert.equal(consumeNativeConvertDrop(),false);
 }finally{g.document=oldDoc;g.window=oldWin;}
});
