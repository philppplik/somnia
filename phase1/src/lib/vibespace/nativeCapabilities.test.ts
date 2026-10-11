import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNativeCapabilities} from './nativeCapabilities';
const caps={transport:false,files:false,actions:['create-space','create-studio','stop','steer','consent','review'],pause:false,resume:false,catalog:false};
test('native configuration gates start/retry and platform gates restore',()=>{
 assert.deepEqual(parseNativeCapabilities(caps),caps.actions);
 for(const action of ['start','retry','restore','shell'])assert.throws(()=>parseNativeCapabilities({...caps,actions:[...caps.actions,action]}));
 assert.deepEqual(parseNativeCapabilities({...caps,transport:true,files:true,actions:[...caps.actions,'start','retry','restore']}),[...caps.actions,'start','retry','restore']);
});
test('malformed capabilities fail closed',()=>{
 for(const value of [null,{}, {...caps,transport:'true'},{...caps,actions:['review','review']},{...caps,extra:true},{...caps,pause:true}])assert.throws(()=>parseNativeCapabilities(value));
});
