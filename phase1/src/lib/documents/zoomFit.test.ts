import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitZoom,MAX_ZOOM,MIN_ZOOM} from './zoomFit';
test('fit width fills the box width and fit page fits both ways',()=>{
 assert.equal(fitZoom('width',{width:1000,height:300},{width:794,height:1123}),1.19);
 assert.equal(fitZoom('page',{width:1000,height:700},{width:794,height:1123}),0.58);
 assert.equal(fitZoom('page',{width:1000,height:1400},{width:794,height:1123}),1.19);
});
test('the zoom stays inside the limits and bad sizes give null',()=>{
 assert.equal(fitZoom('width',{width:5000,height:900},{width:400,height:500}),MAX_ZOOM);
 assert.equal(fitZoom('width',{width:200,height:900},{width:794,height:1123}),MIN_ZOOM);
 for(const [b,p] of [[{width:0,height:5},{width:1,height:1}],[{width:5,height:5},{width:0,height:1}],[{width:NaN,height:5},{width:1,height:1}],[{width:5,height:5},{width:Infinity,height:1}]] as const)assert.equal(fitZoom('width',b,p),null);
 assert.equal(fitZoom('width',{width:48,height:48},{width:100,height:100}),MIN_ZOOM,'no room clamps to the minimum');
});
import {pngScale,pngName,MAX_PNG_SIDE} from './saveCopy';
test('pngScale keeps the longest side inside the renderer limit',()=>{
 assert.equal(pngScale(794,1123),2);
 const s=pngScale(816,1344)!;assert.ok(s<=2&&1344*s<=MAX_PNG_SIDE&&s>1.7,String(s));
 assert.equal(pngScale(5000,5000),0.48);
 for(const [w,h] of [[0,10],[10,-1],[NaN,10],[10,Infinity]])assert.equal(pngScale(w,h),null);
});
test('pngName makes a safe file name',()=>{
 assert.equal(pngName('C:\\docs\\Report.docx',3),'Report-page-3.png');
 assert.equal(pngName('a<b>:c.docx',1),'abc-page-1.png');
 assert.equal(pngName('<<>>.docx',2),'document-page-2.png');
 assert.ok(pngName('x'.repeat(300)+'.docx',1).length<=115);
});
