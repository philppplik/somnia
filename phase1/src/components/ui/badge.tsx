// Reshaped from shadcn Badge (MIT), Somnia tokens.
import type {ComponentProps} from 'react';
import {cn} from '../../lib/cn';
export function Badge({className,...props}:ComponentProps<'span'>){return <span data-slot="badge" className={cn('whitespace-nowrap rounded-[4px] border border-line px-1.5 py-0.5 text-[10px] tracking-[.02em] text-ink-2',className)} {...props}/>;}
