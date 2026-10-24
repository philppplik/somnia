import {Button} from './button';
import type {ComponentProps} from 'react';
type Props=Omit<ComponentProps<typeof Button>,'aria-label'|'size'>&{'aria-label':string;size?:'icon'|'row'};
/** Required accessible name at the type boundary. Tooltips remain optional. */
export function IconButton({size='icon',...props}:Props){return <Button data-slot="icon-button" size={size} {...props}/>;}
