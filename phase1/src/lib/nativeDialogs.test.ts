import {test} from 'node:test';
import assert from 'node:assert/strict';
import {restoreNativeDialogs} from './nativeDialogs';

test('restoreNativeDialogs removes the plugin overrides inside a Tauri webview so the prototype dialogs surface again',()=>{
 const nativeConfirm=()=>true;
 const proto={confirm:nativeConfirm,alert:()=>{}};
 const win=Object.create(proto) as Window;
 (win as {__TAURI_INTERNALS__?:unknown}).__TAURI_INTERNALS__={};
 // Simulate tauri-plugin-dialog's init script: own async properties shadow the native ones.
 (win as {confirm?:unknown}).confirm=async()=>true;
 (win as {alert?:unknown}).alert=()=>{};
 assert.notEqual(win.confirm,nativeConfirm);
 restoreNativeDialogs(win);
 assert.equal(win.confirm,nativeConfirm);
});

test('restoreNativeDialogs keeps native dialogs untouched outside Tauri (web build, Playwright)',()=>{
 const win={confirm:()=>true,alert:()=>{}} as unknown as Window;
 restoreNativeDialogs(win);
 assert.equal(typeof win.confirm,'function');
 assert.equal(typeof win.alert,'function');
});
