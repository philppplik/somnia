import {test} from 'node:test';import assert from 'node:assert/strict';
import {decodeSessionWav,encodeSessionWav,reverseSource} from './sessionWav';

const src={id:'s',sampleRate:48000,channels:[new Float32Array([0,0.5,-0.5,1]),new Float32Array([1,-1,0.25,-0.25])]};

test('reverse: channels flip, the input stays untouched and double-reverse is the identity',()=>{
 const rev=reverseSource(src,'r');
 assert.deepEqual([...rev.channels[0]],[1,-0.5,0.5,0]);
 assert.deepEqual([...rev.channels[1]],[-0.25,0.25,-1,1]);
 assert.deepEqual([...src.channels[0]],[0,0.5,-0.5,1],'input untouched');
 assert.equal(rev.id,'r');
 assert.deepEqual([...reverseSource(rev,'x').channels[0]],[...src.channels[0]],'double reverse is the identity');
});

test('reverse: the reversed WAV round-trips through the session decoder',()=>{
 const rev=reverseSource(src,'r');
 const bytes=encodeSessionWav(rev.channels,rev.sampleRate);
 const back=decodeSessionWav('r',bytes);
 assert.equal(back.sampleRate,48000);
 assert.equal(back.channels.length,2);
 assert.deepEqual([...back.channels[0]],[...rev.channels[0]]);
 const mono=reverseSource({id:'m',sampleRate:44100,channels:[new Float32Array([0,1,0])]},'mr');
 const monoBack=decodeSessionWav('mr',encodeSessionWav(mono.channels,mono.sampleRate));
 assert.equal(monoBack.channels.length,1,'mono stays mono');
 assert.deepEqual([...monoBack.channels[0]],[0,1,0]);
});

test('reverse: encoder bounds mirror the decoder',()=>{
 assert.throws(()=>encodeSessionWav([new Float32Array(0)],48000),/Channel length/);
 assert.throws(()=>encodeSessionWav([new Float32Array(4)],4000),/Unsupported source format/);
 assert.throws(()=>encodeSessionWav([new Float32Array(4),new Float32Array(4),new Float32Array(4)],48000),/Unsupported source format/);
});
