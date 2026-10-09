import {useState} from 'react';
import {useT} from '../../lib/useT';
import {useSvgUi,patchUi} from '../../lib/svgedit/store';
import * as C from '../../lib/svgedit/controller';

/** Snap switch, grid size and ruler-free guides. Guides live in the editor session, they are not written into the SVG. */
export function SnapPanel(){
 const {t}=useT();const ui=useSvgUi();const [pos,setPos]=useState('');
 const add=(axis:'x'|'y')=>{const b=C.docBox();const n=parseFloat(pos);const v=Number.isFinite(n)?n:axis==='x'?b.x+b.w/2:b.y+b.h/2;patchUi({guides:[...ui.guides,{axis,pos:Math.round(v*100)/100}]});setPos('');};
 return <div className="svg-section" data-testid="svg-snap-panel">
  <h4>{t('svg.snap.title')}</h4>
  <label className="svg-field"><input type="checkbox" data-testid="svg-snap-toggle" checked={ui.snap} onChange={e=>patchUi({snap:e.target.checked})} style={{width:14,height:14}}/><span style={{width:'auto'}}>{t('svg.snap.on')}</span></label>
  <label className="svg-field"><span>{t('svg.snap.grid')}</span><input data-testid="svg-grid-size" inputMode="decimal" aria-label={t('svg.snap.grid')} value={ui.grid||''} placeholder="0" onKeyDown={e=>e.stopPropagation()} onChange={e=>{const n=parseFloat(e.target.value);patchUi({grid:Number.isFinite(n)&&n>0?n:0});}}/></label>
  <p className="text-[11px] text-ink-3" style={{margin:'4px 0'}}>{t('svg.snap.hint')}</p>
  <h4>{t('svg.guides')}</h4>
  <div className="flex items-center gap-1"><input data-testid="svg-guide-pos" className="!h-6 grow text-[11px]" inputMode="decimal" aria-label={t('svg.guide.pos')} placeholder={t('svg.guide.pos')} value={pos} onKeyDown={e=>e.stopPropagation()} onChange={e=>setPos(e.target.value)}/>
   <button className="svg-none" style={{width:'auto',padding:'0 8px'}} data-testid="svg-guide-add-v" onClick={()=>add('x')}>{t('svg.guide.vertical')}</button>
   <button className="svg-none" style={{width:'auto',padding:'0 8px'}} data-testid="svg-guide-add-h" onClick={()=>add('y')}>{t('svg.guide.horizontal')}</button></div>
  {ui.guides.length>0&&<ul style={{listStyle:'none',margin:'6px 0 0',padding:0}}>{ui.guides.map((g,i)=><li key={i} className="svg-field" data-testid="svg-guide-row"><span style={{width:'auto',flex:1,textTransform:'none',letterSpacing:0}}>{g.axis==='x'?t('svg.guide.vertical'):t('svg.guide.horizontal')} {g.pos}</span><button className="svg-none" aria-label={t('svg.guide.remove')} title={t('svg.guide.remove')} onClick={()=>patchUi({guides:ui.guides.filter((_,j)=>j!==i)})}>×</button></li>)}</ul>}
 </div>;}
