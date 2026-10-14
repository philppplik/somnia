import type {ComponentProps} from 'react';
import {cn} from '../../lib/cn';
/** Inline shell status, no toast timer or action ownership. Caller supplies safe localized copy. */
export function StudioStatus({tone='info',live='polite',className,...props}:Omit<ComponentProps<'span'>,'role'|'aria-live'>&{tone?:'info'|'error';live?:'off'|'polite'|'assertive'}){
 return <span data-slot="studio-status" data-tone={tone} role={live==='off'?undefined:live==='assertive'?'alert':'status'} aria-live={live} aria-atomic="true" className={cn(tone==='error'?'text-danger-ink':'text-ink-2',className)} {...props}/>;
}
