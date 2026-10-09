import {useId,type ReactNode} from 'react';
import {Button} from '../ui/button';
import {studioStarterCopy,type StarterStudioId} from '../../lib/studios/starterCopy';

export interface StudioEmptyStateProps {
 studio:StarterStudioId;
 icon:ReactNode;
 onOpen:()=>void|Promise<unknown>;
 onCreate:()=>void|Promise<unknown>;
 testId?:string;
 extraActions?:ReactNode;
}
/** Shared, presentational starter. File intake and blank-project creation stay owned by each studio. */
export function StudioEmptyState({studio,icon,onOpen,onCreate,testId,extraActions}:StudioEmptyStateProps){
 const id=useId();const copy=studioStarterCopy[studio];
 return <section lang="en" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} className="flex min-h-0 w-full flex-1 items-center justify-center overflow-auto p-6 sm:p-8" data-testid={testId??`${studio}-start`}>
  <div className="flex w-full max-w-[460px] flex-col items-center gap-5 py-8 text-center">
   <div aria-hidden="true" className="grid size-14 place-items-center rounded-2xl border border-subtle bg-hover text-ink-2 [&_svg]:size-7">{icon}</div>
   <div><h1 id={`${id}-title`} className="m-0 text-[22px] font-semibold leading-tight text-ink">{copy.headline}</h1>
    <p id={`${id}-body`} className="mx-auto mb-0 mt-3 max-w-[420px] text-[13px] leading-relaxed text-ink-2">{copy.description}</p></div>
   <div className="flex flex-wrap justify-center gap-2">
    <Button variant="primary" onClick={()=>void onOpen()} data-testid={`${studio}-open`}>{copy.openLabel}</Button>
    <Button variant="outline" onClick={()=>void onCreate()} data-testid={`${studio}-create-blank`}>Create blank project</Button>
    {extraActions}
   </div>
   <p className="m-0 text-[11px] leading-relaxed text-ink-3">Your files stay on your device.</p>
  </div>
 </section>;
}
