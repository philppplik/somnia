import {test} from 'node:test';
import assert from 'node:assert/strict';
import {restoreNativeDialogs} from './nativeDialogs';

test('restoreNativeDialogs removes the plugin overrides so the prototype dialogs surface again',()=>{
 const nativeConfirm=()=>true;
 const proto={confirm:nativeConfirm,alert:()=>{}};
 const win=Object.create(proto) as Window;
 // Simulate tauri-plugin-dialog's init script: own async properties shadow the native ones.
 (win as {confirm?:unknown}).confirm=async()=>true;
 (win as {alert?:unknown}).alert=()=>{};
 assert.notEqual(win.confirm,nativeConfirm);
 restoreNativeDialogs(win);
 assert.equal(win.confirm,nativeConfirm);
});
