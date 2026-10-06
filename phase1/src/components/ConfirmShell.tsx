import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Folder,X,type LucideIcon} from 'lucide-react';
import {useT} from '../lib/useT';
/** Shared layout for the Save / unsaved-changes dialogs: Export popup language (25px panel, header tile, close X, file card, hairline footer). */
export function FileCard({name,status}:{name:string;status:string}){
 return <div className="dlg-card"><span className="dlg-card-icon" aria-hidden="true"><Folder size={18}/></span><div className="dlg-card-text"><strong title={name}>{name}</strong><span><i className="dlg-dot" aria-hidden="true"/>{status}</span></div></div>;
}
export function ConfirmShell({open,onCancel,busy,tone,Icon,ariaLabel,title,description,body,footer,alert}:{open:boolean;onCancel:()=>void;busy?:boolean;tone:'accent'|'warning';Icon:LucideIcon;ariaLabel:string;title:string;description:string;body:ReactNode;footer:ReactNode;alert?:boolean}){
 const {t}=useT();
 return <Dialog open={open} onOpenChange={o=>{if(!o&&!busy)onCancel();}}><DialogContent className="dlg-popup" {...(alert?{role:'alertdialog'}:{})} aria-label={ariaLabel}>
  <header className="dlg-head">
   <span className="dlg-tile" data-tone={tone} aria-hidden="true"><Icon size={20}/></span>
   <div className="dlg-head-text"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></div>
  </header>
  <div className="dlg-body">{body}</div>
  <Foot>{footer}</Foot>
  <button type="button" className="dlg-close" aria-label={t('set.close.aria')} title={t('set.close')} onClick={onCancel} disabled={busy}><X size={16} aria-hidden="true"/></button>
 </DialogContent></Dialog>;
}

/** Footer stays on one row when it fits; otherwise it stacks full width (primary on top). Measured, so long translations switch correctly. */
function Foot({children}:{children:ReactNode}){
 const ref=useRef<HTMLElement>(null);const [stack,setStack]=useState(false);const {locale}=useT();
 useLayoutEffect(()=>{const el=ref.current;if(!el)return;
  const measure=()=>{el.dataset.stack='false';const over=el.scrollWidth>el.clientWidth+1;el.dataset.stack=String(over);setStack(over);};
  measure();const ro=new ResizeObserver(measure);ro.observe(el.parentElement!);return()=>ro.disconnect();},[children,locale]);
 return <footer className="dlg-foot" ref={ref} data-stack={stack}>{children}</footer>;
}
