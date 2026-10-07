/** Stand-in for the system browser + loopback listener. Follows the authorize redirect and delivers the callback URL. */
export type BrowserOutcome={status:number;location?:string};
/** Opens the authorize URL like a browser would, without following redirects, so the test sees the callback URL. */
export async function visitAuthorize(authorizeUrl:string):Promise<BrowserOutcome>{
 const r=await fetch(authorizeUrl,{redirect:'manual'});return {status:r.status,location:r.headers.get('location')??undefined};
}
/** Delivers the callback URL to a loopback listener, as the browser's redirect would. Resolves with the HTTP status. */
export async function deliverCallback(callbackUrl:string,init:RequestInit={}):Promise<number>{
 const r=await fetch(callbackUrl,init);await r.arrayBuffer();return r.status;
}
export const parseCallback=(location:string)=>{const u=new URL(location);return {origin:u.origin,path:u.pathname,code:u.searchParams.get('code'),state:u.searchParams.get('state'),error:u.searchParams.get('error')};};
/** Minimal loopback listener used when testing the mock itself and as a fixture for subject tests. */
import http from 'node:http';
import type {AddressInfo} from 'node:net';
export async function listenLoopback(path='/auth/callback'){
 const hits:URL[]=[];let resolve!:(u:URL)=>void;const first=new Promise<URL>(r=>{resolve=r;});
 const server=http.createServer((q,s)=>{const u=new URL(q.url??'/','http://127.0.0.1');if(u.pathname!==path){s.writeHead(404).end();return;}hits.push(u);s.writeHead(200,{'content-type':'text/plain'}).end('You can close this tab.');resolve(u);});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const port=(server.address() as AddressInfo).port;
 return {port,redirectUri:`http://127.0.0.1:${port}${path}`,hits,first,close:()=>new Promise<void>(r=>{server.closeAllConnections();server.close(()=>r());})};
}
