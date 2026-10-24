/** Ways to change the letter case of selected text. */
export const CASE_MODES=['upper','lower','title','sentence','toggle'] as const;
export type CaseMode=typeof CASE_MODES[number];
const LETTER=/\p{L}/u;
const isLetter=(c:string)=>LETTER.test(c);
const up=(c:string)=>c.toUpperCase();
const low=(c:string)=>c.toLowerCase();
/**
 * `text` in the given case. `startsSentence` says whether the text begins a sentence (used by "sentence"); words are runs of letters, digits and apostrophes.
 * Pure and bounded by the caller; never changes anything but letters.
 */
export function applyCase(text:string,mode:CaseMode,startsSentence=true):string{
 if(!(CASE_MODES as readonly string[]).includes(mode))throw new Error('Unknown case.');
 if(mode==='upper')return text.toUpperCase();
 if(mode==='lower')return text.toLowerCase();
 const chars=Array.from(text);
 if(mode==='toggle')return chars.map(c=>c===up(c)?low(c):up(c)).join('');
 if(mode==='title'){
  let inWord=false;
  return chars.map(c=>{const w=isLetter(c)||/[\p{N}'\u2019]/u.test(c);const out=w&&!inWord&&isLetter(c)?up(c):w&&inWord?low(c):c;if(w)inWord=true;else inWord=false;return out;}).join('');
 }
 // sentence: everything lower, then the first letter of each sentence up
 let start=startsSentence;
 return chars.map(c=>{
  if(isLetter(c)){const o=start?up(c):low(c);start=false;return o;}
  if(/[.!?\u2026]/.test(c))start=true;
  return c;
 }).join('');
}
/** The start..end (UTF-16) of the word around `i` in `t`, or null when `i` touches no word. */
export function wordAround(t:string,i:number):{start:number;end:number}|null{
 const w=(c:string|undefined)=>!!c&&/[\p{L}\p{N}'\u2019]/u.test(c);
 let a=i,b=i;while(a>0&&w(t[a-1]))a--;while(b<t.length&&w(t[b]))b++;
 return a===b?null:{start:a,end:b};
}
