/** Ways to convert the quotation marks of existing text. */
export const QUOTE_MODES=['smart','straight'] as const;
export type QuoteMode=typeof QUOTE_MODES[number];
const OPENERS=/[\s(\[{<\u2014\u2013\u2018\u201C\u00AB]/;
/** Typographic quotes become plain ' and ". */
export function straightenQuotes(text:string):string{
 return text.replace(/[\u2018\u2019\u201A\u201B\u2032]/g,"'").replace(/[\u201C\u201D\u201E\u201F\u2033]/g,'"');
}
/**
 * Plain ' and " become curly. A quote opens when the character before it is nothing (`prev` is the character in front of the text, or '' at a paragraph start),
 * a space, an opening bracket or a dash; otherwise it closes (an apostrophe inside a word closes, as in don't).
 */
export function smartenQuotes(text:string,prev=''):string{
 let before=prev;let out='';
 for(const c of text){
  if(c==='"')out+=before===''||OPENERS.test(before)?'\u201C':'\u201D';
  else if(c==="'")out+=before===''||OPENERS.test(before)?'\u2018':'\u2019';
  else out+=c;
  before=out.slice(-1);
 }
 return out;
}
export function convertQuotes(text:string,mode:QuoteMode,prev=''):string{
 if(!(QUOTE_MODES as readonly string[]).includes(mode))throw new Error('Unknown quote mode.');
 return mode==='straight'?straightenQuotes(text):smartenQuotes(text,prev);
}
