import {useEffect,useState} from 'react';
import {useT} from '../../lib/useT';
import {useAppStore} from '../../store/appStore';
import {useSvgUi,patchUi} from '../../lib/svgedit/store';
import * as C from '../../lib/svgedit/controller';
import {elementAt,parsePathKey,attr,walk} from '../../lib/svgedit/source';
import {GradientEditor} from './GradientEditor';
import {SnapPanel} from './SnapPanel';
import {clipInfo,releaseClip} from '../../lib/svgedit/clip';
import {translate,scaleAbout} from '../../lib/svgedit/geometry';
const fmt=(n:number)=>String(Math.round(n*100)/100);
function Num({label,value,onCommit,disabled,testid}:{label:string;value:number|null;onCommit:(v:number)=>void;disabled?:boolean;testid?:string}){
 const [v,setV]=useState(value===null?'':fmt(value));useEffect(()=>setV(value===null?'':fmt(value)),[value]);
 const done=()=>{const n=parseFloat(v);if(Number.isFinite(n)&&value!==null&&Math.abs(n-value)>1e-6)onCommit(n);else setV(value===null?'':fmt(value));};
 return <label className="svg-field"><span>{label}</span><input data-testid={testid} inputMode="decimal" disabled={disabled||value===null} value={v} onChange={e=>setV(e.target.value)} onBlur={done} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')e.currentTarget.blur();}} aria-label={label}/></label>;}
function Paint({label,value,onCommit,testid}:{label:string;value:string|undefined;onCommit:(v:string)=>void;testid:string}){
 const {t}=useT();const none=value==='none';const hex=/^#[0-9a-f]{6}$/i.test(value??'')?value!:/^#[0-9a-f]{3}$/i.test(value??'')?'#'+value!.slice(1).split('').map(c=>c+c).join(''):'#000000';
 const [txt,setTxt]=useState(value??'');useEffect(()=>setTxt(value??''),[value]);
 return <div className="svg-field"><span>{label}</span>
  <input type="color" aria-label={`${label} ${t('svg.colour')}`} data-testid={`${testid}-picker`} value={hex} disabled={none} onChange={e=>onCommit(e.target.value)}/>
  <input data-testid={testid} aria-label={label} className="grow" value={txt} onChange={e=>setTxt(e.target.value)} onBlur={()=>{if(txt.trim()&&txt!==value)onCommit(txt.trim());}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')e.currentTarget.blur();}}/>
  <button className="svg-none" aria-pressed={none} aria-label={`${label}: ${t('svg.none')}`} onClick={()=>onCommit(none?'#000000':'none')}>∅</button></div>;}
export function SvgInspector(){
 const {t}=useT();const ui=useSvgUi();useAppStore();const sc=C.scan();const root=sc.root;const sel=ui.selection;
 const el=sel.length===1&&root?elementAt(root,parsePathKey(sel[0])):null;const first=sel.length&&root?elementAt(root,parsePathKey(sel[0])):null;
 const box=sel.length?C.boxOfKeys(C.topKeys(sel)):null;
 const tab=ui.inspectorTab;const [code,setCode]=useState('');
 useEffect(()=>{setCode(el?sc.text.slice(el.from,el.to):'');},[sc.text,sel.join('|')]);// eslint-disable-line react-hooks/exhaustive-deps
 const colors=(()=>{const set=new Map<string,number>();if(root)walk(root,e=>{for(const p of['fill','stroke']){const v=C.readPaint(e,p);if(v&&v!=='none'&&/^#|^rgb/i.test(v))set.set(v.toLowerCase(),(set.get(v.toLowerCase())??0)+1);}});return[...set.keys()].slice(0,48);})();
 const tabs=[['design',t('svg.tabDesign')],['color',t('svg.tabColor')],['code',t('svg.tabCode')]] as const;
 const paintOf=(p:string)=>first?C.readPaint(first,p):undefined;
 return <aside className="panel inspector svg-inspector" aria-label={t('svg.inspector')} data-testid="svg-inspector">
  <div className="svg-tabs" role="tablist">{tabs.map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>patchUi({inspectorTab:id})}>{label}</button>)}</div>
  {tab==='design'&&(first&&box?<div className="svg-section">
   <h3>{el?`<${el.tag}>`:t('svg.nSelected',{n:sel.length})}</h3>
   <div className="grid grid-cols-2 gap-x-2">
    <Num label="X" testid="svg-x" value={box.x} onCommit={v=>C.transformKeys(sel,translate(v-box.x,0))}/>
    <Num label="Y" testid="svg-y" value={box.y} onCommit={v=>C.transformKeys(sel,translate(0,v-box.y))}/>
    <Num label="W" testid="svg-w" value={box.w} onCommit={v=>box.w>0&&C.transformKeys(sel,scaleAbout(v/box.w,1,box.x,box.y))}/>
    <Num label="H" testid="svg-h" value={box.h} onCommit={v=>box.h>0&&C.transformKeys(sel,scaleAbout(1,v/box.h,box.x,box.y))}/></div>
   {el?.tag==='rect'&&<Num label={t('svg.radius')} testid="svg-radius" value={parseFloat(attr(el,'rx')??'0')||0} onCommit={v=>C.setAttrOn(sel[0],{rx:v>0?fmt(v):null,ry:null})}/>}
   {el?.tag==='text'&&<><label className="svg-field"><span>{t('svg.textContent')}</span><input data-testid="svg-text" aria-label={t('svg.textContent')} defaultValue={C.textOf(el,sc.text)} key={sel[0]+sc.text.length} onBlur={e=>{if(e.target.value!==C.textOf(el,sc.text))C.setTextContent(sel[0],e.target.value);}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')e.currentTarget.blur();}}/></label>
    <Num label={t('svg.fontSize')} value={parseFloat(C.readPaint(el,'font-size')??'16')||16} onCommit={v=>C.setPaint(sel,{'font-size':fmt(v)})}/></>}
   {el&&clipInfo(el)&&<div className="svg-field" data-testid="svg-clip-status"><span style={{width:'auto',flex:1,textTransform:'none',letterSpacing:0}}>{clipInfo(el)!.kind==='clip'?t('svg.clip.clipped'):t('svg.clip.masked')}</span><button className="svg-none" style={{width:'auto',padding:'0 8px'}} data-testid="svg-clip-release" onClick={()=>releaseClip(sel[0])}>{t('svg.clip.release')}</button></div>}
   <h4>{t('svg.fill')}</h4><GradientEditor keys={sel} fill={paintOf('fill')}/>{!/^url\(/.test(paintOf('fill')??'')&&<Paint label={t('svg.fill')} testid="svg-fill" value={paintOf('fill')??'#000000'} onCommit={v=>C.setPaint(sel,{fill:v})}/>}
   <h4>{t('svg.stroke')}</h4><Paint label={t('svg.stroke')} testid="svg-stroke" value={paintOf('stroke')??'none'} onCommit={v=>C.setPaint(sel,{stroke:v,...(paintOf('stroke-width')===undefined&&v!=='none'?{'stroke-width':'1'}:{})})}/>
   <Num label={t('svg.strokeWidth')} testid="svg-sw" value={parseFloat(paintOf('stroke-width')??'1')||0} onCommit={v=>C.setPaint(sel,{'stroke-width':fmt(v)})}/>
   <Num label={t('svg.opacity')} testid="svg-opacity" value={Math.round(parseFloat(paintOf('opacity')??'1')*100)} onCommit={v=>C.setPaint(sel,{opacity:fmt(Math.min(100,Math.max(0,v))/100)})}/>
  </div>:<div className="svg-section"><h3>{t('svg.document')}</h3>
   {root&&['width','height','viewBox'].map(a=><label key={a} className="svg-field"><span>{a}</span><input data-testid={`svg-doc-${a}`} aria-label={a} defaultValue={attr(root,a)??''} key={a+sc.text.length} onBlur={e=>{if(e.target.value!==(attr(root,a)??''))C.setDocument({[a]:e.target.value});}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')e.currentTarget.blur();}}/></label>)}
   <p className="text-[11px] text-ink-3">{t('svg.docHint')}</p></div>)}
  {tab==='design'&&<SnapPanel/>}
  {tab==='color'&&<div className="svg-section"><h3>{t('svg.docColors')}</h3>{colors.length?<div className="svg-swatches" data-testid="svg-swatches">{colors.map(c=><button key={c} title={c} aria-label={c} style={{background:c}} onClick={()=>sel.length&&C.setPaint(sel,{fill:c})}/>)}</div>:<p className="text-[11px] text-ink-3">{t('svg.noColors')}</p>}<p className="mt-2 text-[11px] text-ink-3">{t('svg.swatchHint')}</p>
   <h4>{t('svg.newShapes')}</h4><Paint label={t('svg.fill')} testid="svg-draw-fill" value={ui.draw.fill} onCommit={v=>patchUi({draw:{...ui.draw,fill:v}})}/><Paint label={t('svg.stroke')} testid="svg-draw-stroke" value={ui.draw.stroke} onCommit={v=>patchUi({draw:{...ui.draw,stroke:v}})}/>
   <Num label={t('svg.strokeWidth')} value={ui.draw.strokeWidth} onCommit={v=>patchUi({draw:{...ui.draw,strokeWidth:Math.max(0,v)}})}/></div>}
  {tab==='code'&&<div className="svg-section">{el?<><textarea className="svg-code" data-testid="svg-code" spellCheck={false} aria-label={t('svg.tabCode')} value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>e.stopPropagation()}/><button className="svg-apply" onClick={()=>C.replaceElementSource(sel[0],code)}>{t('svg.apply')}</button></>:<p className="text-[11px] text-ink-3">{t('svg.codeHint')}</p>}</div>}
 </aside>;}
