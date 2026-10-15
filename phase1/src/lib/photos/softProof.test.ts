import test from 'node:test';
import assert from 'node:assert/strict';
import {chromaBoundary,chromaOf,isOutOfGamut,gamutShare,softProofImage,gamutWarningImage,DEFAULT_PRINT_MODEL,GAMUT_WARN} from './softProof.ts';
const frame=(pixels:[number,number,number][])=>{
 const data=new Uint8Array(pixels.length*4);
 pixels.forEach(([r,g,b],i)=>{data[i*4]=r;data[i*4+1]=g;data[i*4+2]=b;data[i*4+3]=255;});
 return{bytes:data.buffer,width:pixels.length,height:1};
};
test('softProof: the boundary peaks at mid luma and vanishes at the ends',()=>{
 assert.equal(chromaBoundary(0),0);
 assert.equal(chromaBoundary(255),0);
 assert.ok(Math.abs(chromaBoundary(128)-DEFAULT_PRINT_MODEL.chromaPeak)<1); // ~peak at mid luma
});
test('softProof: grays are always printable, saturated brights are out',()=>{
 assert.ok(!isOutOfGamut(128,128,128)); // gray: no chroma
 assert.ok(!isOutOfGamut(0,0,0)); // black: no chroma
 assert.ok(isOutOfGamut(255,0,0)); // pure red at high luma
 assert.ok(!isOutOfGamut(40,20,20)); // dark, low chroma
});
test('softProof: proof compresses OOG chroma, maps black/white onto ink/paper',()=>{
 const out=softProofImage(frame([[255,0,0],[128,128,128],[255,255,255],[0,0,0]]));
 const px=(i:number)=>[...new Uint8Array(out.bytes).slice(i*4,i*4+3)];
 const[r,g,b]=px(0);
 assert.ok(Math.max(r,g,b)-Math.min(r,g,b)<chromaOf(255,0,0)); // red muted
 assert.ok(r>=g&&g>=b); // stays reddish
 const gray=px(1);
 assert.ok(Math.max(...gray)-Math.min(...gray)<=8); // warm paper tints gray slightly, it stays near-neutral
 assert.ok(gray[0]>=gray[1]&&gray[1]>=gray[2]); // tint direction follows the paper
 assert.deepEqual(px(2),[...DEFAULT_PRINT_MODEL.paperWhite]); // white -> paper
 assert.deepEqual(px(3),[DEFAULT_PRINT_MODEL.blackLift,DEFAULT_PRINT_MODEL.blackLift,DEFAULT_PRINT_MODEL.blackLift]); // black -> ink floor
});
test('softProof: share and warning overlay agree on which pixels are out',()=>{
 const f=frame([[255,0,0],[128,128,128]]);
 assert.equal(gamutShare(f.bytes,2,1),0.5);
 const warn=new Uint8Array(gamutWarningImage(f).bytes);
 assert.deepEqual([...warn.slice(0,4)],[...GAMUT_WARN,255]); // red pixel flagged magenta
 assert.equal(warn[7],0); // gray pixel transparent
});
