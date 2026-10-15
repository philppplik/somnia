import {textStats} from './find';
export interface DetailedStats{words:number;chars:number;charsNoSpaces:number;sentences:number;paragraphs:number;readingMinutes:number}
export const READING_WPM=200;
/** Counts for the word count dialog. Paragraphs are non-empty lines; a sentence ends at . ! ? or an ellipsis followed by a space or the end; reading time rounds up at 200 words per minute. */
export function detailedStats(text:string):DetailedStats{
 const base=textStats(text);
 const paragraphs=text.split('\n').filter(l=>l.trim()!=='').length;
 const sentences=base.words===0?0:Math.max(1,(text.match(/[.!?\u2026]+(?=\s|$)/g)??[]).length);
 return{...base,sentences,paragraphs,readingMinutes:base.words===0?0:Math.ceil(base.words/READING_WPM)};
}

const WORD=/[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu;
/** Syllables of one English word by counting vowel groups (a trailing silent "e" does not count; at least one). A rough guide, not a dictionary. */
export function syllables(word:string):number{
 const w=word.toLowerCase().replace(/[^a-z]/g,'');if(!w)return 1;
 const n=(w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/,'').replace(/^y/,'').match(/[aeiouy]{1,2}/g)??[]).length;
 return Math.max(1,n);
}
export interface Readability{wordsPerSentence:number;charsPerWord:number;uniqueWords:number;fleschEase:number}
const r1=(n:number)=>Math.round(n*10)/10;
/** Averages and the Flesch reading ease (0 to 100, higher is easier). The Flesch formula and the syllable count are for English text only. Null for text without words. */
export function readability(text:string):Readability|null{
 const words=text.match(WORD)??[];if(words.length===0)return null;
 const st=detailedStats(text);const sentences=Math.max(1,st.sentences);
 const letters=words.reduce((n,w)=>n+Array.from(w.replace(/['\u2019-]/g,'')).length,0);
 const syl=words.reduce((n,w)=>n+syllables(w),0);
 const flesch=206.835-1.015*(words.length/sentences)-84.6*(syl/words.length);
 return{wordsPerSentence:r1(words.length/sentences),charsPerWord:r1(letters/words.length),uniqueWords:new Set(words.map(w=>w.toLowerCase())).size,fleschEase:Math.max(0,Math.min(100,Math.round(flesch)))};
}
