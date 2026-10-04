import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSaved,clampPosition} from './windowState';
test('saved window state is validated',()=>{assert.equal(parseSaved(null),null);assert.equal(parseSaved('{"w":10,"h":10,"x":0,"y":0}'),null);assert.deepEqual(parseSaved('{"w":1200,"h":800,"x":10,"y":20,"max":true}'),{w:1200,h:800,x:10,y:20,max:true});});
test('off-screen positions are pulled back',()=>{const s={w:1200,h:800,x:5000,y:4000,max:false};assert.deepEqual(clampPosition(s,1920,1080),{x:1800,y:1000});assert.deepEqual(clampPosition({...s,x:-9000,y:-50},1920,1080),{x:-1080,y:0});});
