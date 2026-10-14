import {NativeButton} from '../ui/native-controls';
import type {ReactNode} from 'react';
export interface StudioRecentEntry{id:string;label:ReactNode;metadata:ReactNode;testId?:string}
/** Presentational recent list only. Storage, availability, timestamps and opening stay studio-owned. */
export function StudioRecentList({title,entries,onOpen,compact=false,testId,footer}:{title:string;entries:readonly StudioRecentEntry[];onOpen:(id:string)=>void;compact?:boolean;testId?:string;footer?:ReactNode}){
 if(!entries.length)return null;return <section className={compact?'grid gap-1':'mx-auto grid w-full max-w-md gap-1 p-4'} aria-label={title} data-testid={testId}><h3 className="m-0 text-xs font-medium text-ink-3">{title}</h3><ul className="m-0 grid list-none gap-1 p-0">{entries.map(entry=><li key={entry.id}><NativeButton type="button" data-slot="recent-action" className="flex w-full items-center justify-between gap-2 rounded-[25px] border border-subtle bg-surface px-3 py-1.5 text-left text-xs text-ink hover:bg-hover" onClick={()=>onOpen(entry.id)} data-testid={entry.testId}><span className="min-w-0 truncate">{entry.label}</span><span className="shrink-0 text-ink-3">{entry.metadata}</span></NativeButton></li>)}</ul>{footer}</section>;
}
