import test from 'node:test';import assert from 'node:assert/strict';
import {lockInfo,nodeLabel} from './canvasLock';import type {EditorNode} from './editorPort';
const n=(id:string,locked=false,children:EditorNode[]=[],tag='div',attrs:Record<string,string>={}):EditorNode=>({id,tag,attrs,children,from:0,to:0,contentFrom:0,contentTo:0,locked,hidden:false});
const tree=[n('a',false,[n('b',true,[n('c',false,[n('d')])]),n('e')])];
test('lock pre-check covers the element and every ancestor',()=>{assert.deepEqual(lockInfo(tree,'e'),{locked:false,inherited:false});const own=lockInfo(tree,'b');assert.equal(own.locked,true);assert.equal(own.inherited,false);const inh=lockInfo(tree,'d');assert.equal(inh.locked,true);assert.equal(inh.inherited,true);assert.equal(inh.by?.id,'b');assert.equal(lockInfo(tree,null).locked,false);});
test('node label is tag.class, ignores generated element classes and truncates',()=>{assert.equal(nodeLabel({tag:'div',attrs:{class:'element-0123456789ab card'}}),'div.card');assert.equal(nodeLabel({tag:'p',attrs:{}}),'p');assert.ok(nodeLabel({tag:'div',attrs:{class:'x'.repeat(60)}}).endsWith('…'));});
