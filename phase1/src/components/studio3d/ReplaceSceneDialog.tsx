import {useEffect,useRef} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../ui/dialog';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
/** Actual alert dialog semantics/focus management. No scene mutation inside this wrapper. */
export function ReplaceSceneDialog({open,onConfirm,onCancel}:{open:boolean;onConfirm:()=>void;onCancel:()=>void}){
 const {t}=useT();const returnFocus=useRef<HTMLElement|null>(null);useEffect(()=>{if(open)returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;},[open]);return <Dialog open={open} onOpenChange={value=>{if(!value)onCancel();}}><DialogContent role="alertdialog" finalFocus={()=>returnFocus.current?.isConnected?returnFocus.current:null} className="dlg-popup" data-testid="studio3d-replace"><div className="p-4"><DialogTitle>{t('studio3d.replace.title')}</DialogTitle><DialogDescription>{t('studio3d.replace.message')}</DialogDescription><div className="mt-3 flex gap-2"><Button type="button" variant="outline" onClick={onCancel} autoFocus>{t('studio3d.replace.cancel')}</Button><Button type="button" variant="primary" onClick={onConfirm}>{t('studio3d.replace.confirm')}</Button></div></div></DialogContent></Dialog>;
}
