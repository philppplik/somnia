import type {ProtectOp,ProtectionInfo} from './protocol';
/** Sheet protection and cell locking: validation of untrusted command input. The Rust bridge re-validates.
 *  The password is only passed through; it is never stored, logged or echoed back. Protection is a convenience, not security. */
export const PROTECT_ALLOW=['formatCells','formatColumns','formatRows','insertColumns','insertRows','deleteColumns','deleteRows','sort','autofilter'] as const;
export const MAX_PASSWORD_CHARS=64;
export const passwordBad=(v:unknown)=>typeof v!=='string'||[...v].length>MAX_PASSWORD_CHARS||/[\u0000-\u001f\u007f]/.test(v);
export function parseProtectCommand(input:unknown):ProtectOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Protection must be an object.');
 const o=input as Record<string,unknown>,only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown protection field.');};
 switch(o.kind){
  case 'protect':{only('kind','password','allow');const out:ProtectOp={kind:'protect'};
   if(o.password!==undefined){if(passwordBad(o.password))throw Error('The password is too long or has control characters.');if(o.password!=='')out.password=o.password as string;}
   if(o.allow!==undefined){if(!Array.isArray(o.allow)||o.allow.length>PROTECT_ALLOW.length||o.allow.some(a=>!(PROTECT_ALLOW as readonly unknown[]).includes(a)))throw Error('Unknown permission.');out.allow=[...new Set(o.allow as typeof PROTECT_ALLOW[number][])];}
   return out;}
  case 'unprotect':{only('kind','password');if(o.password!==undefined&&passwordBad(o.password))throw Error('The password is too long or has control characters.');return o.password===undefined?{kind:'unprotect'}:{kind:'unprotect',password:o.password as string};}
  case 'lock':only('kind','locked');if(typeof o.locked!=='boolean')throw Error('`locked` must be true or false.');return {kind:'lock',locked:o.locked};
  case 'workbook':only('kind','on');if(typeof o.on!=='boolean')throw Error('`on` must be true or false.');return {kind:'workbook',on:o.on};
  default:throw Error('Unsupported protection operation.');
 }
}
/** Presets of what people may still do on a protected sheet, as the bridge's permission names. */
export const ALLOW_PRESETS:Record<string,readonly typeof PROTECT_ALLOW[number][]>={none:[],format:['formatCells','formatColumns','formatRows'],sortFilter:['sort','autofilter'],rows:['insertRows','deleteRows'],layout:['formatCells','formatColumns','formatRows','insertRows','insertColumns','deleteRows','deleteColumns'],all:PROTECT_ALLOW};
export function parseProtection(raw:unknown):ProtectionInfo|null{
 const r=raw as Record<string,unknown>|null;if(!r||typeof r!=='object')return null;
 return {password:r.password===true,allow:Array.isArray(r.allow)?r.allow.filter((a):a is typeof PROTECT_ALLOW[number]=>(PROTECT_ALLOW as readonly unknown[]).includes(a)):[]};
}
