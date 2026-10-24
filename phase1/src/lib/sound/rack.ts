/** Versioned, bounded insert chains. Processor IDs are resolved by the pinned WASM registry. */
export const DSP_REVISION='c51e5d5ec52f11c6264b72e26661fa712feb5345';
export interface RackSlot{id:string;pluginId:string;enabled:boolean;params:Record<string,number>}
export interface EffectRack{version:1;dspRevision:string;bypass:boolean;slots:RackSlot[]}
export const emptyRack=():EffectRack=>({version:1,dspRevision:DSP_REVISION,bypass:false,slots:[]});
export function validateRack(value:unknown):EffectRack{
 const fail=():never=>{throw Error('Invalid Sound effects rack');};
 if(!value||typeof value!=='object'||Array.isArray(value))return fail();const r=value as EffectRack;
 if(Object.keys(r).sort().join(',')!=='bypass,dspRevision,slots,version'||r.version!==1||r.dspRevision!==DSP_REVISION||typeof r.bypass!=='boolean'||!Array.isArray(r.slots)||r.slots.length>8)return fail();
 const ids=new Set<string>();const slots=r.slots.map(slot=>{if(!slot||typeof slot!=='object'||Object.keys(slot).sort().join(',')!=='enabled,id,params,pluginId'||typeof slot.id!=='string'||!slot.id||slot.id.length>100||ids.has(slot.id)||typeof slot.pluginId!=='string'||!/^[a-z0-9_]{1,80}$/.test(slot.pluginId)||typeof slot.enabled!=='boolean'||!slot.params||typeof slot.params!=='object'||Array.isArray(slot.params)||Object.keys(slot.params).length>32)return fail();ids.add(slot.id);const params:Record<string,number>={};for(const [key,value] of Object.entries(slot.params)){if(!/^[a-zA-Z0-9_]{1,80}$/.test(key)||!Number.isFinite(value)||Math.abs(value)>1_000_000)return fail();params[key]=value;}return{id:slot.id,pluginId:slot.pluginId,enabled:slot.enabled,params};});
 return{version:1,dspRevision:DSP_REVISION,bypass:r.bypass,slots};
}
export interface RackPreset{version:1;name:string;rack:EffectRack}
export function parseRackPreset(text:string):RackPreset{if(text.length>32000)throw Error('Rack preset too large');const p=JSON.parse(text);if(!p||Object.keys(p).sort().join(',')!=='name,rack,version'||p.version!==1||typeof p.name!=='string'||!p.name.trim()||p.name.length>100)throw Error('Invalid rack preset');return{version:1,name:p.name,rack:validateRack(p.rack)};}
