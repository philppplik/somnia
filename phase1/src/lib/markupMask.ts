/**
 * Text-based checks (alt, headings, references, contrast) must only see real markup.
 * `maskNonMarkup` blanks HTML comments and the bodies of <script> and <style> with spaces, keeping every newline and the total length,
 * so offsets, lines and columns computed on the masked text are valid for the original text.
 */
const blank=(s:string)=>s.replace(/[^\r\n]/g,' ');
export function maskNonMarkup(text:string):string{
 return text.replace(/<!--[\s\S]*?(?:-->|$)/g,blank).replace(/(<(script|style)\b(?:[^>"']|"[^"]*"|'[^']*')*>)([\s\S]*?)(?=<\/\2\s*>|$)/gi,(_m,open:string,_t,body:string)=>open+blank(body));}
/** Source of a regex matching one start tag, including attribute values that contain ">". */
export const tagSource=(name:string)=>`<(${name})\\b(?:[^>"']|"[^"]*"|'[^']*')*>`;
