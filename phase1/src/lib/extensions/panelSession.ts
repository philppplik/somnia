/** Host side of one panel frame. Authority rules:
 - The frame's WindowProxy proves nothing (it survives navigation), so API calls are only accepted over a MessagePort created for this session.
 - The port is handed out once, only for a hello with the exact session token from the frame's first document.
 - Any load after the first, or dispose, closes the port: the session is dead and cannot be revived. Navigation also destroys the old document's port end. */
export type PanelReply={ok:true;value:unknown}|{ok:false;error:string};
export interface PanelSessionDeps{token:string;handle:(method:string,args:unknown[])=>unknown;onNavigated:()=>void;newChannel?:()=>{port1:MessagePort;port2:MessagePort}}
export class PanelSession{
 private loads=0;private port:MessagePort|null=null;private dead=false;
 constructor(private d:PanelSessionDeps){}
 get alive(){return !this.dead;}
 get bound(){return this.port!==null;}
 /** iframe load event. The first is the panel document; any further one means the frame navigated. */
 onLoad(){if(this.dead)return;this.loads+=1;if(this.loads>1){this.kill();this.d.onNavigated();}}
 /** Window message from the frame. Only a hello from the live frame with the right token, once, before binding. */
 onWindowMessage(source:MessageEventSource|null,frameWindow:Window|null,data:unknown):boolean{
  if(this.dead||this.port||!frameWindow||source!==frameWindow)return false;
  const m=data as {type?:unknown;token?:unknown}|null;
  if(!m||m.type!=='somnia.hello'||m.token!==this.d.token)return false;
  if(this.loads>1)return false;
  const ch=(this.d.newChannel??(()=>new MessageChannel()))();
  this.port=ch.port1;
  ch.port1.onmessage=ev=>this.onCall(ev.data);
  (frameWindow as Window).postMessage({type:'somnia.port'},'*',[ch.port2]);
  return true;
 }
 private onCall(m:unknown){
  const port=this.port;if(this.dead||!port)return;
  const c=m as {type?:unknown;requestId?:unknown;method?:unknown;args?:unknown}|null;
  if(!c||c.type!=='api.call'||typeof c.requestId!=='number')return;
  let r:PanelReply;
  try{r={ok:true,value:this.d.handle(String(c.method),Array.isArray(c.args)?c.args:[])};}
  catch(error){r={ok:false,error:error instanceof Error?error.message:String(error)};}
  port.postMessage({type:'api.result',requestId:c.requestId,...r});
 }
 kill(){this.dead=true;if(this.port){this.port.onmessage=null;this.port.close();this.port=null;}}
 dispose(){this.kill();}
}
