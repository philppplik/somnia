import {test} from 'node:test';
import assert from 'node:assert/strict';
import {restoreNativeDialogs} from './nativeDialogs';

// Math.max/Math.min render as "[native code]" via Function.prototype.toString - stand-ins for
// the browser's native confirm/alert, which cannot be faked with an own toString override.
const nativeConfirm=Math.max as unknown as (msg?:string)=>boolean;
const nativeAlert=Math.min as unknown as (msg?:string)=>void;

test('native synchronous dialogs are kept untouched (web build, Playwright CI)',()=>{
 const win={confirm:nativeConfirm,alert:nativeAlert} as unknown as Window;
 restoreNativeDialogs(win);
 assert.equal(win.confirm,nativeConfirm);
 assert.equal(win.alert,nativeAlert);
});

test('script wrapper shadowing a prototype native is deleted so the native dialog surfaces again (WebKitGTK-style)',()=>{
 const proto={confirm:nativeConfirm,alert:nativeAlert};
 const win=Object.create(proto) as Window;
 (win as {confirm?:unknown}).confirm=async()=>true;
 (win as {alert?:unknown}).alert=()=>{};
 assert.notEqual(win.confirm,nativeConfirm);
 restoreNativeDialogs(win);
 assert.equal(win.confirm,nativeConfirm);
});

test('wrapper that overwrote the own slot falls back to fail-closed stubs when no native dialog is recoverable',()=>{
 const win={confirm:async()=>true,alert:()=>{}} as unknown as Window;
 restoreNativeDialogs(win);
 assert.equal(typeof win.confirm,'function');
 assert.equal(win.confirm('x'),false);
 assert.equal(typeof win.alert,'function');
 assert.doesNotThrow(()=>win.alert('x'));
});
