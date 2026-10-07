import {useMathStatus} from '../lib/mathStatus';
import {useT} from '../lib/useT';
/** Status bar pill for the active preview's math: loading, errors, all fine, or the .tex "no compile" reminder. */
export function MathPill(){
 const m=useMathStatus();const {t}=useT();
 if(!m.kind)return null;
 const pill=(cls:string,text:string,id:string)=><span className={`math-pill ${cls}`} role="status" data-testid={id}>{text}</span>;
 return <>
  {m.kind==='tex'&&pill('warn',t('math.pill.tex'),'math-pill-tex')}
  {m.loading?pill('warn',t('math.pill.loading'),'math-pill-loading'):m.failed?pill('err',t('math.failed'),'math-pill-failed'):m.errors>0?pill('err',t('math.pill.errors',{count:m.errors}),'math-pill-errors'):m.count>0?pill('ok',t('math.pill.ok'),'math-pill-ok'):null}
 </>;}
