/** Ways to convert the quotation marks of existing text. */
export const QUOTE_MODES=['smart','straight','de','fr'] as const;
export type QuoteMode=typeof QUOTE_MODES[number];
const OPENERS=/[\s(\[{<\u2014\u2013\u2018\u201C\u00AB\u201E\u201A\u2039]/;
/** Typographic quotes become plain ' and ". */
export function straightenQuotes(text:string):string{
 return text.replace(/[\u2018\u2019\u201A\u201B\u2032\u2039\u203A]/g,"'").replace(/[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/g,'"');
}
/**
 * Plain ' and " become curly. A quote opens when the character before it is nothing (`prev` is the character in front of the text, or '' at a paragraph start),
 * a space, an opening bracket or a dash; otherwise it closes (an apostrophe inside a word closes, as in don't).
 */
export function smartenQuotes(text:string,prev='',style:'en'|'de'|'fr'='en'):string{
 let before=prev;let out='';
 const S={en:['\u201C','\u201D','\u2018','\u2019'],de:['\u201E','\u201C','\u201A','\u2018'],fr:['\u00AB','\u00BB','\u2039','\u203A']}[style];
 for(const c of text){
  const open=before===''||OPENERS.test(before);
  if(c==='"')out+=open?S[0]:S[1];
  else if(c==="'")out+=open?S[2]:(style==='fr'?'\u2019':S[3]);
  else out+=c;
  before=out.slice(-1);
 }
 return out;
}
export function convertQuotes(text:string,mode:QuoteMode,prev=''):string{
 if(!(QUOTE_MODES as readonly string[]).includes(mode))throw new Error('Unknown quote mode.');
 if(mode==='straight')return straightenQuotes(text);
 return smartenQuotes(straightenQuotes(text),prev,mode==='smart'?'en':mode);
}
