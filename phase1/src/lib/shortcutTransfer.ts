/** Bounded JSON interchange. Unknown commands and invalid combinations are rejected, not silently installed. */
export function parseShortcutFile(text:string,known:readonly string[]):Record<string,string>{
 if(text.length>100000)throw Error('Shortcut file exceeds 100 KB.');
 const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected a JSON object of command IDs and shortcuts.');
 const out:Record<string,string>={};const ids=new Set(known);
 for(const [id,shortcut] of Object.entries(value)){if(!ids.has(id))throw Error('Unknown command: '+id);if(typeof shortcut!=='string'||shortcut.length>80)throw Error('Invalid shortcut for '+id);if(shortcut&&!/^(?:(?:Mod|Alt|Shift)\+)*[a-zA-Z0-9`.,;/=\[\]\\-]+$/.test(shortcut))throw Error('Invalid shortcut for '+id);out[id]=shortcut;}
 return out;
}
