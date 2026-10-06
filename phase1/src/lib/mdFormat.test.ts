import {test} from 'node:test';import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {mdTransaction,type MdCommand} from './mdFormat';
const run=(doc:string,cmd:MdCommand,a:number,b=a)=>{const st=EditorState.create({doc,selection:EditorSelection.single(a,b)});const tr=st.update(mdTransaction(st,cmd)!);return {doc:tr.state.doc.toString(),sel:tr.state.selection.main};};
test('bold wraps a selection and unwraps it again',()=>{const r=run('a word b','bold',2,6);assert.equal(r.doc,'a **word** b');assert.equal(run(r.doc,'bold',4,8).doc,'a word b');assert.equal(run('a **word** b','bold',2,10).doc,'a word b');});
test('bold leaves surrounding whitespace and the final newline outside',()=>{assert.equal(run('word\n','bold',0,5).doc,'**word**\n');assert.equal(run(' a ','bold',0,3).doc,' **a** ');});
test('bold with no selection inserts a pair and puts the caret inside',()=>{const r=run('x','bold',1);assert.equal(r.doc,'x****');assert.equal(r.sel.from,3);});
test('italic does not mistake bold for italic',()=>{assert.equal(run('**w**','italic',2,3).doc,'***w***');assert.equal(run('a w b','italic',2,3).doc,'a *w* b');});
test('inline code chooses a delimiter that can contain backticks',()=>{assert.equal(run('a`b','code',0,3).doc,'``a`b``');assert.equal(run('ab','code',0,2).doc,'`ab`');assert.equal(run('`ab`','code',0,4).doc,'ab');});
test('lists, tasks and quotes work on complete lines and toggle off',()=>{
 assert.equal(run('a\nb','bullet',0,3).doc,'- a\n- b');assert.equal(run('- a\n- b','bullet',0,7).doc,'a\nb');
 assert.equal(run('a\nb','task',0,3).doc,'- [ ] a\n- [ ] b');assert.equal(run('- a','task',0).doc,'- [ ] a');assert.equal(run('a','quote',0).doc,'> a');assert.equal(run('a\nb','number',0,3).doc,'1. a\n2. b');});
test('headings replace the marker, not the text',()=>{assert.equal(run('## Title','h1',0).doc,'# Title');assert.equal(run('Title','h3',2).doc,'### Title');assert.equal(run('# Title','h1',0).doc,'Title');});
test('code block and table',()=>{assert.match(run('x','codeblock',0,1).doc,/^```\nx\n```$/);assert.match(run('','table',0).doc,/^\| Column 1 \| Column 2 \|\n\| --- \| --- \|/);});
test('every command is a single transaction',()=>{for(const c of ['bold','italic','code','strike','bullet','task','number','quote','codeblock','table','h2'] as MdCommand[]){const st=EditorState.create({doc:'a\nb',selection:EditorSelection.single(0,3)});assert.ok(mdTransaction(st,c));}});
