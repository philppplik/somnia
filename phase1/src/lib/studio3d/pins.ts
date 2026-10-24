/**
 * Annotation pins: small markers with a label, kept in the node's userData so they travel with the scene
 * (glTF stores userData as node extras, and .som3d documents round-trip them), like primitive parameters.
 * Pure data and validation, no three.js, so it runs under tsx --test.
 */
export const MAX_PIN_TEXT=280;
export class PinError extends Error{constructor(message:string){super(message);this.name='PinError';}}
/** Reads the pin label from a node's userData, or null when the node is no pin. */
export function readPin(userData:unknown):string|null{
 const v=(userData as {somniaPin?:unknown}|undefined)?.somniaPin;
 if(typeof v!=='object'||v===null)return null;
 const text=(v as {text?:unknown}).text;
 return typeof text==='string'?text:null;
}
/** Validates and normalizes a pin label: control characters become spaces, runs collapse, ends trim. Empty is allowed (a plain marker). */
export function pinText(text:string):string{
 const clean=text.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
 if(clean.length>MAX_PIN_TEXT)throw new PinError(`Pin text is limited to ${MAX_PIN_TEXT} characters.`);
 return clean;
}
/** The userData payload for a pin node. */
export const pinUserData=(text:string):{somniaPin:{text:string}}=>({somniaPin:{text}});
