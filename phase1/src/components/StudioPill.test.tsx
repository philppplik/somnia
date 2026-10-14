import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
import {studioShortName} from './studios/studioShortName';
import {listStudios} from '../lib/studios';

const names={code:'Code',documents:'Docs',sheets:'Sheets',slides:'Slides',sound:'Sound',photos:'Photos',video:'Video',design:'Design',vector:'Vector',vibespace:'Vibe Space',animation:'Animation'};
test('all eleven registered studios have consistent short tab and tooltip names',()=>{
 assert.deepEqual(listStudios().map(s=>s.id).sort(),Object.keys(names).sort());
 for(const [id,name] of Object.entries(names))assert.equal(studioShortName(id,`Somnia ${id}`),name);
});
test('new studios use their translated label instead of an empty or internal ID tooltip',()=>{
 assert.equal(studioShortName('new','Somnia Animation'),'Animation');
 assert.equal(studioShortName('new','Animation'),'Animation');
});

/** Parse the shell without importing desktop/engine hosts or requiring WASM. */
function jsxElements(source:string,name:string){
 const jsxName=(n:any):string=>n.type==='JSXMemberExpression'?`${jsxName(n.object)}.${jsxName(n.property)}`:n.name;
 const ast=parse(source,{sourceType:'module',plugins:['typescript','jsx']});
 const hits:{node:any;parent:any;ancestors:any[]}[]=[];
 function visit(node:any,parent:any,ancestors:any[]){
  if(!node||typeof node!=='object')return;
  if(node.type==='JSXElement'&&jsxName(node.openingElement.name)===name)hits.push({node,parent,ancestors});
  for(const [key,value] of Object.entries(node)){
   if(key==='loc'||key==='tokens'||key==='comments')continue;
   if(Array.isArray(value))for(const child of value)visit(child,node,[...ancestors,node]);
   else if(value&&typeof value==='object')visit(value,node,[...ancestors,node]);
  }
 }
 visit(ast,null,[]);return hits;
}
test('the global header mounts its studio pill unconditionally, even during raster editing',()=>{
 const source=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
 const [pill,...extra]=jsxElements(source,'StudioPill');
 assert.ok(pill);assert.equal(extra.length,0);
 assert.equal(pill.parent.type,'JSXElement');
 assert.equal(pill.parent.openingElement.name.name,'header');
 assert.ok(!pill.ancestors.some(n=>n.type==='ConditionalExpression'||n.type==='LogicalExpression'));
});
test('the active tab renders the same short name as its tooltip',()=>{
 const source=readFileSync(new URL('./studios/StudioPill.tsx',import.meta.url),'utf8');
 const active=jsxElements(source,'span').find(({parent})=>parent.type==='LogicalExpression'&&parent.left.name==='active');
 assert.ok(active);
 assert.equal(active.node.children.find((n:any)=>n.type==='JSXExpressionContainer').expression.name,'shortName');
 const [tooltip]=jsxElements(source,'Tooltip.Popup');
 assert.ok(tooltip);
 assert.equal(tooltip.node.children.find((n:any)=>n.type==='JSXExpressionContainer').expression.name,'shortName');
});
