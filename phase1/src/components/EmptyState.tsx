import {FolderOpen,FileText,FilePlus2} from '../lib/icons';
import {executeCommand} from '../lib/commands';
import {Button} from './ui/button';
import {useT} from '../lib/useT';
/** Shown instead of the editor while no project is open. */
export function EmptyState(){
 const {t}=useT();
 return <main className="center" aria-label={t('finish2.workspace')}><div className="flex h-full w-full flex-col items-center justify-center gap-5 rounded-lg border border-subtle bg-panel p-8 text-center" data-testid="empty-state">
  <div><h1 className="m-0 text-[18px] font-semibold text-ink">{t('empty.title')}</h1>
  <p className="mx-auto mt-2 max-w-[420px] text-[13px] text-ink-2">{t('empty.body')}</p></div>
  <div className="flex flex-wrap justify-center gap-2">
   <Button autoFocus onClick={()=>void executeCommand('project.open')}><FolderOpen size={14}/>{t('empty.openFolder')}</Button>
   <Button onClick={()=>void executeCommand('project.openFile')}><FileText size={14}/>{t('empty.openFile')}</Button>
   <Button onClick={()=>void executeCommand('project.newFile')}><FilePlus2 size={14}/>{t('empty.newFile')}</Button>
  </div>
  <p className="text-[11px] text-ink-3">{t('empty.hint')}</p>
 </div></main>;}
