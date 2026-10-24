import test from 'node:test';
import assert from 'node:assert/strict';
import {codeOutline,filterOutline,fileFacts,interactionAttributes,safeAttribute} from './model';
import type {EditorNode} from '../editorPort';
const node=(id:string,from:number,attrs:Record<string,string>={},children:EditorNode[]=[],locked=false):EditorNode=>({id,from,to:99,contentFrom:from,contentTo:99,tag:'a',attrs,children,locked,hidden:false});
test('outline retains engine IDs, nested depth, source position and inherited locks',()=>{
 const rows=codeOutline([node('parent',0,{id:'hero'},[node('child',3,{class:'cta primary'})],true)],'a\nb\nc');
 assert.deepEqual(rows.map(n=>[n.id,n.depth,n.line,n.col,n.locked]),[['parent',0,1,1,true],['child',1,2,2,true]]);
 assert.equal(filterOutline(rows,'PRIMARY')[0].id,'child');assert.equal(filterOutline(rows,'missing').length,0);
});
test('interaction inventory includes links, forms, a11y and inline events but not ordinary style',()=>{
 assert.deepEqual(interactionAttributes(node('x',0,{href:'/local',onclick:'alert(1)',class:'x',style:'color:red','aria-label':'Go',controls:''})).map(([key])=>key),['href','onclick','aria-label','controls']);
});
test('safe attribute writes reject executable URLs, event handlers and editor-owned markers',()=>{
 for(const [name,value] of [['href',' javascript:alert(1)'],['href','java\nscript:alert(1)'],['href','data:text/html,hello'],['src','vbscript:test'],['onclick','x'],['style','x'],['data-editor-node','x'],['bad key','x']])assert.equal(safeAttribute(name,value),false);
 for(const [name,value] of [['href','#section'],['href','https://example.org'],['target','_blank'],['aria-label','Go'],['controls','']])assert.equal(safeAttribute(name,value),true);
});
test('file facts count unicode byte size separately from UTF-16 characters',()=>{assert.deepEqual(fileFacts('é\na'),{lines:2,characters:3,bytes:4});});
