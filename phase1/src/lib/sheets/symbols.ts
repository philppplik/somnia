/** Insert Symbol: curated groups and validation of untrusted input. The Rust bridge re-validates (blocks, no spacing or direction characters). */
export const SYMBOL_GROUPS={
 currency:['€','£','¥','¢','₹','₽','₩','₺','₪','₫','₿','¤'],
 math:['±','×','÷','≈','≠','≤','≥','∞','√','∑','∏','∫','∂','∆','∈','∩','∪','≡','¬','∴'],
 arrows:['←','→','↑','↓','↔','↕','⇐','⇒','⇑','⇓','⇔','↩','↪','↗','↘'],
 marks:['©','®','™','°','§','¶','†','‡','•','…','‰','№','µ','‹','›','«','»'],
 fractions:['½','⅓','⅔','¼','¾','⅛','¹','²','³','⁰','⁴','⁵'],
 greek:['α','β','γ','δ','ε','θ','λ','μ','π','σ','φ','ω','Δ','Σ','Ω'],
 shapes:['✓','✗','★','☆','●','○','■','□','▲','▼','◆','◇','♠','♥','♦','♣','☀','☂','♪'],
} as const;
export type SymbolGroup=keyof typeof SYMBOL_GROUPS;
/** Same blocks as the bridge: Latin-1 signs, Greek, and U+2010 to U+2BFF, never spacing, zero-width or direction-changing characters. */
export function isSymbol(input:unknown):input is string{
 if(typeof input!=='string'||[...input].length!==1)return false;
 const u=input.codePointAt(0)!;
 const inBlock=(u>=0xA1&&u<=0xFF)||(u>=0x370&&u<=0x3FF)||(u>=0x2010&&u<=0x2BFF);
 const hidden=u===0xAD||(u>=0x2028&&u<=0x202F)||(u>=0x205F&&u<=0x206F)||(u>=0x200B&&u<=0x200F);
 return inBlock&&!hidden;
}
export function parseSymbolCommand(input:unknown):{char:string}{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Symbol must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>k!=='char'))throw Error('Unknown symbol field.');
 if(!isSymbol(o.char))throw Error('Choose one symbol from the list.');return {char:o.char};
}
export const symbolCode=(c:string)=>'U+'+c.codePointAt(0)!.toString(16).toUpperCase().padStart(4,'0');
