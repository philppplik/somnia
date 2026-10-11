/** Extension panel documents. Native builds serve each panel as its own document at somnia-ext://panel/<ext-id>/<panel-id> (Rust side, header CSP below), so the embedder CSP never applies to the panel's inline bridge. Web builds and tests fall back to srcdoc with the same document and a meta CSP. The frame is sandboxed with allow-scripts only (never allow-same-origin).
 Authority model: the host never trusts the frame's WindowProxy (it survives navigation). The bridge sends a one-time hello carrying the session token (passed in the URL fragment or inlined into the srcdoc); the host answers once with a MessagePort. All API calls travel over that port. A navigated document has no port and no token, so it has no authority. See panelSession.ts. */
export const PANEL_SCHEME='somnia-ext';
/** Same string the Rust side sends as the Content-Security-Policy response header. The panel cannot be made network-proof by CSP alone: navigation of the frame itself is refused by the embedder frame-src plus the host load guard. */
export const PANEL_CSP="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";
/** Ids are manifest-validated, but encode anyway so a path can never gain segments. */
export function panelUrl(extId:string,panelId:string,token:string):string{
 return `${PANEL_SCHEME}://panel/${encodeURIComponent(extId)}/${encodeURIComponent(panelId)}#${encodeURIComponent(token)}`;
}
/** Is this URL one of our panel documents (any fragment)? Used by tests and the host guard. */
export function isPanelUrl(u:string):boolean{return /^somnia-ext:\/\/panel\/[^/?#]+\/[^/?#]+(#.*)?$/.test(u);}
/** Bridge source. Runs first in the document; window.somnia API is unchanged. Reads the token from the fragment (then clears it) or from the inlined value. */
export function bridgeScript(inlineToken:string|null):string{
 const tok=inlineToken===null?`decodeURIComponent(location.hash.slice(1))`:JSON.stringify(inlineToken);
 return `<script>(()=>{const tok=${tok};try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}let n=0,port=null;const p=new Map(),q=[];const send=m=>{port?port.postMessage(m):q.push(m)};addEventListener('message',e=>{const m=e.data||{};if(m.type!=='somnia.port'||port||!e.ports[0]||e.source!==parent)return;port=e.ports[0];port.onmessage=ev=>{const m=ev.data||{};if(m.type!=='api.result')return;const r=p.get(m.requestId);if(!r)return;p.delete(m.requestId);m.ok?r.res(m.value):r.rej(new Error(m.error));};q.splice(0).forEach(x=>port.postMessage(x));});parent.postMessage({type:'somnia.hello',token:tok},'*');const call=(method,args)=>new Promise((res,rej)=>{const id=++n;p.set(id,{res,rej});send({type:'api.call',requestId:id,method,args});});window.somnia=Object.freeze({project:Object.freeze({listFiles:()=>call('project.listFiles',[]),readFile:f=>call('project.readFile',[f])}),selection:Object.freeze({get:()=>call('selection.get',[])}),storage:Object.freeze({get:k=>call('storage.get',[k]),set:(k,v)=>call('storage.set',[k,v])}),ui:Object.freeze({notify:t=>call('ui.notify',[t])})});})();<\/script>`;
}
/** Theme the host hands to a panel. The frame is an isolated document, so it cannot inherit the app tokens; without this it keeps the light default and Chromium paints an opaque white canvas when the app is dark. */
export interface PanelTheme{scheme:'light'|'dark';text:string;secondary:string;accent:string;border:string}
const COLOR=/^(#[0-9a-fA-F]{3,8}|rgba?\([0-9 ,.%]+\))$/;
const safe=(v:string,f:string)=>COLOR.test(v.trim())?v.trim():f;
export const LIGHT_PANEL_THEME:PanelTheme={scheme:'light',text:'#18181b',secondary:'#52525a',accent:'#4f46e5',border:'#e1e1e7'};
export const DARK_PANEL_THEME:PanelTheme={scheme:'dark',text:'#fafafa',secondary:'#aaaab4',accent:'#818cf8',border:'#29292f'};
/** Read the active app theme from the root element. Falls back to the light/dark defaults. */
export function currentPanelTheme(root:{getAttribute(n:string):string|null}&Partial<{style:unknown}>=document.documentElement):PanelTheme{
 const base=root.getAttribute('data-theme')==='light'?LIGHT_PANEL_THEME:DARK_PANEL_THEME;
 const cs=typeof getComputedStyle==='function'&&root instanceof Element?getComputedStyle(root):null;
 const v=(n:string,f:string)=>cs?safe(cs.getPropertyValue(n),f):f;
 return{scheme:base.scheme,text:v('--text-primary',base.text),secondary:v('--text-secondary',base.secondary),accent:v('--accent',base.accent),border:v('--border-subtle',base.border)};
}
const baseStyle=(t:PanelTheme)=>`<meta name="color-scheme" content="${t.scheme}"><style>:root{color-scheme:${t.scheme};--text-primary:${t.text};--text-secondary:${t.secondary};--accent:${t.accent};--border-subtle:${t.border}}html,body{background:transparent}body{margin:0;padding:12px;font:13px system-ui,sans-serif;color:${t.text}}</style>`;
/** Full document for a panel. Native: the Rust scheme handler serves this (inlineToken null, token comes from the URL fragment) with PANEL_CSP as a header. Fallback: used as srcdoc with the token inlined and the CSP as a meta tag. */
export function panelDocument(html:string,inlineToken:string|null=null,theme:PanelTheme=LIGHT_PANEL_THEME):string{
 const meta=inlineToken===null?'':`<meta http-equiv="Content-Security-Policy" content="${PANEL_CSP}">`;
 return `<!doctype html><html><head><meta charset="utf-8">${meta}${baseStyle(theme)}${bridgeScript(inlineToken)}</head><body>${html}</body></html>`;
}
/** srcdoc fallback (web builds, tests, native before the scheme handler is available). */
export function panelSrcdoc(html:string,token:string,theme:PanelTheme=LIGHT_PANEL_THEME):string{return panelDocument(html,token,theme);}
