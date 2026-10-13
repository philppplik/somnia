import {useEffect,useState} from 'react';
import {Popover} from '@base-ui/react/popover';
import {useT} from '../../lib/useT';
import {commandDispatcher} from '../../lib/commandDispatcher';
import {setDesignExportOpen,useDesignExportOpen} from '../../lib/design/exportState';
import {exportName} from '../../lib/design/exportArtboards';
import {useDesignState} from '../../lib/design/session';
import {Button} from '../ui/button';
export function DesignExportPopover(){
 const {t}=useT(),s=useDesignState(),open=useDesignExportOpen();const [scope,setScope]=useState('current'),[note,setNote]=useState(''),[working,setWorking]=useState(false);
 useEffect(()=>()=>setDesignExportOpen(false),[]);
 const board=s.document?.artboards.find(b=>b.id===s.artboardId);
 const filename=scope==='all'?exportName(s.document?.name??'')+'-artboards.zip':(board?.name??'')+'.svg';
 const run=async(id:string,name:string)=>{setWorking(true);setNote('');try{await commandDispatcher.runCommand(id,undefined,{origin:'ui'});setNote(t('design.hero.download',{name}));}catch(e){setNote(e instanceof Error?e.message:String(e));}finally{setWorking(false);}};
 return <Popover.Root open={open&&!!s.document} onOpenChange={setDesignExportOpen}><Popover.Portal><Popover.Positioner anchor={()=>document.querySelector('[data-hero-id="design.export.open"]')} align="end" sideOffset={8} className="z-50"><Popover.Popup className="menu-popup grid w-[310px] max-w-[calc(100vw-24px)] gap-3 !rounded-[25px] !p-4 text-xs" data-testid="design-export-popover">
  <Popover.Title className="m-0 text-sm font-semibold">{t('design.hero.export')}</Popover.Title>
  <form className="grid gap-3" onSubmit={ev=>{ev.preventDefault();if(!working&&board)void run(scope==='all'?'design.exportAllSvg':'design.exportSvg',filename);}}>
   <label className="grid gap-1">{t('design.hero.scope')}<select autoFocus className="rounded-lg border border-line bg-panel p-2" value={scope} disabled={working} onChange={e=>{setScope(e.target.value);setNote('');}}><option value="current">{t('design.hero.current')}</option><option value="all">{t('design.hero.all')}</option></select></label>
   <p className="m-0 text-ink-3">SVG · {filename}</p>
   <Button variant="primary" className="!text-white" type="submit" disabled={!board||working}>{t('design.hero.export')}</Button>
  </form>
  <Button variant="outline" disabled={!s.document||working} onClick={()=>void run('design.exportProject',`${s.document?.name}.somdesign`)}>{t('design.hero.source')}</Button>
  <p className="m-0 text-ink-2" role="status" aria-live="polite">{note}</p>
 </Popover.Popup></Popover.Positioner></Popover.Portal></Popover.Root>;
}
