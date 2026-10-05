/** Collaboration is off unless switched on. Dev switch: localStorage 'somnia.collab' = '1' (reload), or window.__SOMNIA_COLLAB__ = true. */
export function collabEnabled():boolean{
 try{if((globalThis as {__SOMNIA_COLLAB__?:boolean}).__SOMNIA_COLLAB__===true)return true;return globalThis.localStorage?.getItem('somnia.collab')==='1';}catch{return false;}
}
