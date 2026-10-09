/** The engine counts UTF-8 bytes; JavaScript carets count UTF-16 units. Convert at the boundary only. */
export function utf16ToUtf8Offset(text:string,utf16:number):number{
 if(!Number.isInteger(utf16)||utf16<0||utf16>text.length)throw new RangeError('Caret is outside the text.');
 const c=text.charCodeAt(utf16);const prev=utf16>0?text.charCodeAt(utf16-1):0;
 if(utf16>0&&utf16<text.length&&prev>=0xd800&&prev<=0xdbff&&c>=0xdc00&&c<=0xdfff)throw new RangeError('Caret splits a surrogate pair.');
 return new TextEncoder().encode(text.slice(0,utf16)).length;
}
/** Splits the engine's body text into paragraphs (it joins blocks with newlines). */
export const paragraphs=(text:string)=>text.split('\n');
