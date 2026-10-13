// Bottom panel above the status bar: Problems and Terminal tabs share one collapsible strip.
// `problemsOpen` is the strip visibility (Mod+J / Mod+Shift+J), `bottomTab` the active tab.
import {useAppStore,patchState} from '../store/appStore';
import {useT} from '../lib/useT';
import {ProblemsPanel} from './ProblemsPanel';
import {TerminalPanel} from './TerminalPanel';

export function BottomPanel(){
 const {t}=useT();
 const state=useAppStore();
 if(!state.problemsOpen)return null;
 return <div className="bottom-panel shrink-0" data-testid="bottom-panel">
  <div className="flex items-center gap-1 border-t border-subtle bg-panel px-3 pt-1.5" role="tablist" aria-label={t('terminal.bottomPanel')}>
   {(['problems','terminal'] as const).map(tab=><button
    key={tab}
    role="tab"
    aria-selected={state.bottomTab===tab}
    data-testid={`bottom-tab-${tab}`}
    className={`rounded-t border-b-2 px-2 pb-1 text-[11px] ${state.bottomTab===tab?'border-accent text-ink':'border-transparent text-ink-3 hover:text-ink-2'}`}
    onClick={()=>patchState({bottomTab:tab})}
   >{tab==='problems'?t('panels.problems.problems'):t('terminal.terminal')}</button>)}
  </div>
  {state.bottomTab==='problems'?<ProblemsPanel/>:<TerminalPanel/>}
 </div>;
}
