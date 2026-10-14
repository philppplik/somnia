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
