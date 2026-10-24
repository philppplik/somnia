/** Bounded codepoint literal prefix, not a generated summary. Full chunk stays in reader. */
export function localCitationPreview(text:string,max=240){if(typeof text!=='string'||!Number.isSafeInteger(max)||max<1||max>512)throw Error('Invalid citation preview');const points=Array.from(text);return Object.freeze({text:points.slice(0,max).join(''),partial:points.length>max});}
