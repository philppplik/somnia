import {ExtensionSupervisor,type RuntimeFactory} from '../supervisor';
import type {BrokerPolicy,BrokerServices} from '../broker';
import type {ActivationContext} from '../activation';
import type {HostCapabilities} from './compatibility';
import {appStoreServices,type StoreAdapter} from './hostServices';

export interface V2ReadOnlyHost {
 supervisor:ExtensionSupervisor;
 /** Tears down every per-extension service bridge (store listeners, caches). */
 dispose():void;
}

/**
 * Product-side v2 host for the read-only slice: wires the ExtensionSupervisor to real
 * appStore-backed services. Scope limits (slice decision, do not widen here):
 * - Bundled dev fixtures/selftest packages only; no new install or trust path, the
 *   catalog stays closed to worker code, and no local v2 installation is unlocked.
 * - The v2 write path stays locked (hostServices.commit always denies). v1's separate
 *   editor.applyOperations path is untouched by this.
 * A finished product claim additionally needs the real host/event chain plus
 * lifecycle/revocation/disposal verified end-to-end; this module is the testable host.
 */
export function createV2ReadOnlyHost(opts:{
 host:HostCapabilities;
 factory:RuntimeFactory;
 context:()=>ActivationContext;
 policy:(id:string)=>BrokerPolicy;
 store:StoreAdapter;
 storage?:Storage;
 notify?:(text:string)=>void;
 diagnostic?:(id:string,error:Error)=>void;
 timeoutMs?:number;
}):V2ReadOnlyHost {
 const bridges=new Map<string,BrokerServices&{dispose():void}>();
 let supervisor!:ExtensionSupervisor;
 const services=(id:string):BrokerServices=>{
  let bridge=bridges.get(id);
  if(!bridge){
   bridge=appStoreServices({extensionId:id,store:opts.store,storage:opts.storage,notify:opts.notify??(()=>{}),events:{deliver:(callbackId,value,kind)=>supervisor.deliverEvent(id,callbackId,value,kind)}});
   bridges.set(id,bridge);
  }
  return bridge;
 };
 supervisor=new ExtensionSupervisor(opts.host,opts.factory,opts.context,opts.policy,services,opts.diagnostic as never,opts.timeoutMs);
 return {supervisor,dispose():void{supervisor.dispose();for(const b of bridges.values())b.dispose();bridges.clear();}};
}
