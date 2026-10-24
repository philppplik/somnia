import test from 'node:test';
import assert from 'node:assert/strict';
import {createInterfaceDocument,addNode,deleteNode,reparentNode,serializeInterfaceDocument,parseInterfaceDocument,MAX_DEPTH} from './model';
test('same-version round trip preserves safe unknown fields and stable nested layer ids',()=>{
 const d=createInterfaceDocument();d['vendor.example']={notes:['draft'],enabled:true};const page=d.pages[0];const frame=addNode(d,page.id,'frame');const group=addNode(d,page.id,'group',frame);const text=addNode(d,page.id,'text',group);d.nodes.find(n=>n.id===text)!.text='<script>not executable</script>';
 assert.deepEqual(parseInterfaceDocument(serializeInterfaceDocument(d)),d);
});
test('reject incompatible schema, invalid refs, duplicate ids, cyclic and orphan trees',()=>{
 const d=createInterfaceDocument();const id=addNode(d,d.pages[0].id,'frame');
 for(const change of [
  (x:any)=>{x.version=2;},(x:any)=>{x.nodes[0].parentId='missing';},(x:any)=>{x.pages[0].children.push(id);},
  (x:any)=>{x.nodes[0].children.push(id);},(x:any)=>{x.pages[0].children=[];},(x:any)=>{x.nodes[0].id=x.pages[0].id;},
  (x:any)=>{x.nodes[0].fill='url(https://example.invalid)';},(x:any)=>{x.nodes[0].width=0;},(x:any)=>{x.nodes[0].x=1e50;},
 ]){const copy=structuredClone(d);change(copy);assert.throws(()=>parseInterfaceDocument(JSON.stringify(copy)));}
 assert.throws(()=>parseInterfaceDocument('{'));
});
test('bounded depth, page count, UTF-8 payload and node count fail closed',()=>{
 const d=createInterfaceDocument();let parent:string|null=null;for(let i=0;i<=MAX_DEPTH;i++)parent=addNode(d,d.pages[0].id,'group',parent);
 assert.throws(()=>serializeInterfaceDocument(d));
 assert.throws(()=>parseInterfaceDocument(JSON.stringify({...createInterfaceDocument(),name:'x',padding:'é'.repeat(2_500_000)})));
 const large=createInterfaceDocument();for(let i=0;i<2001;i++)addNode(large,large.pages[0].id,'rectangle');assert.throws(()=>serializeInterfaceDocument(large));
});
test('reparent converts coordinates and keeps ordering; delete removes whole subtree',()=>{
 const d=createInterfaceDocument(),page=d.pages[0];const a=addNode(d,page.id,'frame'),b=addNode(d,page.id,'frame'),c=addNode(d,page.id,'text',a);
 d.nodes.find(n=>n.id===a)!.x=100;d.nodes.find(n=>n.id===b)!.x=300;d.nodes.find(n=>n.id===c)!.x=20;
 reparentNode(d,c,b,0);assert.equal(d.nodes.find(n=>n.id===c)!.x,-180);assert.deepEqual(d.nodes.find(n=>n.id===a)!.children,[]);assert.deepEqual(d.nodes.find(n=>n.id===b)!.children,[c]);
 reparentNode(d,b,null,0);assert.deepEqual(page.children,[b,a]);assert.doesNotThrow(()=>serializeInterfaceDocument(d));deleteNode(d,b);assert.deepEqual(d.nodes.map(n=>n.id),[a]);
});
test('leaf parents and locked layers cannot be edited by structural operations',()=>{
 const d=createInterfaceDocument(),page=d.pages[0];const leaf=addNode(d,page.id,'rectangle');assert.throws(()=>addNode(d,page.id,'text',leaf));d.nodes[0].locked=true;deleteNode(d,leaf);assert.equal(d.nodes.length,1);assert.throws(()=>reparentNode(d,leaf,null,0));
});
