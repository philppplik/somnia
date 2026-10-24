/** Consent-gate presentation for Policy v2 (Welle-B A4): shell/network requests show their
 * sandbox level, and platforms without process execution say so visibly. Fail-closed is the
 * product contract: nothing here ever downgrades an unavailable gate to a quieter label. */

export type GateKind='shell'|'network';
export type GateLevel='strong'|'poc'|'elevated'|'unavailable';
export type GatePlatform='linux'|'windows'|'macos'|'other';

/** Mirrors vibespace-policy ProcessSupport. Native code supplies it; the UI never invents it. */
export type ProcessSupportDescriptor=
 |{kind:'sandboxed'}
 |{kind:'elevated'}
 |{kind:'unavailable';reason:string};

export interface ConsentGate{
 kind:GateKind;
 level:GateLevel;
 /** i18n key for the sandbox-level line. */
 levelKey:string;
 /** i18n key for an extra platform note (for example macOS unavailability), or null. */
 noteKey:string|null;
}

/** Default per platform, matching vibespace-policy::proc::platform_support. */
export function defaultProcessSupport(platform:GatePlatform):ProcessSupportDescriptor{
 if(platform==='linux'||platform==='windows')return{kind:'sandboxed'};
 if(platform==='macos')return{kind:'unavailable',reason:'process execution is not available on macOS in this alpha'};
 return{kind:'unavailable',reason:'process execution is not supported on this platform'};
}

/** Best-effort platform probe for the desktop shell; tests inject explicit values. */
export function detectGatePlatform():GatePlatform{
 const p=(typeof navigator!=='undefined'?navigator.platform||navigator.userAgent||'':'').toLowerCase();
 if(p.includes('linux'))return'linux';
 if(p.includes('win'))return'windows';
 if(p.includes('mac'))return'macos';
 return'other';
}

const GATE_KINDS:readonly string[]=['shell','network'];

/**
 * Presentation for one consent request. `kind` comes from the native consent payload
 * (Policy v2); requests without a kind (file consents) get no gate line.
 * Windows sandbox support is a PoC until its CI spawn tests pass, so it is labelled `poc`.
 */
export function describeConsentGate(kind:string|undefined|null,platform:GatePlatform,support:ProcessSupportDescriptor):ConsentGate|null{
 if(!kind||!GATE_KINDS.includes(kind))return null;
 const gateKind=kind as GateKind;
 if(support.kind==='unavailable'){
  return{kind:gateKind,level:'unavailable',levelKey:'vibespace.consent.gate.unavailable',noteKey:platform==='macos'?'vibespace.consent.gate.unavailable.macos':null};
 }
 if(support.kind==='elevated'){
  return{kind:gateKind,level:'elevated',levelKey:'vibespace.consent.gate.elevated',noteKey:null};
 }
 if(kind==='network'){
  // The tool network goes through the broker-owned domain proxy on every platform.
  return{kind:gateKind,level:platform==='windows'?'poc':'strong',levelKey:platform==='windows'?'vibespace.consent.gate.poc':'vibespace.consent.gate.proxy',noteKey:null};
 }
 return{kind:gateKind,level:platform==='windows'?'poc':'strong',levelKey:platform==='windows'?'vibespace.consent.gate.poc':'vibespace.consent.gate.strong',noteKey:null};
}
