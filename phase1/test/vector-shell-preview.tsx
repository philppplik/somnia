import React,{useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import '../src/styles/global.css';
import {VectorCanvas} from '../src/components/vectorstudio/VectorCanvas';
import {InspectorPanel,registerInspectorSection} from '../src/components/shell/InspectorPanel';
import {VectorLayersPanel,VectorToolsPanel,VectorExportPanel,VectorPageSection,VectorTransformSection,VectorStyleSection,VectorNodeSection} from '../src/components/vectorstudio/VectorPanels';
import {useStudioContext} from '../src/lib/shell/studioContext';
import {createBlankVector,addPath,select,setTool,selectNode} from '../src/lib/vectorstudio/session';
import {rectPath,ellipsePath,starPath} from '../src/lib/vectorstudio/shapes';
import {patchState} from '../src/store/appStore';
import {vectorCommandsReady} from '../src/store/vectorBootstrap';
import {vectorShell} from '../src/lib/studios/vector';
import {effectiveRail} from '../src/lib/shell/railResolver';
import {registerRailIcons,resolveRailIcon} from '../src/lib/shell/railIcons';
import '../src/components/shell/railIconSet';
import {NodeIcon,PenNibIcon,StarIcon,PolygonIcon} from '../src/components/vectorstudio/icons';
import {Circle,Minus,Download} from '../src/lib/icons';
import {executeCommand} from '../src/lib/commands';
import {useT} from '../src/lib/useT';
registerRailIcons({VectorNode:NodeIcon,VectorPen:PenNibIcon,VectorEllipse:Circle,VectorLine:Minus,VectorPolygon:PolygonIcon,VectorStar:StarIcon,VectorExport:Download});
for(const [id,Host] of Object.entries({'page':VectorPageSection,'transform':VectorTransformSection,'style':VectorStyleSection,'nodes':VectorNodeSection}))registerInspectorSection('vector.section.'+id,Host);
patchState({activeStudio:'vector',activeFile:'',files:{}});createBlankVector(800,600,'Composition.svg');
const a=rectPath({x:100,y:90,w:320,h:210},28);a.name='Card';addPath(a);
const b=ellipsePath({x:270,y:200,w:250,h:250});b.name='Orb';b.style={fill:'#29b99a',stroke:'none'};addPath(b);
const c=starPath({x:480,y:100,w:200,h:200});c.name='Star';c.style={fill:'#ffb942',stroke:'none'};addPath(c);select([a.id]);
await vectorCommandsReady;
if(location.search.includes('node')){setTool('node');selectNode(a.nodes[0].id);}
function Preview(){const ctx=useStudioContext('vector'),{t}=useT();useEffect(()=>{document.documentElement.dataset.theme=location.search.includes('dark')?'dark':'light';},[]);
 const rail=effectiveRail(vectorShell.leftRail!,undefined,{ctx});return <main style={{display:'grid',gridTemplateRows:'46px 1fr',height:'100vh',padding:12,gap:10}}>
 <header style={{display:'flex',alignItems:'center',padding:'0 16px',background:'var(--bg-panel)',borderRadius:16}}><strong>Somnia Vector</strong><span style={{marginLeft:36}}>Project　 Edit　 View　 Insert　 Tools　 Help</span><span style={{marginLeft:'auto',color:'var(--text-tertiary)'}}>Studio shell preview</span></header>
 <div style={{display:'grid',gridTemplateColumns:'44px 240px minmax(0,1fr) 300px 200px',gap:10,minHeight:0}}>
 <nav style={{display:'grid',alignContent:'start',gap:6}}>{rail.visible.map(i=>{const Icon=resolveRailIcon(i.icon);return <button key={i.id} style={{height:36,border:0,background:'var(--bg-panel)',borderRadius:8}} title={i.labelKey?t(i.labelKey):i.label} onClick={()=>{if(i.kind==='tool')void executeCommand('vector.tool.'+i.tool);}}><Icon size={20}/></button>})}<button title="More tools">...</button></nav>
 <aside style={{background:'var(--bg-panel)',borderRadius:16,overflow:'auto'}}><VectorLayersPanel panelId="layers" context={ctx}/><VectorToolsPanel/></aside>
 <VectorCanvas/><div style={{overflow:'auto',background:'var(--bg-panel)',borderRadius:16}}><InspectorPanel panelId="inspector" context={ctx}/></div><aside style={{background:'var(--bg-panel)',borderRadius:16}}><h2 style={{padding:12,fontSize:12}}>Export</h2><VectorExportPanel/></aside>
 </div></main>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
