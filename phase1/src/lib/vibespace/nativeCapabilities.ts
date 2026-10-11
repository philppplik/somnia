import type {VibeSpaceTransport,VibeIntent} from './types';
const allowed:readonly VibeIntent['type'][]=['create-space','create-studio','start','stop','steer','consent','review','restore','retry','apply-hunks','request-changes'];
/** Native configuration is not proof of model installation or reachability. */
export function parseNativeCapabilities(raw:unknown):VibeSpaceTransport['capabilities']{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid native capabilities.');
 const value=raw as Record<string,unknown>;
 if(Object.keys(value).some(k=>!['transport','files','actions','pause','resume','catalog'].includes(k))||['transport','files','pause','resume','catalog'].some(k=>typeof value[k]!=='boolean')||value.pause!==false||value.resume!==false||value.catalog!==false||!Array.isArray(value.actions))throw new Error('Invalid native capabilities.');
 const actions=value.actions;
 if(actions.some(a=>!allowed.includes(a))||new Set(actions).size!==actions.length||!value.transport&&actions.some(a=>a==='start'||a==='retry'||a==='request-changes')||!value.files&&actions.some(a=>a==='restore'||a==='apply-hunks'))throw new Error('Inconsistent native capabilities.');
 return actions.slice() as VibeSpaceTransport['capabilities'];
}
