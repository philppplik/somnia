import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyVignette,applyDefringe} from './lensCorrect';
function frameOf(w:number,h:number,paint:(x:number,y:number)=>[number,number,number]){
 const b=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const[r,g,bl]=paint(x,y);const i=(y*w+x)*4;b[i]=r;b[i+1]=g;b[i+2]=bl;b[i+3]=255;}
 return{bytes:b.buffer as ArrayBuffer,width:w,height:h};
}
const px=(f:{bytes:ArrayBuffer;width:number},x:number,y:number)=>{const b=new Uint8Array(f.bytes);const i=(y*f.width+x)*4;return[b[i],b[i+1],b[i+2]];};
test('neutral vignette and defringe return the same frame',()=>{
 const f=frameOf(8,8,()=>[100,100,100]);
 assert.equal(applyVignette(f,0,50),f);
 assert.equal(applyDefringe(f,0),f);
});
test('vignette brightens corners, darkens with negative, midpoint holds the center flat',()=>{
 const f=frameOf(21,21,()=>[128,128,128]);
 const up=applyVignette(f,100,50);
 assert.ok(px(up,0,0)[0]>200,`corner +1 stop: ${px(up,0,0)[0]}`);
 assert.equal(px(up,10,10)[0],128); // center inside the flat zone
 const down=applyVignette(f,-100,50);
 assert.ok(px(down,0,0)[0]<70,`corner about -1 stop: ${px(down,0,0)[0]}`);
 const wide=applyVignette(f,100,90);
 assert.ok(px(wide,0,0)[0]>200,`corner full at midpoint 90: ${px(wide,0,0)[0]}`);
 assert.equal(px(wide,10,10)[0],128,'center stays flat at midpoint 90');
 assert.ok(px(wide,0,0)[0]>px(wide,0,10)[0],'falloff concentrated at the corner');
 const orig=new Uint8Array(f.bytes);assert.equal(orig[0],128); // input not mutated
});
test('vignette falloff is elliptical on wide frames (corner > edge midpoint)',()=>{
 const f=frameOf(41,21,()=>[100,100,100]);
 const out=applyVignette(f,80,20);
 assert.ok(px(out,0,0)[0]>px(out,0,10)[0],`corner ${px(out,0,0)[0]} vs edge ${px(out,0,10)[0]}`);
});
test('defringe desaturates purple only at edges, leaves flat purple and non-fringe edges alone',()=>{
 // left half white, right half black; a purple fringe column on the boundary; a flat purple block far from the edge
 const f=frameOf(16,8,(x,y)=>{
  if(x>=2&&x<=5&&y>=5)return[180,0,180]; // flat purple block, no edge inside
  if(x===8)return[200,0,200];            // fringe column at the contrast edge
  return x<8?[240,240,240]:[10,10,10];
 });
 const out=applyDefringe(f,100);
 const fr=px(out,8,2); // fringe pixel at the edge
 assert.ok(fr[1]>40,`fringe green channel lifted toward luma: ${fr}`);
 const flat=px(out,3,6);
 assert.deepEqual(flat,[180,0,180],'flat purple untouched');
 const edge=px(out,7,2); // white edge pixel (not fringe hue)
 assert.deepEqual(edge,[240,240,240],'non-fringe edge untouched');
 const half=applyDefringe(f,50);
 const frH=px(half,8,2);
 assert.ok(frH[1]<fr[1]&&frH[1]>0,'strength scales the mix');
});
