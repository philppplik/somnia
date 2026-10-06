/**
 * In-memory transport for tests and for the host slice's own tests (v11/collab-protocol).
 * Delivers real Uint8Array frames between two ends with the same async ordering a WebSocket has
 * (open, then messages, then exactly one close). No fakes: both ends speak the real wire format.
 */
import type {Transport,TransportFactory,TransportHandlers} from './transport';

class MemoryEnd implements Transport{
 peer:MemoryEnd|null=null;private h:TransportHandlers|null=null;private closed=false;
 connect(h:TransportHandlers){this.h=h;queueMicrotask(()=>{if(!this.closed)h.onOpen();});}
 send(bytes:Uint8Array){if(this.closed||!this.peer||this.peer.closed)return;
  const copy=new Uint8Array(bytes);queueMicrotask(()=>{if(!this.peer!.closed)this.peer!.h?.onMessage(copy);});}
 close(code=1000,reason=''){if(this.closed)return;this.closed=true;
  queueMicrotask(()=>{this.h?.onClose(code,reason);this.peer?.drop(code,reason);});}
 /** connection lost without a handshake close (network drop), default code 1006 */
 drop(code=1006,reason=''){if(this.closed)return;this.closed=true;
  queueMicrotask(()=>this.h?.onClose(code,reason));}
}
export interface MemoryServerEnd{transport:Transport;/** simulate a network drop towards this client (1006) */drop():void;close(code?:number,reason?:string):void;}
export interface MemoryServer{
 readonly connections:MemoryServerEnd[];
 onConnection(cb:(end:MemoryServerEnd)=>void):void;
 closeAll(code?:number,reason?:string):void;
}
/** A listen socket plus the factory clients use to reach it. The `url` argument is accepted and ignored. */
export function memoryServer():{server:MemoryServer;factory:TransportFactory}{
 const listeners:((e:MemoryServerEnd)=>void)[]=[];const connections:MemoryServerEnd[]=[];
 const factory:TransportFactory=()=>{
  const client=new MemoryEnd();const srv=new MemoryEnd();
  client.peer=srv;srv.peer=client;
  const handle:MemoryServerEnd={transport:srv,drop:()=>{srv.drop();client.drop();},close:(c=1000,r='')=>srv.close(c,r)};
  connections.push(handle);
  const realConnect=client.connect.bind(client);
  client.connect=h=>{realConnect(h);queueMicrotask(()=>listeners.forEach(l=>l(handle)));};
  return client;};
 return {server:{connections,onConnection:cb=>listeners.push(cb),closeAll:(c=1001,r='server closed')=>connections.forEach(e=>e.close(c,r))},factory};
}
