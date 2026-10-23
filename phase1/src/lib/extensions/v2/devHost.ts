import {ExtensionError,SDK_VERSION} from '../contracts/v2/api';
import type {ManifestV2} from '../manifestV2';
import {validateManifestV2} from '../manifestV2';
import type {ActivationContext} from '../activation';
import {createV2ReadOnlyHost,type V2ReadOnlyHost} from './host';
import {browserJsFactory} from './browserJsTransport';
import {getState,patchState,subscribe} from '../../../store/appStore';
import {modeFor} from '../../languages';
import {reportError} from '../../log';
import manifestJson from '../contracts/v2/example.json';

/**
 * DEV-gated v2 fixture host (v2 SDK slice 2): runs the bundled acme.word-count
 * fixture through the REAL transport/host/event chain - supervisor, broker,
 * appStore-backed services, module worker, guest SDK - with no new install or
 * trust path. Gate: dev build (import.meta.env.DEV, statically replaced, so release
 * bundles drop this module entirely via the dynamic import in App.tsx) AND the
 * explicit localStorage flag below. Loading stays limited to this bundled fixture;
 * the v2 write path stays locked (hostServices.commit always denies); panels stay
 * excluded. Not a product go for package execution.
 */
export const V2_DEV_FLAG='somnia.extensions.v2dev';
export const V2_DEV_EXTENSION_ID='acme.word-count';

/**
 * sha256('somnia-dev-fixture:acme.word-count@1.0.0'). The fixture ships inside the
 * app bundle, so the bundle itself is the package identity - there is no download to
 * content-verify. Recompute when the fixture id or version changes.
 */
export const V2_DEV_DIGEST='8a5c34dd05b930a511387261113de4542df2b0a48dd1920804f9a3262218527d';

/** The bundled module that plays the role of the fixture's declared package entry. */
const GUEST_URL=new URL('../contracts/v2/exampleGuest.ts',import.meta.url).href;
// The product version is the release string (package.json somniaRelease); __APP_VERSION__ is the package version (0.1.0).
const APP_VERSION=typeof __APP_RELEASE__!=='undefined'?__APP_RELEASE__:'dev';

export interface V2DevHostHandle {host:V2ReadOnlyHost;extensionId:string;dispose():void;}

export function isV2DevHostEnabled():boolean {
 if(!import.meta.env.DEV)return false;
 try{return localStorage.getItem(V2_DEV_FLAG)==='1';}catch{return false;}
}

export async function startV2DevHost():Promise<V2DevHostHandle> {
 if(!isV2DevHostEnabled())throw new ExtensionError('E_PERMISSION_DENIED','The v2 dev fixture host requires the dev gate (dev build + flag).');
 // Static validation runs without the host-version option on purpose: the static
 // engine check is plain semver and rejects prerelease hosts by policy, while the
 // runtime negotiator (negotiateVersion, includePrerelease) owns host compatibility
 // on this beta line and runs again at supervisor.enable().
 const checked=validateManifestV2(manifestJson,{apiVersion:SDK_VERSION,lane:'local'});
 if(!checked.ok)throw new ExtensionError('E_INVALID_ARGUMENT',`Bundled v2 fixture manifest is invalid: ${checked.errors.map(e=>`${e.path} ${e.message}`).join('; ')}`);
 const manifest:ManifestV2=checked.manifest;
 const declaredEntry=manifest.runtime.entry??'';
 const host=createV2ReadOnlyHost({
  host:{somniaVersion:APP_VERSION,apiVersion:SDK_VERSION,protocolVersions:[1],runtimes:['js']},
  factory:browserJsFactory(async(digest,entry,signal)=>{
   if(signal.aborted)throw new ExtensionError('E_CANCELLED','Extension startup cancelled.');
   if(digest!==V2_DEV_DIGEST||entry!==declaredEntry)throw new ExtensionError('E_PERMISSION_DENIED','The v2 dev host loads only its bundled fixture guest.');
   return GUEST_URL;
  }),
  context:():ActivationContext=>{
   const s=getState();
   const paths=Object.keys(s.files);
   return {
    interactive:true,
    studio:s.activeStudio,
    languages:[...new Set(paths.map(p=>modeFor(p)))],
    documentExtensions:[...new Set(paths.map(p=>p.split('.').pop()??''))],
    hasProject:paths.length>0,
    workspaceTrusted:true,
    virtualWorkspace:false,
    projectPaths:paths,
    indexComplete:true,
    hasSelection:!!s.selectedElementId,
    isReadonly:false,
   };
  },
  policy:()=>({enabled:true,trusted:true,virtual:false,permissions:new Set(manifest.permissions)}),
  store:{getState:()=>{const s=getState();return {files:s.files,nodes:s.nodes,designFile:s.designFile,selectedElementId:s.selectedElementId};},subscribe},
  notify:text=>patchState({notice:text}),
  diagnostic:(id,error)=>reportError('extensions.v2dev',error,{level:'warn',message:`v2 dev fixture ${id} faulted`}),
 });
 host.supervisor.install(manifest,V2_DEV_DIGEST);
 await host.supervisor.enable(manifest.id);
 return {host,extensionId:manifest.id,dispose:()=>host.dispose()};
}
