import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLookPatch,lookFromState} from './CharLookDialog';
import {checkFormatPatch} from '../../lib/documents/protocol';
const st:any={underlineStyle:'none',underlineColor:'auto',charShading:'none'};
test('look form: only changes go into the patch',()=>{
 const f=lookFromState(st);assert.deepEqual(f,{style:'none',color:'',shading:'',scale:'',hidden:false,noProof:false,lang:''});assert.equal(buildLookPatch(st,f),null);
 assert.deepEqual(buildLookPatch(st,{...f,style:'wave'}),{underlineStyle:'wave'});
 assert.deepEqual(buildLookPatch(st,{...f,color:'#c0392b',shading:'fff2cc'}),{underlineColor:'C0392B',charShading:'FFF2CC'});
 const on:any={underlineStyle:'double',underlineColor:'C0392B',charShading:'FFF2CC'};const g=lookFromState(on);
 assert.deepEqual(buildLookPatch(on,{...g,style:'none',color:'',shading:''}),{underline:false,underlineColor:'auto',charShading:'none'});
 const mixed=lookFromState({underlineStyle:null,underlineColor:null,charShading:null} as any);assert.equal(mixed.style,'');assert.equal(buildLookPatch({underlineStyle:null} as any,mixed),null);
});
test('look form: invalid colours give no patch',()=>{
 const f=lookFromState(st);for(const bad of ['red','12345','#GGGGGG'])assert.equal(buildLookPatch(st,{...f,color:bad}),null,bad);assert.equal(buildLookPatch(st,{...f,shading:'zz'}),null);
});
test('checkFormatPatch validates underline style, underline colour and character shading',()=>{
 checkFormatPatch({underlineStyle:'wave'});checkFormatPatch({underlineColor:'auto'});checkFormatPatch({underlineColor:'ABCDEF'});checkFormatPatch({charShading:'none'});checkFormatPatch({charShading:'ABCDEF'});
 for(const bad of [{underlineStyle:'zigzag'},{underlineStyle:1},{underlineColor:'red'},{underlineColor:3},{charShading:'red'},{charShading:true}])assert.throws(()=>checkFormatPatch(bad),JSON.stringify(bad));
});
