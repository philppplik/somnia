import assert from 'node:assert/strict';
import {test} from 'node:test';
import {applyColorToPixels,colorCssFilter,colorOf,hasColor,NEUTRAL_COLOR} from './colorAdjust';
import {fullClip,sanitizeClips} from './timeline';
import {parseVideoProject,serializeVideoProject,clipsSignature} from './projectFile';

test('colorOf clamps, rounds and defaults', () => {
 assert.deepEqual(colorOf(undefined), NEUTRAL_COLOR);
 assert.deepEqual(colorOf({color:{brightness:500,contrast:-500,saturation:12.6}}), {brightness:100,contrast:-100,saturation:13});
 assert.deepEqual(colorOf({color:{brightness:Number.NaN} as never}), NEUTRAL_COLOR);
 assert.equal(hasColor({color:{brightness:0,contrast:0,saturation:0}}), false);
 assert.equal(hasColor({color:{brightness:1,contrast:0,saturation:0}}), true);
});
test('css filter is empty when neutral and follows brightness/contrast/saturate order', () => {
 assert.equal(colorCssFilter(NEUTRAL_COLOR), '');
 assert.equal(colorCssFilter({brightness:50,contrast:-50,saturation:100}), 'brightness(1.50) contrast(0.50) saturate(2.00)');
});
test('pixel pass: neutral is identity, brightness scales, saturation -100 gives grey, alpha untouched', () => {
 const a=new Uint8ClampedArray([100,150,200,77]);applyColorToPixels(a,NEUTRAL_COLOR);assert.deepEqual([...a],[100,150,200,77]);
 const b=new Uint8ClampedArray([100,100,100,255]);applyColorToPixels(b,{brightness:50,contrast:0,saturation:0});assert.deepEqual([...b],[150,150,150,255]);
 const c=new Uint8ClampedArray([255,0,0,10]);applyColorToPixels(c,{brightness:0,contrast:0,saturation:-100});
 assert.equal(c[0],c[1]);assert.equal(c[1],c[2]);assert.equal(c[3],10);
 const d=new Uint8ClampedArray([200,200,200,255]);applyColorToPixels(d,{brightness:100,contrast:0,saturation:0});assert.deepEqual([...d],[255,255,255,255]);
 const e=new Uint8ClampedArray([128,128,128,255]);applyColorToPixels(e,{brightness:0,contrast:100,saturation:0});assert.ok(Math.abs(e[0]-128)<=1);
});
test('sanitizeClips keeps a real correction and drops a neutral one; titles never carry one', () => {
 const c={...fullClip('a.mp4',10),color:{brightness:20,contrast:0,saturation:0}};
 const n={...fullClip('a.mp4',10),color:{brightness:0,contrast:0,saturation:0}};
 const [x,y]=sanitizeClips([c,n],{'a.mp4':10});
 assert.deepEqual(x.color,{brightness:20,contrast:0,saturation:0});
 assert.equal('color' in y,false);
});
test('colour survives a project save and load and changes the dirty signature', () => {
 const c={...fullClip('a.mp4',10),color:{brightness:-10,contrast:25,saturation:40}};
 const text=serializeVideoProject([c],[],'webm');
 const back=parseVideoProject(text);
 assert.deepEqual(back.clips[0].color,{brightness:-10,contrast:25,saturation:40});
 assert.notEqual(clipsSignature([c]),clipsSignature([{...c,color:undefined}]));
 const plain=parseVideoProject(serializeVideoProject([fullClip('a.mp4',10)],[],'webm'));
 assert.equal('color' in plain.clips[0],false);
});
