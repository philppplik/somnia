import {useRef,type ReactNode,type KeyboardEvent} from 'react';
import {Bell,Database,Folder,Globe,KeyRound,Clipboard,Sparkles,Zap,CircleHelp,X as XIcon} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle} from '../ui/dialog';
import {useT} from '../../lib/useT';
import {VerifiedBadge,Logo} from './parts';
import {candidateBound,chipTone,relativeAge,type AccessRow,type EvidenceRow,type StoreCard} from '../../lib/extensions/storeView';

const ICONS={folder:Folder,globe:Globe,key:KeyRound,clipboard:Clipboard,agent:Sparkles,bolt:Zap,bell:Bell,database:Database,other:CircleHelp};
export {candidateBound,chipTone};
export function fmtDate(iso:string|null,locale:string){if(!iso)return '';const d=new Date(iso);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'}).format(d);}
export function useAge(){const {t}=useT();return (ts:number,now:number)=>{const a=relativeAge(ts,now);return t(`store.age.${a.unit}`,{count:a.n});};}

/** Icon-only verified mark. A real button so Enter opens the explainer; the name never relies on colour. */
export function StoreBadge({size=18,onExplain}:{size?:number;onExplain:()=>void}){
 const {t}=useT();
 return <button type="button" className="store-badge" aria-label={t('store.verified')} title={t('store.verified')} onClick={e=>{e.stopPropagation();onExplain();}}><VerifiedBadge criterion={t('store.verified')} size={size}/></button>;
}
export function StatusChip({tone,children}:{tone:'ok'|'warn'|'bad'|'neutral';children:ReactNode}){return <span className={`store-chip store-chip-${tone}`}>{children}</span>;}
export function AccessTags({card}:{card:StoreCard}){
 const {t}=useT();
 return <div className="ext-tags" data-testid="access-tags">
  <span className="store-tag">{card.files==='write'?t('store.tag.write'):card.files==='read'?t('store.tag.read'):t('store.tag.noFiles')}</span>
  {card.network.kind==='none'?<span className="store-tag">{t('store.tag.noNetwork')}</span>:<span className="store-tag store-tag-amber">{card.network.kind==='many'?t('store.tag.manyHosts'):t('store.tag.host',{count:card.network.count})}</span>}
  {card.official?<span className="store-tag store-tag-official">{t('store.official')}</span>:null}
 </div>;
}
export function PermissionRowItem({row}:{row:AccessRow}){
 const {t}=useT();const Icon=ICONS[row.icon];
 return <li className="store-perm"><span className={`store-perm-icon${row.amber?' is-amber':''}`} aria-hidden="true"><Icon size={18}/></span>
  <div><p className="store-perm-title">{t(row.titleKey,row.params)}</p>{row.titleKey==='store.perm.network'?<p className="store-perm-body">{t('store.perm.network.note')}</p>:null}{row.reason?<p className="store-perm-body">{t('store.perm.reason',{reason:row.reason})}</p>:null}</div></li>;
}
export function CannotRow(){
 const {t}=useT();
 return <li className="store-perm"><span className="store-perm-icon" aria-hidden="true"><XIcon size={18}/></span><div><p className="store-perm-title">{t('store.access.cannot')}</p><p className="store-perm-body">{t('store.access.cannot.body')}</p></div></li>;
}
export function EvidenceList({rows,now,lastTrustedCheck,hasEvidence}:{rows:EvidenceRow[];now:number;lastTrustedCheck:number|null;hasEvidence:boolean}){
 const {t,locale}=useT();const age=useAge();
 return <ul className="store-ev">{rows.map(r=>{
  const detail=r.id==='revocation'?(lastTrustedCheck===null?t('store.ev.never'):t('store.ev.checkedAgo',{age:age(lastTrustedCheck,now)})):r.status==='not-run'&&!hasEvidence?t('store.ev.none'):r.id==='permission'?t('store.ev.permission'):`${t(r.detailKey,r.params)}${r.date?` · ${fmtDate(r.date,locale)}`:''}`;
  return <li key={r.id} className="store-ev-row" data-status={r.status}><div><p className="store-ev-title">{t(`store.ev.${r.id}.title`)}</p><p className="store-ev-detail">{detail}</p></div><StatusChip tone={r.tone}>{t(r.chipKey)}</StatusChip></li>;})}</ul>;
}
/** Tablist with roving focus and arrow keys. */
export function TabList<T extends string>({tabs,value,onChange,label,idPrefix}:{tabs:{id:T;label:string}[];value:T;onChange:(v:T)=>void;label:string;idPrefix:string}){
 const refs=useRef<Record<string,HTMLButtonElement|null>>({});
 const key=(e:KeyboardEvent)=>{const i=tabs.findIndex(x=>x.id===value);let n=i;if(e.key==='ArrowRight')n=(i+1)%tabs.length;else if(e.key==='ArrowLeft')n=(i-1+tabs.length)%tabs.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=tabs.length-1;else return;e.preventDefault();onChange(tabs[n].id);refs.current[tabs[n].id]?.focus();};
 return <div className="store-tabs" role="tablist" aria-label={label} onKeyDown={key}>{tabs.map(x=><button key={x.id} ref={el=>{refs.current[x.id]=el;}} type="button" role="tab" id={`${idPrefix}-tab-${x.id}`} aria-selected={value===x.id} aria-controls={`${idPrefix}-panel`} tabIndex={value===x.id?0:-1} className="store-tab" onClick={()=>onChange(x.id)}>{x.label}</button>)}</div>;
}
/** Nested modal. Focus trap and Escape come from the dialog primitive; Escape closes only this modal. */
export function StoreModal({open,onClose,title,subtitle,children,wide=false}:{open:boolean;onClose:()=>void;title:string;subtitle?:ReactNode;children:ReactNode;wide?:boolean}){
 const {t}=useT();
 return <Dialog open={open} onOpenChange={o=>{if(!o)onClose();}}><DialogContent className={`store-modal${wide?' store-modal-wide':''}`} aria-label={title}>
  <div className="store-modal-head"><div><DialogTitle render={<h2 className="store-modal-title"/>}>{title}</DialogTitle>{subtitle?<p className="store-modal-sub">{subtitle}</p>:null}</div><button type="button" className="ext-close" aria-label={t('store.close')} onClick={onClose}><XIcon size={18} aria-hidden="true"/></button></div>
  {children}</DialogContent></Dialog>;
}
export function StoreLogo({card,size=46}:{card:Pick<StoreCard,'name'>;size?:number}){return <Logo name={card.name} size={size}/>;}
