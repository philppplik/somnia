import test from 'node:test';import assert from 'node:assert/strict';
import {trackNativeDrop,nativeDropIsChat,consumeNativeChatDrop} from './nativeChatDrop';
test('native target is conservative without a DOM, consuming resets the route',()=>{trackNativeDrop('over',{x:12,y:12});assert.equal(nativeDropIsChat(),false);assert.equal(consumeNativeChatDrop(),false);trackNativeDrop('leave');assert.equal(nativeDropIsChat(),false);});
