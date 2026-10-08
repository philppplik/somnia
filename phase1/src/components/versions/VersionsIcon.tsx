import type {IconProps} from '../../lib/icons';
/** Rail icon: a timeline with a node (same 24px / stroke 2 grid as the Vadivam set). */
export function VersionsIcon({size=24,strokeWidth=2,absoluteStrokeWidth:_a,...rest}:IconProps){
 return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-icon="versions" {...rest}><circle cx="12" cy="12" r="3.5"/><path d="M2 12h6.5M15.5 12H22"/></svg>;}
