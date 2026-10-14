/** Isolated real-component pixel review. Not a Tauri/app E2E or WASM test. */
import {createRoot} from 'react-dom/client';
import {useAnimationState,animationSession} from '../src/lib/animation/session';
import {findComp} from '../src/lib/animation/model';
import {registerAnimationCommands} from '../src/lib/animation/commands';
import {CompositionsPanel,PropertiesSection} from '../src/components/animation/AnimationPanels';
import {AnimationTimeline} from '../src/components/animation/AnimationTimeline';
import {frameSvg} from '../src/lib/animation/exportFrames';
import {prepareAnimationAsset} from '../src/lib/animation/assets';
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
session.setView({selectedLayer:'title',playhead:240000,graph:true,graphMode:params.get('mode')==='value'?'value':'speed',openProps:['position'],selectedKeys:[{layer:'title',prop:'position',t:0}]});
(window as any).animationFixture={session,prepareAnimationAsset,frameSvg};
function Preview(){const state=useAnimationState(),doc=state.preview??state.doc;if(!doc)return <div className="panel"><CompositionsPanel {...{} as never}/></div>;const comp=findComp(doc)!;return <div style={{height:'100%',display:'flex',flexDirection:'column',padding:10,gap:6}}><header className="panel" style={{height:42,flexShrink:0,borderRadius:16,padding:'0 14px',justifyContent:'center'}}>✦ Somnia Animation <span style={{position:'absolute',right:24,color:'var(--text-secondary)'}}>Animation · Isolierte Pixelprüfung</span></header><div style={{display:'grid',gridTemplateColumns:'220px minmax(180px,1fr) 290px',flex:1,minHeight:0,gap:6}}><aside className="panel" style={{borderRadius:16,overflow:'auto'}}><CompositionsPanel {...{} as never}/></aside><main className="panel" style={{borderRadius:16}}><div style={{flex:1,minHeight:120,overflow:'hidden',position:'relative'}}><div style={{width:'100%',position:'absolute',inset:16}} dangerouslySetInnerHTML={{__html:frameSvg(comp,state.view.playhead,false,doc.assets).replace('<svg ','<svg style="width:100%;height:100%" ')}}/></div><AnimationTimeline comp={comp} at={state.view.playhead} selected={state.view.selectedLayer} canUndo={state.canUndo} canRedo={state.canRedo}/></main><aside className="panel" style={{borderRadius:16,overflow:'auto'}}><PropertiesSection {...{} as never}/></aside></div></div>}
createRoot(document.getElementById('root')!).render(<Preview/>);
