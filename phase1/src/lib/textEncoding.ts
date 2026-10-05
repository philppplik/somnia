/** Text decoding for project files. Files are written as UTF-8. Reading must never replace bytes with U+FFFD silently: that destroys umlauts on the next save. */
export interface Decoded{text:string;encoding:'utf-8'|'utf-16le'|'utf-16be'|'windows-1252';bom:boolean;legacy:boolean}
export function decodeBytes(input:ArrayBuffer|Uint8Array):Decoded{
 const b=input instanceof Uint8Array?input:new Uint8Array(input);
 if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)return{text:new TextDecoder('utf-8').decode(b.subarray(3)),encoding:'utf-8',bom:true,legacy:false};
 if(b[0]===0xff&&b[1]===0xfe)return{text:new TextDecoder('utf-16le').decode(b.subarray(2)),encoding:'utf-16le',bom:true,legacy:true};
 if(b[0]===0xfe&&b[1]===0xff)return{text:new TextDecoder('utf-16be').decode(b.subarray(2)),encoding:'utf-16be',bom:true,legacy:true};
 try{return{text:new TextDecoder('utf-8',{fatal:true}).decode(b),encoding:'utf-8',bom:false,legacy:false};}
 catch{return{text:new TextDecoder('windows-1252').decode(b),encoding:'windows-1252',bom:false,legacy:true};}
}
const META_CHARSET=/<meta\b[^>]*\bcharset\s*=\s*["']?\s*([\w:.-]+)[^>]*>/i;
const META_HTTP=/<meta\b[^>]*http-equiv\s*=\s*["']?content-type["']?[^>]*>/i;
/** Makes an HTML document declare UTF-8. Adds the tag when missing (browsers then guess windows-1252 for local files) and rewrites a different declared charset. Non-HTML text passes through. */
export function ensureUtf8Charset(html:string):string{
 if(!/<html\b|<head\b|<!doctype/i.test(html))return html;
 const m=META_CHARSET.exec(html);
 if(m)return /^utf-?8$/i.test(m[1])?html:html.replace(META_CHARSET,'<meta charset="UTF-8">');
 const h=META_HTTP.exec(html);
 if(h)return html.replace(META_HTTP,'<meta charset="UTF-8">');
 const head=/<head\b[^>]*>/i.exec(html);
 if(head){const i=head.index+head[0].length;return `${html.slice(0,i)}\n  <meta charset="UTF-8">${html.slice(i)}`;}
 const root=/<html\b[^>]*>/i.exec(html);
 if(root){const i=root.index+root[0].length;return `${html.slice(0,i)}<head><meta charset="UTF-8"></head>${html.slice(i)}`;}
 const dt=/<!doctype[^>]*>/i.exec(html);
 if(dt){const i=dt.index+dt[0].length;return `${html.slice(0,i)}\n<meta charset="UTF-8">${html.slice(i)}`;}
 return html;
}
/** Decode a file's bytes. A legacy (non-UTF-8) HTML file gets its charset declaration switched to UTF-8 because it will be saved as UTF-8. */
export function decodeFileBytes(name:string,bytes:ArrayBuffer|Uint8Array):Decoded{
 const d=decodeBytes(bytes);
 return d.legacy&&/\.html?$/i.test(name)?{...d,text:ensureUtf8Charset(d.text)}:d;
}
