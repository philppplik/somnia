import {FolderOpen,Code2} from '../lib/icons';
import {executeCommand} from '../lib/commands';
import {Button} from './ui/button';
import {StudioEmptyState} from './studios/StudioEmptyState';
import {createBlankProject} from '../lib/studios/blank';
import {useT} from '../lib/useT';
/** Shown instead of the editor while no project is open. */
export function EmptyState(){
 const {t}=useT();
 return <main className="center" aria-label={t('finish2.workspace')}><div className="flex h-full w-full rounded-[var(--r-panel)] bg-panel" data-testid="empty-state">
  <StudioEmptyState studio="code" icon={<Code2/>} onOpen={()=>executeCommand('project.openFile')} onCreate={()=>createBlankProject('code')} extraActions={<Button onClick={()=>void executeCommand('project.open')}><FolderOpen size={14}/>Open folder</Button>}/>
 </div></main>;
}
