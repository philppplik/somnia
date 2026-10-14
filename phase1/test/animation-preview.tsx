/** Isolated real-component pixel review. Not a Tauri/app E2E or WASM test. */
import {createRoot} from 'react-dom/client';
import {useAnimationState,animationSession} from '../src/lib/animation/session';
import {findComp} from '../src/lib/animation/model';
import {registerAnimationCommands} from '../src/lib/animation/commands';
import {CompositionsPanel,PropertiesSection,RenderSection} from '../src/components/animation/AnimationPanels';
import {AnimationTimeline} from '../src/components/animation/AnimationTimeline';
import {frameSvg} from '../src/lib/animation/exportFrames';
import {prepareAnimationAsset} from '../src/lib/animation/assets';
import {prepareAudioAsset} from '../src/lib/animation/audioImport';
import {setLocale} from '../src/lib/i18n';
import '../src/styles/global.css';
if(!import.meta.env.DEV)throw Error('Development fixture only.');
const params=new URLSearchParams(location.search);document.documentElement.dataset.theme=params.get('theme')??'dark';setLocale(params.get('locale')??'de');
registerAnimationCommands();const session=animationSession();session.createBlank('Motion / Somnia');
session.dispatch({type:'comp.update',settings:{width:800,height:450,name:'Motion / Somnia',background:'#181b25'}});
session.dispatch({type:'layer.add',kind:'shape',id:'shape',over:{name:'Accent / path',source:{color:'#7c5cff',shape:'ellipse',width:130,height:130}}});
session.dispatch([{type:'prop.animate',layer:'shape',prop:'position',on:true,t:0},{type:'prop.set',layer:'shape',prop:'position',value:[100,230],t:0},{type:'prop.set',layer:'shape',prop:'position',value:[580,230],t:720000},{type:'key.spatial',layer:'shape',prop:'position',t:0,sOut:[100,-300]},{type:'key.spatial',layer:'shape',prop:'position',t:720000,sIn:[-100,-300]},{type:'prop.pathMode',layer:'shape',mode:'arcLength'}]);
session.dispatch({type:'layer.effects',layer:'shape',effects:[{id:'blur',kind:'blur',enabled:true,amount:3,color:'#7c5cff'}]});
session.dispatch({type:'layer.add',kind:'text',id:'title',over:{name:'Somnia / title',source:{text:'Create in motion.',size:50,color:'#ffffff'}}});
session.dispatch([{type:'prop.animate',layer:'title',prop:'position',on:true,t:0},{type:'prop.set',layer:'title',prop:'position',value:[120,140],t:0},{type:'prop.set',layer:'title',prop:'position',value:[260,180],t:720000},{type:'key.interp',layer:'title',prop:'position',t:0,interp:'bezier',channel:0,out:[0.75,0]},{type:'key.interp',layer:'title',prop:'position',t:720000,interp:'bezier',channel:0,in:[1,1]}]);
const asset=await prepareAnimationAsset(new File(['<svg width="140" height="80"><rect width="140" height="80" fill="#ffb347"/><ellipse cx="70" cy="40" rx="26" ry="26" fill="#181b25"/></svg>'],'original-logo.svg',{type:'image/svg+xml'}));
session.dispatch({type:'asset.import',asset});const raster=findComp(session.document!)!.layers[0];session.dispatch({type:'prop.set',layer:raster.id,prop:'position',value:[120,320],t:0});
/** Audio mode (?audio=1): a generated 3 s WAV with three tone bursts goes through the real import path. */
function toneWav(){const rate=22050,frames=rate*3,b=new Uint8Array(44+frames*2),v=new DataView(b.buffer);const w=(o:number,t:string)=>[...t].forEach((c,i)=>b[o+i]=c.charCodeAt(0));
 w(0,'RIFF');v.setUint32(4,36+frames*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,frames*2,true);
 for(let i=0;i<frames;i++){const t=i/rate,burst=Math.floor(t),env=Math.exp(-(t-burst)*3)*(0.35+0.2*burst);v.setInt16(44+i*2,Math.round(Math.sin(2*Math.PI*(220+110*burst)*t)*env*32767),true);}return b;}
const audioMode=params.get('audio')==='1';
if(audioMode){const a=await prepareAudioAsset(new File([toneWav()],'voice-over.wav',{type:'audio/wav'}));session.dispatch({type:'audio.import',asset:a,t:120000,id:'audio'});
 session.dispatch([{type:'audio.volume.set',layer:'audio',value:20,t:120000},{type:'audio.volume.animate',layer:'audio',on:true,t:120000},{type:'audio.volume.set',layer:'audio',value:100,t:480000},{type:'audio.volume.set',layer:'audio',value:60,t:1200000}]);
 session.dispatch({type:'audio.update',layer:'audio',trimIn:60000,length:600000});
 session.setView({selectedLayer:'audio',playhead:480000,graph:false});}
if(!audioMode)session.setView({selectedLayer:'title',playhead:240000,graph:true,graphMode:params.get('mode')==='value'?'value':'speed',openProps:['position'],selectedKeys:[{layer:'title',prop:'position',t:0}]});
(window as any).animationFixture={session,prepareAnimationAsset,frameSvg};
function Preview(){const state=useAnimationState(),doc=state.preview??state.doc;if(!doc)return <div className="panel"><CompositionsPanel {...{} as never}/></div>;const comp=findComp(doc)!;return <div style={{height:'100%',display:'flex',flexDirection:'column',padding:10,gap:6}}><header className="panel" style={{height:42,flexShrink:0,borderRadius:16,padding:'0 14px',justifyContent:'center'}}>✦ Somnia Animation <span style={{position:'absolute',right:24,color:'var(--text-secondary)'}}>Animation · Isolierte Pixelprüfung</span></header><div style={{display:'grid',gridTemplateColumns:'220px minmax(180px,1fr) 290px',flex:1,minHeight:0,gap:6}}><aside className="panel" style={{borderRadius:16,overflow:'auto'}}><CompositionsPanel {...{} as never}/></aside><main className="panel" style={{borderRadius:16}}><div style={{flex:1,minHeight:120,overflow:'hidden',position:'relative'}}><div style={{width:'100%',position:'absolute',inset:16}} dangerouslySetInnerHTML={{__html:frameSvg(comp,state.view.playhead,false,doc.assets).replace('<svg ','<svg style="width:100%;height:100%" ')}}/></div><AnimationTimeline comp={comp} at={state.view.playhead} selected={state.view.selectedLayer} canUndo={state.canUndo} canRedo={state.canRedo}/></main><aside className="panel" style={{borderRadius:16,overflow:'auto'}}>{state.renderSetup?<RenderSection {...{} as never}/>:<PropertiesSection {...{} as never}/>}</aside></div></div>}
createRoot(document.getElementById('root')!).render(<Preview/>);
