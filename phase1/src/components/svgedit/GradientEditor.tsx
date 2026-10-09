import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import * as C from '../../lib/svgedit/controller';
import {readGradient,applyGradient,solidFill,urlId,DEFAULT_GRAD,type Grad,type Stop} from '../../lib/svgedit/gradient';
import {Plus,Trash2} from '../../lib/icons';
export function GradientEditor({keys,fill}:{keys:string[];fill:string|undefined}){
 const {t}=useT();const {root}=C.scan();const id=urlId(fill);const grad=id&&root?readGradient(root,id):null;
 const set=(g:Grad)=>applyGradient(keys,g,grad?id:null);
 const mode=grad?grad.type:'solid';
 const css=grad?`linear-gradient(90deg,${[...grad.stops].sort((a,b)=>a.offset-b.offset).map(s=>`${s.color} ${Math.round(s.offset*100)}%`).join(',')})`:'none';
 const stopSet=(i:number,p:Partial<Stop>)=>grad&&set({...grad,stops:grad.stops.map((s,j)=>j===i?{...s,...p}:s)});
 const hex=(c:string)=>/^#[0-9a-f]{6}$/i.test(c)?c:'#000000';
 return <div data-testid="svg-gradient" className="svg-grad">
  <div className="svg-seg" role="group" aria-label={t('svg.gradient')}>{(['solid','linear','radial'] as const).map(m=><button key={m} data-grad-mode={m} aria-pressed={mode===m} onClick={()=>{if(m===mode)return;if(m==='solid'){solidFill(keys,grad?.stops[0].color??'#000000');return;}
   const base=grad??DEFAULT_GRAD;const cur=/^#/.test(fill??'')?fill!:null;set({...base,type:m,stops:grad||!cur?base.stops:[{...base.stops[0],color:cur},base.stops[1]]});}}>{t('svg.grad.'+m)}</button>)}</div>
  {grad&&<>
   <div className="svg-grad-bar" style={{background:css}} aria-hidden="true"/>
   {grad.type==='linear'&&<label className="svg-field"><span>{t('svg.grad.angle')}</span><input data-testid="svg-grad-angle" type="range" min={-180} max={180} value={grad.angle} aria-label={t('svg.grad.angle')} onChange={e=>set({...grad,angle:+e.target.value})}/><b className="w-9 text-right text-[11px]">{grad.angle}°</b></label>}
   {grad.stops.map((s,i)=><div key={i} className="svg-field" data-testid="svg-stop">
    <input type="color" aria-label={`${t('svg.grad.stop')} ${i+1} ${t('svg.colour')}`} value={hex(s.color)} onChange={e=>stopSet(i,{color:e.target.value})}/>
    <input aria-label={`${t('svg.grad.stop')} ${i+1} %`} className="!w-14" inputMode="numeric" defaultValue={Math.round(s.offset*100)} key={`${i}-${s.offset}`} onBlur={e=>{const v=parseFloat(e.target.value);if(Number.isFinite(v)&&Math.abs(v/100-s.offset)>1e-6)stopSet(i,{offset:Math.min(100,Math.max(0,v))/100});}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')e.currentTarget.blur();}}/><span className="!w-4">%</span>
    <input aria-label={`${t('svg.grad.stop')} ${i+1} ${t('svg.opacity')}`} className="!w-12" inputMode="numeric" defaultValue={Math.round(s.opacity*100)} key={`o${i}-${s.opacity}`} onBlur={e=>{const v=parseFloat(e.target.value);if(Number.isFinite(v)&&Math.abs(v/100-s.opacity)>1e-6)stopSet(i,{opacity:Math.min(100,Math.max(0,v))/100});}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')e.currentTarget.blur();}}/><span className="!w-4">α</span>
    <button className="svg-layer-btn" aria-label={`${t('svg.grad.removeStop')} ${i+1}`} disabled={grad.stops.length<=2} onClick={()=>set({...grad,stops:grad.stops.filter((_,j)=>j!==i)})}><Trash2 size={13}/></button></div>)}
   <Button size="compact" data-testid="svg-add-stop" onClick={()=>{const st=[...grad.stops].sort((a,b)=>a.offset-b.offset);let bi=0,bg=0;for(let i=0;i<st.length-1;i++)if(st[i+1].offset-st[i].offset>bg){bg=st[i+1].offset-st[i].offset;bi=i;}
    set({...grad,stops:[...grad.stops,{offset:(st[bi].offset+st[bi+1].offset)/2,color:st[bi].color,opacity:st[bi].opacity}]});}}><Plus size={12}/> {t('svg.grad.addStop')}</Button></>}
 </div>;}
