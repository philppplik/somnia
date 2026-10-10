/**
 * tauri-plugin-dialog injects an init script into every webview that REPLACES window.confirm and
 * window.alert with async IPC wrappers (guest-js/init-iife.js: plain assignment, confirm is an
 * AsyncFunction, alert a plain closure - neither is native code). Every destructive-action guard
 * in this app calls dialogs synchronously (`if(!window.confirm(...))`), and a Promise is always
 * truthy - so Cancel would not stop discard/delete/close, and the denied IPC surfaces as
 * "plugin:dialog|confirm not allowed by ACL".
 *
 * restoreNativeDialogs removes ONLY script wrappers and always leaves a synchronous dialog behind:
 *  - native sync dialog (web build, Playwright CI): kept untouched;
 *  - wrapper shadowing a prototype native (delete surfaces it): deleted;
 *  - wrapper that overwrote the own slot (WebView2-style): deleted, then the pristine native is
 *    recovered from a fresh iframe realm; if no native dialog can be recovered at all, a
 *    fail-closed stub (confirm=false) is installed so destructive guards stay safe.
 * Runs at bootstrap, before any user interaction can reach a guard.
 */
const NATIVE_CODE=/\[native code\]/;
const isNative=(fn:unknown):fn is Function=>typeof fn==='function'&&NATIVE_CODE.test(Function.prototype.toString.call(fn));

function pristineDialog(win:Window,key:'confirm'|'alert'):Function|undefined{
 try{
  const frame=win.document.createElement('iframe');
  frame.style.display='none';
  win.document.documentElement.appendChild(frame);
  const fn=(frame.contentWindow as unknown as Record<string,unknown>|null)?.[key];
  frame.remove();
  return isNative(fn)?fn:undefined;
 }catch{return undefined;}
}

export function restoreNativeDialogs(win:Window=window):void{
 const w=win as unknown as Record<string,unknown>;
 for(const key of ['confirm','alert'] as const){
  const current=w[key];
  if(typeof current!=='function'||isNative(current))continue;
  delete w[key];
  if(typeof w[key]==='function')continue;
  const recovered=pristineDialog(win,key);
  w[key]=recovered??(key==='confirm'?()=>false:()=>{});
 }
}
