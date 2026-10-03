import type {CodeTheme} from '../lib/appearance';
import {lazy,Suspense} from 'react';
import {FileTabs} from './FileTabs';
const SourceEditor=lazy(()=>import('./SourceEditor').then(m=>({default:m.SourceEditor})));
import {DesignCanvas} from './DesignCanvas';
import { useAppStore } from '../store/appStore';
export function Canvas(){
 const state=useAppStore();
 const code=<section className="code-pane" aria-label="Source editor"><FileTabs/><Suspense fallback={<div className="px-3 py-2 text-[10px] text-ink-3">Loading source editor...</div>}><SourceEditor source={state.files[state.activeFile]??''} file={state.activeFile} disabled={!state.coreConnected}/></Suspense></section>;
 return <main className="center" aria-label="Editor workspace"><div className={`workspace workspace-${state.viewMode}`}>{state.viewMode!=='design'&&code}{state.viewMode!=='code'&&<DesignCanvas/>}</div></main>;
}
