// Reshaped from shadcn Separator (MIT). Vertical by default for toolbars.
import type {ComponentProps} from 'react';
import {cn} from '../../lib/cn';
export function Separator({className,...props}:ComponentProps<'span'>){return <span data-slot="separator" role="separator" aria-orientation="vertical" className={cn('mx-1 h-5 w-px shrink-0 bg-subtle',className)} {...props}/>;}
