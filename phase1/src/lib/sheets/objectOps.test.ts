import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseObjectCommand,decodePicture,bytesToBase64,parseObjects,shapeSvg,wrapShapeText,buildObjectOp,OBJECT_ACTIONS,OBJECT_GROUPS,pictureDataUrl} from './objectOps';
const PNG=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0x0d,0x49,0x48,0x44,0x52,0,0,0,2,0,0,0,1,8,6]);
test('object commands accept closed shapes only',()=>{
 assert.deepEqual(parseObjectCommand({kind:'shape',shape:'textBox',fill:'yellow',line:'black',text:'Hi\nthere',width:120,height:40}),{kind:'shape',shape:'textBox',fill:'yellow',line:'black',width:120,height:40,text:'Hi\nthere'});
 assert.deepEqual(parseObjectCommand({kind:'shape',shape:'line',height:0}),{kind:'shape',shape:'line',height:0});
 assert.deepEqual(parseObjectCommand({kind:'move',object:'image',id:3,here:true}),{kind:'move',object:'image',id:3,here:true});
 assert.deepEqual(parseObjectCommand({kind:'delete',object:'shape',id:4}),{kind:'delete',object:'shape',id:4});
 assert.deepEqual(parseObjectCommand({kind:'place',object:'image',id:3,row:4,col:5,dx:1.5,dy:0,width:50}),{kind:'place',object:'image',id:3,row:4,col:5,dx:1.5,dy:0,width:50});
 assert.deepEqual(parseObjectCommand({kind:'order',object:'shape',id:3,to:'front'}),{kind:'order',object:'shape',id:3,to:'front'});
 assert.deepEqual(parseObjectCommand({kind:'turn',id:3}),{kind:'turn',id:3});
 for(const bad of [{kind:'place',object:'image',id:3,row:-1,col:0,dx:0,dy:0},{kind:'place',object:'image',id:3,row:2000000,col:0,dx:0,dy:0},{kind:'place',object:'image',id:3,row:0,col:0,dx:-1,dy:0},{kind:'place',object:'image',id:3,row:0,col:0,dx:0},{kind:'place',object:'image',id:3,row:0,col:0,dx:0,dy:0,width:0},{kind:'order',object:'image',id:3,to:'up'},{kind:'turn',id:3,object:'shape'},{kind:'turn',id:'x'},null,[],{},{kind:'x'},{kind:'shape',shape:'star'},{kind:'shape',shape:'rectangle',fill:'#ff0000'},{kind:'shape',shape:'rectangle',line:'yellow'},{kind:'shape',shape:'rectangle',text:'x'},{kind:'shape',shape:'rectangle',height:0},{kind:'shape',shape:'textBox',width:5},{kind:'shape',shape:'textBox',width:4001},{kind:'shape',shape:'textBox',text:'x'.repeat(201)},{kind:'shape',shape:'textBox',text:'a\u0007'},{kind:'shape',shape:'textBox',extra:1},
  {kind:'move',object:'chart',id:1,here:true},{kind:'move',object:'image',id:-1,here:true},{kind:'move',object:'image',id:1.5,here:true},{kind:'move',object:'image',id:1},{kind:'move',object:'image',id:1,here:'y'},{kind:'delete',object:'image'}])assert.throws(()=>parseObjectCommand(bad),JSON.stringify(bad));
});
test('pictures are decoded only when they are bounded PNG or JPEG',()=>{
 const ok=decodePicture({base64:bytesToBase64(PNG),alt:'dot',width:64});assert.equal(ok.alt,'dot');assert.equal(ok.width,64);assert.deepEqual([...ok.bytes],[...PNG]);
 assert.equal(decodePicture({base64:bytesToBase64(Uint8Array.from([0xff,0xd8,0xff,0xe0,1,2,3,4]))}).width,0);
 for(const bad of [null,{},{base64:''},{base64:'***='},{base64:bytesToBase64(Uint8Array.from([1,2,3,4,5,6]))},{base64:bytesToBase64(PNG),alt:'a\nb'},{base64:bytesToBase64(PNG),width:5},{base64:bytesToBase64(PNG),width:2001},{base64:bytesToBase64(PNG),extra:1},{base64:'A'.repeat(14_000_000)},{base64:'AAA'}])assert.throws(()=>decodePicture(bad));
});
test('bridge replies are parsed defensively and shapes draw safely',()=>{
 const info=parseObjects({images:[{id:1,row:2,col:3,dx:0,dy:0,width:64,height:32,mime:'image/png',alt:'a',bytes:99},null],shapes:[{id:2,kind:'Rectangle',row:0,col:0,dx:0,dy:0,width:100,height:50,fill:'#F2C94C',line:'url(x)',text:'<b>'}]});
 assert.equal(info.images.length,1);assert.equal(info.shapes[0].line,null);assert.deepEqual(parseObjects(null),{images:[],shapes:[]});
 const svg=shapeSvg({...info.shapes[0],kind:'TextBox',text:'<script>alert(1)</script> & more'})!;assert.ok(svg.includes('&lt;script&gt;')&&!svg.includes('<script'));assert.ok(!svg.includes('NaN'));
 for(const k of ['Rectangle','RoundedRectangle','Ellipse','Triangle','Line','Arrow','TextBox'])assert.ok(shapeSvg({...info.shapes[0],kind:k,height:k==='Line'?0:50}),k);
 assert.equal(shapeSvg({...info.shapes[0],kind:'Ink'}),null);
 assert.ok(wrapShapeText('x'.repeat(500),60).length<=40);assert.deepEqual(wrapShapeText('aa bb cc',5,1),['aa bb','cc']);
 assert.equal(pictureDataUrl('text/html','AAAA'),null);assert.equal(pictureDataUrl('image/png','AA"AA'),null);assert.equal(pictureDataUrl('image/png','AAAA'),'data:image/png;base64,AAAA');
});
test('the panel builds ops from complete fields',()=>{
 const f={fill:'blue',line:'',text:'',width:'',height:'',pick:'image:3'};
 for(const a of OBJECT_ACTIONS.filter(x=>x!=='picture'&&x!=='turn'))assert.ok(buildObjectOp(a,a==='resize'?{...f,width:'90'}:f),a);
 assert.equal(buildObjectOp('turn',f),null,'only shapes turn');assert.deepEqual(buildObjectOp('turn',{...f,pick:'shape:7'}),{kind:'turn',id:7});assert.deepEqual(buildObjectOp('back',{...f,pick:'shape:7'}),{kind:'order',object:'shape',id:7,to:'back'});
 assert.equal(buildObjectOp('resize',f),null);assert.equal(buildObjectOp('delete',{...f,pick:''}),null);assert.equal(buildObjectOp('delete',{...f,pick:'chart:3'}),null);assert.equal(buildObjectOp('rectangle',{...f,width:'2'}),null);
 assert.equal(OBJECT_GROUPS.flatMap(g=>g[1]).length,OBJECT_ACTIONS.length);
});
