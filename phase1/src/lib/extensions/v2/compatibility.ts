import {satisfies,valid} from 'semver';
import type {ManifestV2} from '../manifestV2';
import {ExtensionError,SDK_VERSION,PROTOCOL_VERSION} from '../contracts/v2/api';
export interface HostCapabilities {somniaVersion:string;apiVersion:string;protocolVersions:readonly number[];runtimes:readonly ('js'|'wasm')[];development?:boolean;proposalOptIn?:ReadonlySet<string>;proposals?:Readonly<Record<string,number>>}
export function negotiateVersion(manifest:ManifestV2,host:HostCapabilities):{apiVersion:string;protocolVersion:1} {
 if(!valid(host.somniaVersion)||!valid(host.apiVersion)||!satisfies(host.somniaVersion,manifest.engines.somnia,{includePrerelease:true})||!satisfies(host.apiVersion,manifest.engines.api)||!satisfies(host.apiVersion,'>=2.0.0 <3.0.0')||!host.protocolVersions.includes(PROTOCOL_VERSION))throw new ExtensionError('E_INCOMPATIBLE_API','Extension requires a different app, SDK or transport version.');
 if(manifest.runtime.type!=='declarative'&&!host.runtimes.includes(manifest.runtime.type))throw new ExtensionError('E_INCOMPATIBLE_API','This isolated extension runtime is not available on this target.');
 for(const proposal of manifest.proposedApis??[])if(!host.development||!host.proposalOptIn?.has(manifest.id)||host.proposals?.[proposal.id]!==proposal.revision)throw new ExtensionError('E_INCOMPATIBLE_API','Experimental API revision is not available or approved.');
 return {apiVersion:host.apiVersion,protocolVersion:PROTOCOL_VERSION};
}
export const browserHostCapabilities=(somniaVersion:string):HostCapabilities=>({somniaVersion,apiVersion:SDK_VERSION,protocolVersions:[1],runtimes:['wasm']});
