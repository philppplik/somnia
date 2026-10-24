import type {ComponentProps} from 'react';
import {cn} from '../../lib/cn';
/** No default live announcements. Caller chooses urgency and provides localized/safe copy. */
export function Notice({tone='info',live='off',className,...props}:Omit<ComponentProps<'p'>,'aria-live'|'role'>&{tone?:'info'|'success'|'warning'|'danger';live?:'off'|'polite'|'assertive'}){
 return <p data-slot="notice" data-tone={tone} className={cn('ds-notice',className)} role={live==='assertive'?'alert':live==='polite'?'status':undefined} aria-live={live} {...props}/>;
}
