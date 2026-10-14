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
interfaceSession.start();let frame='';interfaceSession.transact(d=>{d.name='Mobile welcome';frame=addNode(d,d.pages[0].id,'frame');const text=addNode(d,d.pages[0].id,'text',frame);const n=d.nodes.find(n=>n.id===text)!;n.text='Welcome to Somnia';n.width=300;n.height=48;n.y=72;const button=addNode(d,d.pages[0].id,'rectangle',frame);const b=d.nodes.find(n=>n.id===button)!;b.y=160;b.width=300;b.height=52;});interfaceSession.select(frame);
createRoot(document.getElementById('root')!).render(<div style={{height:'100%',display:'flex',flexDirection:'column',gap:6,padding:12}}><header style={{height:42,display:'flex',alignItems:'center',padding:'0 12px',background:'var(--bg-panel)',borderRadius:16}}>Somnia Interface <span style={{marginLeft:'auto',color:'var(--text-secondary)'}}>P0 isolated preview</span></header><div style={{display:'grid',gridTemplateColumns:'268px minmax(180px,1fr) 320px',gap:6,flex:1,minHeight:0}}><aside className="panel" style={{borderRadius:16,overflow:'auto'}}><InterfaceLayers/></aside><InterfaceCanvas/><aside className="panel" style={{borderRadius:16,overflow:'auto'}}><InterfaceProperties/></aside></div></div>);
