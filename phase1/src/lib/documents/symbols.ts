/** Special characters offered by the Insert symbol dialog, grouped. Plain text only. */
export const SYMBOL_GROUPS:readonly{id:'punctuation'|'currency'|'math'|'arrows'|'letters'|'marks';chars:string}[]=[
 {id:'punctuation',chars:'\u2013\u2014\u2018\u2019\u201C\u201D\u201E\u2026\u2022\u00B7\u00A7\u00B6\u2020\u2021\u00AB\u00BB\u2039\u203A\u00A1\u00BF'},
 {id:'currency',chars:'\u20AC\u00A3\u00A5\u00A2\u20B9\u20BD\u20A9\u20BA\u20AB\u0E3F\u20A6\u00A4'},
 {id:'math',chars:'\u00B1\u00D7\u00F7\u2260\u2264\u2265\u2248\u221E\u221A\u2211\u220F\u222B\u2202\u2206\u00B0\u2032\u2033\u00B5\u00B9\u00B2\u00B3\u00BC\u00BD\u00BE\u2030'},
 {id:'arrows',chars:'\u2190\u2191\u2192\u2193\u2194\u21D0\u21D2\u21D4\u2713\u2717\u2605\u2606\u2660\u2665\u2666\u2663'},
 {id:'letters',chars:'\u03B1\u03B2\u03B3\u03B4\u03B5\u03B8\u03BB\u03BC\u03C0\u03C3\u03C6\u03C9\u0394\u03A3\u03A9\u00DF\u00E4\u00F6\u00FC\u00C4\u00D6\u00DC\u00E7\u00F1\u00E9\u00E8\u00EA\u00E0\u00E2\u00F4\u00F5\u00E3\u00F8\u00E5\u00E6\u0153'},
 {id:'marks',chars:'\u00A9\u00AE\u2122\u2116\u2103\u2109'},
];
export const MAX_SYMBOL_CHARS=16;
/** Why the text cannot be inserted as a symbol (empty, too long, control characters or line breaks), or null. */
export function symbolProblem(v:unknown):string|null{
 if(typeof v!=='string'||v==='')return 'Missing or invalid "text".';
 if(Array.from(v).length>MAX_SYMBOL_CHARS)return `A symbol insert is at most ${MAX_SYMBOL_CHARS} characters.`;
 if(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\uFFFC\uFFFD]/.test(v))return 'The text has characters that cannot be inserted.';
 return null;
}
/** The date as ISO (2026-10-14) or in the reader's long format. */
export function dateText(d:Date,form:'iso'|'long',locale?:string):string{
 if(form==='iso'){const p=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
 return new Intl.DateTimeFormat(locale,{dateStyle:'long'}).format(d);
}
