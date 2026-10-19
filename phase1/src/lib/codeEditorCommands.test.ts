import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EditorState} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {runEditorCommand} from './codeEditorCommands';

// Minimal view: CodeMirror state commands only need state and dispatch.
const fake=(doc:string,anchor:number,head=anchor,readOnly=false)=>{
 const v:{state:EditorState;dispatch:(...a:never[])=>void}={state:EditorState.create({doc,selection:{anchor,head},extensions:[EditorState.allowMultipleSelections.of(true),EditorState.readOnly.of(readOnly)]}),dispatch:((...a:unknown[])=>{v.state=v.state.update(...(a as [never])).state;}) as never};
 return v as unknown as EditorView&{state:EditorState};
};
test('next occurrence adds the next match as a second selection',()=>{
 const v=fake('foo bar foo',0,3);
 assert.equal(runEditorCommand(v,'nextOccurrence'),true);
 assert.deepEqual(v.state.selection.ranges.map(r=>[r.from,r.to]),[[0,3],[8,11]]);
});
test('all occurrences selects every match',()=>{
 const v=fake('a b a b a',0,1);
 assert.equal(runEditorCommand(v,'allOccurrences'),true);
 assert.equal(v.state.selection.ranges.length,3);
});
test('writing commands are refused when the editor is read-only and leave the document alone',()=>{
 const ro=fake('one\ntwo',1,1,true);
 assert.equal(runEditorCommand(ro,'deleteLine'),false);
 assert.equal(runEditorCommand(ro,'toggleComment'),false);
 assert.equal(ro.state.doc.toString(),'one\ntwo');
});
