import {createRoot} from 'react-dom/client';
import {AcpPanel} from '../../src/components/vibespace/AcpPanel';
import {ReviewExtensions} from '../../src/components/vibespace/ReviewExtensions';
import {fixtureRun,createFixtureVibeSpaceTransport} from '../../src/lib/vibespace/fixture';
import {AcpPanelStore} from '../../src/lib/vibespace/acpPanelState';
import {createAcpClient,ACP_CHANNEL} from '../../src/lib/vibespace/acpNative';
import {setLocale} from '../../src/lib/i18n';
import '../../src/components/vibespace/vibespace.css';
setLocale(new URLSearchParams(location.search).get('locale')??'en');
const calls:{cmd:string;args?:Record<string,unknown>}[]=[];
let listener:((e:{payload:unknown})=>void)|undefined;
const sessions=new Map<string,any>();let turnDone:(v:unknown)=>void;
let readFails=false;
const notify=(key:string)=>listener?.({payload:{sessionKey:key,reason:'changed'}});
const pending=(id:string,kind:string)=>({requestId:id,kind,target:kind==='shell'?'/usr/bin/fake-agent':'note.txt',reason:kind==='shell'?'Start an isolated external agent':'Edit the isolated note',offered:['allow_once','deny'],origin:{type:'external_agent',name:'Fixture Agent'}});
const io={listen:async(channel:string,handler:(e:{payload:unknown})=>void)=>{if(channel!==ACP_CHANNEL)throw new Error();listener=handler;return()=>{listener=undefined;};},invoke:async(cmd:string,args?:Record<string,unknown>):Promise<unknown>=>{
 calls.push({cmd,args});const r=args?.request as any;const s=sessions.get(r?.sessionKey);
 switch(cmd){
  case 'vibespace_acp_launch':{const key='acp-'+(sessions.size+1);sessions.set(key,{status:'awaiting_approval',failure:null,name:r.name,runId:key,pending:[pending('launch-'+key,'shell')],events:[],lastSessionId:null});return{sessionKey:key,runId:key};}
  case 'vibespace_acp_state':if(readFails)throw new Error('offline');return structuredClone(s);
  case 'vibespace_acp_session':s.lastSessionId='session-1';s.events.push({kind:'session_ready',data:{resumed:r.resume}});notify(r.sessionKey);return s.lastSessionId;
  case 'vibespace_acp_prompt':s.pending=[pending('edit-'+r.sessionKey,'write')];notify(r.sessionKey);return new Promise(resolve=>{turnDone=resolve;});
  case 'vibespace_acp_decide_consent':{const p=s.pending.find((p:any)=>p.requestId===r.requestId);if(!p)throw new Error('stale');s.pending=[];s.events.push({kind:'permission',data:{kind:p.kind,title:p.target,decision:r.choice==='deny'?'denied':'allowed'}});s.status='ready';notify(r.sessionKey);if(p.kind==='write')turnDone('end_turn');return null;}
  case 'vibespace_acp_cancel':s.status=r.close?'closed':'ready';s.pending=[];notify(r.sessionKey);turnDone?.('cancelled');return null;
 }
 throw new Error('unknown command');
}};
Object.assign(window,{acpFixture:{calls,failReads:()=>{readFails=true;notify('acp-1');},fillEvents:()=>{const s=sessions.get('acp-1');s.events=Array.from({length:500},()=>({kind:'lifecycle',data:{event:'initialized'}}));notify('acp-1');}}});
document.body.style.cssText='font-family:system-ui;margin:24px;background:#f3f4f7;color:#20232b';
createRoot(document.getElementById('root')!).render(<main className="vs-root" style={{height:'auto',maxWidth:1000,margin:'auto'}}>{location.search.includes('dock')?<ReviewExtensions studio={fixtureRun()} transport={createFixtureVibeSpaceTransport('development')} disabled={false} onAction={async()=>true}/>:<AcpPanel store={new AcpPanelStore(createAcpClient(io))} available={!location.search.includes('unavailable')}/> }</main>);
