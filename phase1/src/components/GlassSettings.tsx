import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,Info} from 'lucide-react';
import {useT} from '../lib/useT';
import {DEFAULT_LOOK,glassPlatform,type Look} from '../lib/look';
import {resolveGlass,CODE_RECOMMENDED_MIN,CODE_HARD_MIN,PANEL_OFFSET} from '../lib/glass';
/** Settings > Appearance > Glass. Slider drafts are shown at once and committed once per animation frame. */
export function GlassSettings({look,highContrast,onChange}:{look:Look;highContrast:boolean;onChange:(l:Look)=>void}){
 const {t}=useT();
 const lookRef=useRef(look);lookRef.current=look;
 const [draft,setDraft]=useState<{opacity?:number;blur?:number}>({});
 const raf=useRef(0);const pending=useRef<Partial<Look>>({});
 useEffect(()=>()=>{cancelAnimationFrame(raf.current);},[]);
 useEffect(()=>setDraft({}),[look.glassOpacity,look.glassBlur]);
 const commit=(patch:Partial<Look>)=>{pending.current={...pending.current,...patch};if(raf.current)return;raf.current=requestAnimationFrame(()=>{raf.current=0;const p=pending.current;pending.current={};onChange({...lookRef.current,...p});});};
 const solid=look.background!=='glass';const off=solid||highContrast;
 const opacity=draft.opacity??look.glassOpacity,blur=draft.blur??look.glassBlur;
 const cs=getComputedStyle(document.documentElement);
 const platform=glassPlatform();
 const g=resolveGlass({opacity,blur,frame:look.glassFrame,panels:look.glassPanels,code:look.glassCode},{...platform,textColor:cs.getPropertyValue('--text-primary').trim(),panelColor:cs.getPropertyValue('--bg-panel').trim()});
 const clampOp=(n:number)=>Math.min(100,Math.max(0,Math.round(Number.isFinite(n)?n:0)));
 const setOpacity=(n:number)=>{const v=clampOp(n);setDraft(d=>({...d,opacity:v}));commit({glassOpacity:v,glassKeepLow:false});};
 const setBlur=(n:number)=>{const v=Math.min(40,Math.max(0,Math.round(n)));setDraft(d=>({...d,blur:v}));commit({glassBlur:v});};
 const showLow=look.glassCode&&opacity<CODE_RECOMMENDED_MIN&&!look.glassKeepLow&&!g.floored;
 const alphaPct=(a:number)=>Math.round(a*100);
 const kw=<span hidden>{t('settings.glass.keywords')}</span>;
 return <fieldset className="glass-settings" aria-label={t('settings.glass.title')} disabled={off} style={{border:0,padding:0,margin:0,minWidth:0}}>
  <label>{t('settings.glass.title')} - {t('settings.glass.opacity')}{kw}
   <span className="settings-range-value">
    <input type="range" min="0" max="100" step="1" aria-label={t('settings.glass.opacity')} aria-describedby="glass-opacity-hint" aria-valuetext={`${opacity} %`} value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/>
    <input type="number" min="0" max="100" step="1" inputMode="numeric" aria-label={t('settings.glass.opacityNumber')} style={{width:56}} value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/>
    <output aria-hidden="true">%</output>
   </span></label>
  <p id="glass-opacity-hint">{t('settings.glass.opacityHint')}</p>
  <label>{t('settings.glass.blur')}{kw}
   <span className="settings-range-value" title={platform.blurSupported===false?t('settings.glass.warn.unsupported'):undefined}>
    <input type="range" min="0" max="40" step="1" aria-label={t('settings.glass.blur')} aria-valuetext={`${blur} px`} value={blur} disabled={platform.blurSupported===false} onChange={e=>setBlur(Number(e.target.value))}/>
    <output aria-hidden="true">{blur} px</output>
   </span></label>
  {platform.blurSupported===false?<p className="glass-note" role="status" aria-live="polite"><Info size={12} aria-hidden="true"/> {t('settings.glass.warn.unsupported')}</p>:null}
  {g.highBlur?<p className="glass-note" role="status" aria-live="polite"><Info size={12} aria-hidden="true"/> {t('settings.glass.warn.perf')}</p>:null}
  <div role="group" aria-label={t('settings.glass.scopes')}>
   <p>{t('settings.glass.scopes')}</p>
   <label>{t('settings.glass.scope.frame')}<input type="checkbox" aria-label={t('settings.glass.scope.frame')} checked={look.glassFrame} onChange={e=>onChange({...look,glassFrame:e.target.checked})}/></label>
   <label>{t('settings.glass.scope.panels')}<input type="checkbox" aria-label={t('settings.glass.scope.panels')} checked={look.glassPanels} onChange={e=>onChange({...look,glassPanels:e.target.checked})}/></label>
   <label>{t('settings.glass.scope.code')}<input type="checkbox" aria-label={t('settings.glass.scope.code')} checked={look.glassCode} onChange={e=>onChange({...look,glassCode:e.target.checked})}/></label>
  </div>
  <div aria-live="polite" className="glass-warnings">
   {showLow?<div className="glass-warn" role="note" style={{border:'1px solid var(--warning)',borderRadius:8,padding:'8px 10px',margin:'6px 0',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
    <AlertTriangle size={14} aria-hidden="true" style={{color:'var(--warning)'}}/>
    <span style={{flex:1,minWidth:160}}>{t('settings.glass.warn.contrast',{min:CODE_RECOMMENDED_MIN})}</span>
    <button type="button" onClick={()=>setOpacity(CODE_RECOMMENDED_MIN)}>{t('settings.glass.warn.setMin',{min:CODE_RECOMMENDED_MIN})}</button>
    <button type="button" onClick={()=>onChange({...look,glassKeepLow:true})}>{t('settings.glass.warn.keep')}</button></div>:null}
   {g.floored?<p className="glass-warn" role="note"><AlertTriangle size={14} aria-hidden="true" style={{color:'var(--warning)'}}/> {t('settings.glass.warn.floor',{min:CODE_HARD_MIN})}</p>:null}
   {g.reduced?<p className="glass-warn" role="note"><AlertTriangle size={14} aria-hidden="true" style={{color:'var(--warning)'}}/> {t('settings.glass.warn.reducedTransparency')}</p>:null}
   {highContrast?<p className="glass-warn" role="note"><Info size={14} aria-hidden="true"/> {t('settings.glass.disabledContrast')}</p>:null}
   {solid&&!highContrast?<p className="glass-note" role="note"><Info size={12} aria-hidden="true"/> {t('settings.glass.disabledSolid')}</p>:null}
  </div>
  <p id="glass-os-note" className="glass-note">{t('settings.glass.osNote')}</p>
  <button type="button" disabled={off} onClick={()=>{setDraft({});onChange({...look,glassOpacity:DEFAULT_LOOK.glassOpacity,glassBlur:DEFAULT_LOOK.glassBlur,glassFrame:DEFAULT_LOOK.glassFrame,glassPanels:DEFAULT_LOOK.glassPanels,glassCode:DEFAULT_LOOK.glassCode,glassKeepLow:false});}}>{t('settings.glass.reset')}</button>
 </fieldset>;
}
export const GLASS_PANEL_OFFSET=PANEL_OFFSET;
