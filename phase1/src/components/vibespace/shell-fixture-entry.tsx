/** Explicit offline shell harness. Never imported by the desktop entry. */
import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {VibeSpaceHome} from './VibeSpaceHome';
import {SpacesPanel,RunsPanel,AttentionPanel,SpaceSection,RunSection,UsageSection,CheckpointsSection,useVibeShell} from './VibeSpacePanels';
import {createFixtureVibeSpaceTransport} from '../../lib/vibespace/fixture';
import {vibespaceShell} from '../../lib/studios/vibespace';
import {registerRailIcons,resolveRailIcon} from '../../lib/shell/railIcons';
import {Bot,LayoutTemplate,AlertTriangle,Info} from '../../lib/icons';
import {useStudioContext} from '../../lib/shell/studioContext';
import './vibespace.css';
registerRailIcons({Bot,LayoutTemplate,AlertTriangle,Info});
const transport=createFixtureVibeSpaceTransport('test');Object.assign(window,{vibeShellFixture:transport});
function Harness(){const [panel,setPanel]=useState('spaces');const state=useVibeShell();const context=useStudioContext('vibespace');const props={panelId:panel,context};return <><header className="h-title"><Bot size={22}/> Somnia <span>Vibe Space / Studio shell</span></header><main className="h-shell"><nav className="h-rail" aria-label="Vibe Space tools">{vibespaceShell.leftRail!.map(item=>{const Icon=resolveRailIcon(item.icon);return <button key={item.id} aria-label={item.label} title={item.label} aria-pressed={panel===item.id} onClick={()=>setPanel(item.id)}><Icon size={20}/></button>;})}</nav><aside className="h-sidebar"><h2>{vibespaceShell.panels!.find(p=>p.id===panel)?.title}</h2>{panel==='spaces'?<SpacesPanel {...props}/>:panel==='runs'?<RunsPanel {...props}/>:<AttentionPanel {...props}/>}</aside><div className="h-canvas"><VibeSpaceHome transport={transport}/></div><aside className="h-inspector"><h2>Vibe Space</h2><section><h3>Space</h3><SpaceSection sectionId="space" context={context}/></section>{state.runId&&<><section><h3>Selected run</h3><RunSection sectionId="run" context={context}/></section><section><h3>Usage</h3><UsageSection sectionId="usage" context={context}/></section><details><summary>Checkpoints</summary><CheckpointsSection sectionId="checkpoints" context={context}/></details></>}</aside><nav className="h-rail"><button aria-label="Vibe Space inspector"><Info size={20}/></button></nav></main></>;}
createRoot(document.getElementById('root')!).render(<Harness/>);
