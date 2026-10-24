/** Strict human 1-based ready-source chunk target. No clamping/coercion. */
export function localReaderJump(input:string,total:number){if(typeof input!=='string'||!Number.isSafeInteger(total)||total<1||total>256||!/^[1-9]\d{0,2}$/.test(input.trim()))return null;const n=Number(input.trim());return n<=total?n-1:null;}
