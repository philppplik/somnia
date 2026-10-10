import {validateManifest as validateLegacy} from '../manifest';
import {parseManifestV2,type ManifestV2,type ManifestValidationOptions} from '../manifestV2';
import {callApi,type ApiDeps} from '../api';
import type {ExtensionManifest} from '../types';
import {ExtensionError} from '../contracts/v2/api';
export type ManifestLane={lane:'legacy';manifest:ExtensionManifest}|{lane:'v2';manifest:ManifestV2};
/** v1 is JSON, v2 is somnia-extension.toml. No permissive shape coercion or saved-enable migration. */
export function parseVersionedManifest(source:string,filename:string,options:ManifestValidationOptions={}):ManifestLane {
 if(filename==='somnia-extension.toml'){const result=parseManifestV2(source,options);if(!result.ok)throw new ExtensionError('E_INVALID_ARGUMENT','Invalid v2 manifest.');return {lane:'v2',manifest:result.manifest};}
 if(filename!=='somnia-extension.json')throw new ExtensionError('E_INVALID_ARGUMENT','Unknown manifest filename.');
 let input:unknown;try{input=JSON.parse(source);}catch{throw new ExtensionError('E_INVALID_ARGUMENT','Invalid legacy JSON.');}if(!input||typeof input!=='object'||Object.hasOwn(input,'manifestVersion'))throw new ExtensionError('E_INVALID_ARGUMENT','Legacy parser cannot read a versioned manifest.');const result=validateLegacy(input);if(!result.ok)throw new ExtensionError('E_INVALID_ARGUMENT','Invalid legacy manifest.');return {lane:'legacy',manifest:result.manifest};
}
export function legacyApiAdapter(manifest:ExtensionManifest,deps:ApiDeps,options:{renewedEnablement:boolean;lane:'local'|'developer'|'store'}):(method:string,args:unknown[])=>unknown {
 if(!options.renewedEnablement||options.lane==='store')throw new ExtensionError('E_PERMISSION_DENIED','Legacy execution requires renewed local or developer enablement.');
 return (method,args)=>callApi(manifest,method,args,deps); // Preserve string readFile and v1 write counts; never feed them into a v2 decoder.
}
