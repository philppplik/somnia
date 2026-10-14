import {setInterfaceSnap} from '../src/components/interface/InterfaceSelection';
import {prepareRasterAsset,attachRasterAsset} from '../src/lib/interface/assets';
import {parseInterfaceSVG,attachSVGSnapshot} from '../src/lib/interface/vector';
import {addVariable,DEFAULT_TEXT_STYLE} from '../src/lib/interface/tokens';
import {DEFAULT_LAYOUT,DEFAULT_SIZING} from '../src/lib/interface/schema';
import {createComponent,addComponentVariant,instantiateComponent,patchInterfaceNode} from '../src/lib/interface/components';
/** Isolated pixel-review fixture, not an app/WASM/E2E substitute. */
import {createRoot} from 'react-dom/client';
import {InterfaceCanvas} from '../src/components/interface/InterfaceCanvas';
import {InterfaceLayers,InterfaceProperties} from '../src/components/interface/InterfacePanels';
import {interfaceSession} from '../src/lib/interface/session';
import {addNode} from '../src/lib/interface/model';
import {setLocale} from '../src/lib/i18n';
import '../src/styles/global.css';
if(!import.meta.env.DEV)throw Error('Development fixture only.');
const params=new URLSearchParams(location.search);document.documentElement.dataset.theme=params.get('theme')??'light';setLocale(params.get('locale')??'en');
interfaceSession.start();let frame='';interfaceSession.transact(d=>{
 d.name='Local token card system';const accent=addVariable(d,'color','Brand accent'),space=addVariable(d,'number','Card gap');d.variables![0].value='#7756e8';d.variables![1].value=16;d.textStyles=[{...DEFAULT_TEXT_STYLE,id:'heading',name:'Card heading',fontSize:20,fontWeight:600}];frame=addNode(d,d.pages[0].id,'frame');const f=d.nodes.find(n=>n.id===frame)!;f.name='Card / Default';f.width=360;f.height=320;f.layout={...DEFAULT_LAYOUT,direction:'column',padding:[24,24,24,24],gap:16};f.sizing={...DEFAULT_SIZING,height:'hug'};f.bindings={gap:space};f.ready=true;f.annotation='Review keyboard order and final text before implementation.';
 const text=addNode(d,d.pages[0].id,'text',frame);const n=d.nodes.find(n=>n.id===text)!;n.text='Welcome to Somnia';n.name='Title';n.width=300;n.height=40;n.sizing={...DEFAULT_SIZING,width:'fill'};n.textStyleId='heading';
 const button=addNode(d,d.pages[0].id,'rectangle',frame);const b=d.nodes.find(n=>n.id===button)!;b.name='Action';b.height=48;b.sizing={...DEFAULT_SIZING,width:'fill'};b.bindings={fill:accent};
 const component=createComponent(d,frame,'Card');const variant=addComponentVariant(d,component,d.components![0].variants[0].id,'Dark');const dark=d.nodes.find(n=>n.id===d.components![0].variants[1].rootId)!;dark.fill='#202124';dark.y=300;dark.x=24;const title=d.nodes.find(n=>n.parentId===dark.id&&n.kind==='text')!;title.fill='#ffffff';
 const instance=instantiateComponent(d,component,variant,d.pages[0].id);d.nodes.find(n=>n.id===instance)!.x=440;d.nodes.find(n=>n.id===instance)!.y=300;
});interfaceSession.select(frame);
const raster=document.createElement('canvas');raster.width=160;raster.height=80;const context=raster.getContext('2d')!;const gradient=context.createLinearGradient(0,0,160,80);gradient.addColorStop(0,'#7756e8');gradient.addColorStop(1,'#ffb347');context.fillStyle=gradient;context.fillRect(0,0,160,80);const rasterBlob=await new Promise<Blob>(r=>raster.toBlob(b=>r(b!),'image/png'));const asset=await prepareRasterAsset(new File([rasterBlob],'original-gradient.png',{type:'image/png'}));interfaceSession.transact(d=>{attachRasterAsset(d,frame,asset);for(const n of d.nodes.filter(n=>n.kind==='frame'&&n.id!==frame))n.y=550;attachSVGSnapshot(d,frame,parseInterfaceSVG('<svg width="160" height="80"><ellipse cx="35" cy="40" rx="28" ry="28" fill="#7756e8"/><path d="M 80 65 L 110 15 L 145 65 Z" fill="#ffb347" stroke="#202124" stroke-width="2"/></svg>'));});interfaceSession.transact(d=>{const frames=d.nodes.filter(n=>n.kind==='frame');const source=d.nodes.find(n=>n.parentId===frame&&n.name==='Action')!;source.prototypeLinks=[{trigger:'click',targetFrameId:frames[1].id},{trigger:'hover',targetFrameId:frames[1].id}];frames[1].prototypeLinks=[{trigger:'click',targetFrameId:frame}];d.prototypeStartFrameId=frame;});interfaceSession.selectMany(interfaceSession.get().document!.nodes.filter(n=>n.kind==='frame').map(n=>n.id));setInterfaceSnap({enabled:true,grid:16,guidesX:[24,180],guidesY:[24,150]});
createRoot(document.getElementById('root')!).render(<div style={{height:'100%',display:'flex',flexDirection:'column',gap:6,padding:12}}><header style={{height:42,display:'flex',alignItems:'center',padding:'0 12px',background:'var(--bg-panel)',borderRadius:16}}>Somnia Interface <span style={{marginLeft:'auto',color:'var(--text-secondary)'}}>P6 isolated preview</span></header><div style={{display:'grid',gridTemplateColumns:'268px minmax(180px,1fr) 320px',gap:6,flex:1,minHeight:0}}><aside className="panel" style={{borderRadius:16,overflow:'auto'}}><InterfaceLayers/></aside><InterfaceCanvas/><aside className="panel" style={{borderRadius:16,overflow:'auto'}}><InterfaceProperties/></aside></div></div>);
