/** Human 1-based slide number. No silent clamping/rounding. */
export function slideJumpIndex(input:string,total:number){if(!/^[1-9]\d{0,5}$/.test(input.trim())||!Number.isSafeInteger(total)||total<1)return null;const n=Number(input.trim());return n<=total?n-1:null;}
export function validateSlideJump(source:string,input:string,current:{source:string;busy:boolean;summary:{slides:number}|null}){const index=slideJumpIndex(input,current.summary?.slides??0);if(!source||source!==current.source||current.busy||index===null)throw Error('Slide target unavailable');return index;}
