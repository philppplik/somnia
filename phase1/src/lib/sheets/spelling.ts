import type {RangeCell} from './protocol';
/** Spelling for text cells, in the app: a Hunspell word list (SCOWL, American English, shipped under public/dict) is expanded once into a lowercase set.
 * Words are compared case-insensitively, so a misspelled proper noun is not flagged and "teh" is. Formulas and non-text cells are never read. */
export const MAX_SPELL_ISSUES=300,MAX_USER_WORDS=2000,MAX_WORD_CHARS=40;
interface AffRule{strip:string;add:string;test:RegExp}
interface AffGroup{kind:'PFX'|'SFX';cross:boolean;rules:AffRule[]}
/** PFX/SFX groups of a single-character-flag affix file. Everything else in the file is ignored. */
export function parseAff(text:string):{groups:Map<string,AffGroup>;onlyInCompound:string|null}{
 const groups=new Map<string,AffGroup>();let onlyInCompound:string|null=null;
 for(const raw of text.split(/\r?\n/)){
  const line=raw.replace(/#.*$/,'').trim();if(line==='')continue;const p=line.split(/\s+/);
  if(p[0]==='ONLYINCOMPOUND'&&p[1])onlyInCompound=p[1];
  if(p[0]!=='PFX'&&p[0]!=='SFX')continue;
  if(p.length===4&&(p[2]==='Y'||p[2]==='N')&&/^\d+$/.test(p[3])){groups.set(p[1],{kind:p[0],cross:p[2]==='Y',rules:[]});continue;}
  const g=groups.get(p[1]);if(!g||p.length<5)continue;
  const strip=p[2]==='0'?'':p[2],add=(p[3]==='0'?'':p[3]).split('/')[0],cond=p[4];
  let test:RegExp;try{test=new RegExp(g.kind==='PFX'?'^'+cond:cond+'$','u');}catch{continue;}
  g.rules.push({strip,add,test});
 }
 return {groups,onlyInCompound};
}
/** Every word the dictionary lines allow, lowercased. Entries that only exist inside compounds (the "1th" family) and digits are left out. */
export function expandDic(dic:string,aff:string):Set<string>{
 const {groups,onlyInCompound}=parseAff(aff),out=new Set<string>();
 const lines=dic.split(/\r?\n/);
 for(let n=1;n<lines.length;n++){
  const entry=lines[n].trim().split(/\s+/)[0];if(!entry)continue;
  const [word0,flags='']=entry.split('/');const word=word0.replace(/’/g,"'");
  if(word===''||/[0-9]/.test(word)||(onlyInCompound&&flags.includes(onlyInCompound)))continue;
  const forms=new Set<string>([word]),sfx:string[]=[];
  for(const f of flags){const g=groups.get(f);if(!g)continue;
   for(const r of g.rules){
    if(g.kind==='SFX'){if(r.test.test(word)&&word.endsWith(r.strip)){const w=word.slice(0,word.length-r.strip.length)+r.add;forms.add(w);sfx.push(w+'\u0000'+(g.cross?'1':'0'));}}
    else if(r.test.test(word)&&word.startsWith(r.strip))forms.add(r.add+word.slice(r.strip.length));
   }}
  // Prefix forms of the suffixed words, where both groups allow crossing.
  for(const f of flags){const g=groups.get(f);if(!g||g.kind!=='PFX'||!g.cross)continue;
   for(const s of sfx){const [w,c]=s.split('\u0000');if(c!=='1')continue;for(const r of g.rules)if(r.test.test(w)&&w.startsWith(r.strip))forms.add(r.add+w.slice(r.strip.length));}}
  for(const w of forms)out.add(w.toLowerCase());
 }
 return out;
}
let loaded:Promise<Set<string>>|null=null;
/** Loads and expands the shipped dictionary once; a failed load is retried on the next call. */
export function loadDictionary(fetchText:(path:string)=>Promise<string>):Promise<Set<string>>{
 if(!loaded)loaded=Promise.all([fetchText('/dict/en-US.dic'),fetchText('/dict/en-US.aff')]).then(([d,a])=>{const s=expandDic(d,a);if(s.size<1000)throw Error('The dictionary is empty.');return s;}).catch(e=>{loaded=null;throw e;});
 return loaded;
}
export const resetDictionaryForTests=()=>{loaded=null;};
const WORD=/[\p{L}][\p{L}'’]*/gu;
const trimApos=(w:string)=>w.replace(/^['’]+|['’]+$/g,'');
/** The words of a text that are worth checking: skips short words, all-capital words, camelCase, non-ASCII words, and anything inside an address or link. */
export function wordsToCheck(text:string):string[]{
 if(/@|:\/\/|www\./i.test(text))return [];
 const out:string[]=[];
 for(const m of text.matchAll(WORD)){
  const w=trimApos(m[0]);if(w.length<2||w.length>MAX_WORD_CHARS)continue;
  const before=text[(m.index??0)-1],after=text[(m.index??0)+m[0].length];
  if((before!==undefined&&/[0-9_]/.test(before))||(after!==undefined&&/[0-9_]/.test(after)))continue;
  if(!/^[A-Za-z'’]+$/.test(w)||w===w.toUpperCase()||/[a-z][A-Z]/.test(w))continue;
  out.push(w);
 }
 return out;
}
export function isKnown(word:string,dict:ReadonlySet<string>,user:ReadonlySet<string>):boolean{
 const l=word.replace(/’/g,"'").toLowerCase();
 if(dict.has(l)||user.has(l))return true;
 if(l.endsWith("'s")){const b=l.slice(0,-2);return dict.has(b)||user.has(b);}
 return false;
}
const LETTERS="abcdefghijklmnopqrstuvwxyz'";
/** Every word one edit away, each with the lowest cost of the edit that makes it: a swap of two letters 0, a missing or extra letter 1, a wrong letter 2. */
function edits1(w:string):Map<string,number>{
 const out=new Map<string,number>(),put=(c:string,cost:number)=>{if(c!==w&&(out.get(c)??9)>cost)out.set(c,cost);};
 for(let i=0;i<=w.length;i++){
  if(i<w.length){put(w.slice(0,i)+w.slice(i+1),1);if(i+1<w.length)put(w.slice(0,i)+w[i+1]+w[i]+w.slice(i+2),0);for(const c of LETTERS)put(w.slice(0,i)+c+w.slice(i+1),2);}
  for(const c of LETTERS)put(w.slice(0,i)+c+w.slice(i),1);
 }
 return out;
}
/** Up to 6 dictionary words one edit away (two edits when none is, for words up to 10 letters), in the capitalisation of the original. A change of the first letter ranks last. */
export function suggest(word:string,dict:ReadonlySet<string>):string[]{
 const l=word.replace(/’/g,"'").toLowerCase();const scored=new Map<string,number>();
 for(const [c,cost] of edits1(l))if(dict.has(c))scored.set(c,cost+(c[0]===l[0]?0:3));
 if(scored.size===0&&l.length<=10)for(const a of edits1(l).keys())for(const b of edits1(a).keys())if(b!==l&&dict.has(b))scored.set(b,10);
 const found=[...scored.entries()].sort((x,y)=>x[1]-y[1]||Math.abs(x[0].length-l.length)-Math.abs(y[0].length-l.length)||x[0].localeCompare(y[0])).map(e=>e[0]);
 const cap=/^[A-Z]/.test(word);
 return found.slice(0,6).map(s=>cap?s[0].toUpperCase()+s.slice(1):s);
}
export interface SpellIssue{cell:string;word:string}
export interface SpellReport{issues:SpellIssue[];total:number;scanned:number}
/** Misspelled words in the text constants of cells. Formulas, numbers and empty cells are skipped; one entry per word and cell. */
export function checkCells(cells:readonly RangeCell[],dict:ReadonlySet<string>,user:ReadonlySet<string>,ignore:ReadonlySet<string>):SpellReport{
 const issues:SpellIssue[]=[];let total=0,scanned=0;
 for(const c of cells){
  if(c.formula!==null||c.value.t!=='Text')continue;scanned++;const seen=new Set<string>();
  for(const w of wordsToCheck(c.value.v)){
   const key=w.toLowerCase();if(seen.has(w)||ignore.has(key)||isKnown(w,dict,user))continue;seen.add(w);total++;
   if(issues.length<MAX_SPELL_ISSUES)issues.push({cell:c.address,word:w});
  }
 }
 return {issues,total,scanned};
}
/** Replaces every whole-word occurrence of `word` (same capitalisation) in a text, or null when it is not there. */
export function replaceWholeWord(text:string,word:string,to:string):string|null{
 let out='',last=0,hit=false;
 for(const m of text.matchAll(WORD)){
  const idx=m.index??0,w=trimApos(m[0]),start=idx+m[0].indexOf(w);if(w!==word)continue;
  out+=text.slice(last,start)+to;last=start+w.length;hit=true;
 }
 return hit?out+text.slice(last):null;
}
/** A replacement must be a plain word or short phrase: no control characters, 1 to 64 characters, and not a formula. */
export function replacementProblem(to:string):'empty'|'long'|'chars'|'formula'|null{
 if(to.trim()==='')return 'empty';if([...to].length>64)return 'long';if(/[\u0000-\u001f\u007f]/.test(to))return 'chars';if(/^\s*[=+\-@]/.test(to))return 'formula';return null;
}
export interface SpellChange{cell:string;word:string;to:string}
export function parseSpellChange(input:unknown):SpellChange{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Spelling change must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>!['cell','word','to'].includes(k)))throw Error('Unknown spelling field.');
 if(typeof o.cell!=='string'||!/^[A-Za-z]{1,3}[0-9]{1,7}$/.test(o.cell))throw Error('A single cell is needed.');
 if(typeof o.word!=='string'||o.word===''||o.word.length>MAX_WORD_CHARS)throw Error('A word is needed.');
 if(typeof o.to!=='string'||replacementProblem(o.to))throw Error('The replacement must be 1 to 64 characters, no control characters, and not start with = + - or @.');
 return {cell:o.cell.toUpperCase(),word:o.word,to:o.to.trim()};
}
const USER_KEY='sheets.spelling.userWords';
/** The user's own words (kept on this device, at most 2000, lowercase). */
export function readUserWords(storage:Pick<Storage,'getItem'>|undefined=typeof localStorage==='undefined'?undefined:localStorage):Set<string>{
 try{const v=JSON.parse(storage?.getItem(USER_KEY)??'[]');return new Set(Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'&&x.length>0&&x.length<=MAX_WORD_CHARS).slice(0,MAX_USER_WORDS):[]);}catch{return new Set();}
}
export function addUserWord(word:string,storage:Pick<Storage,'getItem'|'setItem'>|undefined=typeof localStorage==='undefined'?undefined:localStorage):Set<string>{
 const words=readUserWords(storage),l=word.replace(/’/g,"'").toLowerCase();
 if(l.length>0&&l.length<=MAX_WORD_CHARS&&words.size<MAX_USER_WORDS)words.add(l);
 try{storage?.setItem(USER_KEY,JSON.stringify([...words]));}catch{/* storage full or blocked: the word stays for this session only */}
 return words;
}
