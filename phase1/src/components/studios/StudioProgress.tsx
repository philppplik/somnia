import type {ReactNode} from 'react';
import {Button} from '../ui/button';
/** Progress presentation only. Real cancellation callback required to offer Cancel. */
export function StudioProgress({label,value,max,cancelLabel,onCancel,progressTestId,cancelTestId,children}:{label:string;value?:number;max?:number;cancelLabel?:string;onCancel?:()=>void;progressTestId?:string;cancelTestId?:string;children?:ReactNode}){
 const total=max!==undefined&&Number.isFinite(max)&&max>0?max:1;const progress=value!==undefined&&Number.isFinite(value)?Math.max(0,Math.min(total,value)):undefined;
 return <div data-slot="studio-progress" aria-busy="true" className="grid gap-1" role="status" aria-live="polite" aria-atomic="true"><progress className="h-2 w-full accent-accent-fill" aria-label={label} max={total} value={progress} data-testid={progressTestId}/><span className="text-xs text-ink-2">{label}</span>{onCancel&&cancelLabel&&<Button type="button" size="compact" variant="outline" onClick={onCancel} data-testid={cancelTestId}>{cancelLabel}</Button>}{children}</div>;
}
