import {ChevronRight} from '../lib/icons';
import {patchState,useAppStore} from '../store/appStore';
import {crumbLabel,offsetOf,pathAtOffset,pathToId} from '../lib/breadcrumbs';
/** DOM path of the selected element (or of the code cursor when nothing is selected), like Dreamweaver's tag selector. A click selects that element; code and design follow the selection. */
export function Breadcrumbs(){
 const s=useAppStore();
 let path=pathToId(s.nodes,s.selectedElementId);
 if(!path.length&&s.viewMode!=='design'&&s.activeFile===s.designFile)path=pathAtOffset(s.nodes,offsetOf(s.files[s.activeFile]??'',s.cursorLine,s.cursorCol));
 if(!path.length)return <span className="grow"/>;
 return <nav aria-label="Element path" data-testid="breadcrumbs" className="flex min-w-0 grow items-center gap-0.5 overflow-hidden">{path.map((n,i)=><span key={n.id} className="flex shrink-0 items-center gap-0.5 last:shrink last:min-w-0">{i>0&&<ChevronRight size={10} aria-hidden className="text-ink-3"/>}<button aria-label={`Select ${crumbLabel(n)}`} aria-current={i===path.length-1?'true':undefined} onClick={()=>patchState({selectedElementId:n.id,selectedElementIds:[n.id]})} className="max-w-[140px] cursor-pointer truncate rounded-sm border-0 bg-transparent px-1 py-0.5 font-mono text-[10px] text-ink-2 hover:bg-hover hover:text-ink aria-[current=true]:bg-accent-soft aria-[current=true]:text-accent">{crumbLabel(n)}</button></span>)}</nav>;}
