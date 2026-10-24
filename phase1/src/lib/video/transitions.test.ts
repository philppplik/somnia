import test from 'node:test';
import assert from 'node:assert/strict';
import {CLIP_TRANSITIONS,sanitizeClips,setTransition,transitionOf,transitionVisual,type TimelineClip} from './timeline';
import {clipsSignature,parseVideoProject,serializeVideoProject} from './projectFile';

const clip=(id:string,extra:Partial<TimelineClip>={}):TimelineClip=>({id,source:'v',in_s:0,out_s:2,gain:1,muted:false,...extra});

test('transitions: transitionOf validates and falls back to dissolve',()=>{
 assert.equal(transitionOf(clip('a')),'dissolve');
 assert.equal(transitionOf(clip('a',{transition:'wipe-l'})),'wipe-l');
 assert.equal(transitionOf(clip('a',{transition:'bogus' as never})),'dissolve');
 for(const tr of CLIP_TRANSITIONS)assert.equal(transitionOf(clip('a',{transition:tr})),tr);
});

test('transitions: wipe reveals from its edge, slide offsets from its edge',()=>{
 assert.deepEqual(transitionVisual('wipe-l',0.5,100,50).rect,{x:0,y:0,w:50,h:50});
 assert.deepEqual(transitionVisual('wipe-r',0.5,100,50).rect,{x:50,y:0,w:50,h:50});
 assert.deepEqual(transitionVisual('wipe-t',0.25,100,40).rect,{x:0,y:0,w:100,h:10});
 assert.deepEqual(transitionVisual('wipe-b',0.25,100,40).rect,{x:0,y:30,w:100,h:10});
 assert.deepEqual(transitionVisual('slide-l',0.5,100,50),{kind:'slide',dx:-50,dy:0,rect:null});
 assert.deepEqual(transitionVisual('slide-r',0.5,100,50),{kind:'slide',dx:50,dy:0,rect:null});
 assert.deepEqual(transitionVisual('slide-t',0.5,100,50),{kind:'slide',dx:0,dy:-25,rect:null});
 assert.deepEqual(transitionVisual('slide-b',0.5,100,50),{kind:'slide',dx:0,dy:25,rect:null});
 assert.deepEqual(transitionVisual('dissolve',0.5,100,50),{kind:'dissolve',dx:0,dy:0,rect:null});
 // Progress clamps: p=0 hides the incoming side fully, p=1 shows it fully.
 assert.deepEqual(transitionVisual('wipe-l',0,100,50).rect,{x:0,y:0,w:0,h:50});
 assert.deepEqual(transitionVisual('slide-r',0,100,50).dx,100);
 assert.deepEqual(transitionVisual('slide-r',1,100,50).dx,0);
});

test('transitions: setTransition sets and clears the style',()=>{
 const clips=[clip('a'),clip('b')];
 const wiped=setTransition(clips,'a','wipe-b');
 assert.equal(transitionOf(wiped[0]),'wipe-b');
 assert.equal(transitionOf(wiped[1]),'dissolve');
 assert.equal(wiped[0].transition,'wipe-b');
 const cleared=setTransition(wiped,'a','dissolve');
 assert.equal('transition' in cleared[0],false,'dissolve clears the field');
});

test('transitions: sanitizeClips keeps valid styles and drops junk',()=>{
 const d={v:5};
 assert.equal(sanitizeClips([clip('a',{transition:'slide-t'})],d)[0].transition,'slide-t');
 assert.equal('transition' in sanitizeClips([clip('a',{transition:'dissolve'})],d)[0],false);
 assert.equal('transition' in sanitizeClips([clip('a',{transition:'spin' as never})],d)[0],false);
 // Title and image clips carry the style through sanitation too.
 assert.equal(sanitizeClips([{id:'t',kind:'title',source:'',in_s:0,out_s:3,gain:1,muted:false,transition:'wipe-l' as const}],d)[0].transition,'wipe-l');
 assert.equal(sanitizeClips([{id:'i',kind:'image',source:'img',in_s:0,out_s:3,gain:1,muted:false,transition:'slide-r' as const}],d)[0].transition,'slide-r');
});

test('transitions: style is part of the dirty signature',()=>{
 const a=[clip('a')];
 assert.notEqual(clipsSignature(setTransition(a,'a','wipe-l')),clipsSignature(a));
 assert.equal(clipsSignature(setTransition(a,'a','dissolve')),clipsSignature(a));
});

test('transitions: project roundtrip preserves the style',()=>{
 const clips=[clip('a',{crossfade_s:0.5,transition:'slide-b'}),clip('b')];
 const text=serializeVideoProject(clips,[],'webm');
 assert.match(text,/"transition": "slide-b"/);
 const parsed=parseVideoProject(text);
 assert.equal(transitionOf(parsed.clips[0]),'slide-b');
 assert.equal(transitionOf(parsed.clips[1]),'dissolve');
 assert.equal('transition' in parsed.clips[1],false);
});
