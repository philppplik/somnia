/**
 * Maps an extension-contributed command id to a strict dispatcher id (dotted, alphanumeric
 * segments). Manifest ids may contain dashes and the part after the extension id is free text,
 * so every other character is escaped as `Z` + 4 hex digits. `Z` itself is escaped too, which
 * makes the mapping injective: two different source ids never share a dispatcher id.
 */
export function extensionCommandId(sourceId:string):string{
 let out='';
 for(const ch of sourceId){
  if(/^[a-yA-Y0-9]$/.test(ch)||ch==='.')out+=ch;
  else out+='Z'+ch.charCodeAt(0).toString(16).padStart(4,'0');
 }
 // Empty segments ("a..b", trailing dot) are not valid dotted ids: escape those dots.
 out=out.split('.').map(seg=>seg===''?'Z002e':seg).join('.');
 return `ext.${out}`;
}
