/**
 * Transport abstraction for collab (v11/collab-protocol). One binary, bidirectional channel to a peer:
 * either the host's app (LAN-Direct mode, the host process runs the relay) or a self-hosted relay
 * (relay mode, the user runs the relay binary/Docker themselves and pastes its URL). Same frames either way -
 * the client does not care which mode an invite link points at.
 */
export interface TransportHandlers{
 onOpen():void;
 onMessage(bytes:Uint8Array):void;
 /** code/reason from the WebSocket close handshake; 1006 when the connection dropped without one. */
 onClose(code:number,reason:string):void;
}
export interface Transport{
 /** Start connecting. Handlers are called at most once each, in order (open -> message* -> close). */
 connect(handlers:TransportHandlers):void;
 /** Queue one frame. Only valid while open. */
 send(bytes:Uint8Array):void;
 /** Intentional close; onClose still fires. */
 close(code?:number,reason?:string):void;
}
export type TransportFactory=(url:string)=>Transport;

/**
 * Real transport: the platform WebSocket (browser webview, Node >= 22). Used for ws:// and wss:// alike.
 * Limit, by platform: a webview cannot pin a self-signed certificate and cannot see the HTTP status of a
 * refused upgrade (bad code / session full all surface as a bare close). notes/collab-protocol.md says
 * what the UI may claim because of this.
 */
export class WebSocketTransport implements Transport{
 constructor(private url:string){}
 private ws:WebSocket|null=null;
 connect(h:TransportHandlers){
  // Browsers refuse WebSocket URLs that contain a fragment; '#key=...' is the E2E key and must never be sent anyway.
  const ws=this.ws=new WebSocket(this.url.split('#')[0]);ws.binaryType='arraybuffer';
  // Exactly one onClose, always: browsers fire close after error, but Node's undici WebSocket
  // never fires close for a refused upgrade (401/404/503) - without this the caller hangs.
  let closed=false;
  const closeOnce=(code:number,reason:string)=>{if(closed)return;closed=true;if(this.ws===ws)this.ws=null;h.onClose(code,reason);};
  ws.onopen=()=>{if(this.ws===ws)h.onOpen();};
  ws.onmessage=ev=>{if(this.ws===ws&&ev.data instanceof ArrayBuffer)h.onMessage(new Uint8Array(ev.data));};
  ws.onclose=ev=>closeOnce(ev.code,ev.reason||'');
  ws.onerror=()=>closeOnce(1006,''); // a web client is allowed no detail; 1006 = abnormal, no close frame
 }
 send(bytes:Uint8Array){if(this.ws&&this.ws.readyState===1)this.ws.send(bytes as BufferSource);}
 close(code=1000,reason=''){this.ws?.close(code,reason);}
}
export const webSocketTransport:TransportFactory=url=>new WebSocketTransport(url);
