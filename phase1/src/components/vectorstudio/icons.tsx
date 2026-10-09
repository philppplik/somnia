import type {IconProps} from '../../lib/icons';
/** Tool glyphs that the shared Vadivam set does not provide, drawn on the same 24px grid (stroke 2, round caps). */
const svg=(d:string)=>({size=24,strokeWidth=2,...rest}:IconProps)=><svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}><path d={d}/></svg>;
export const PenNibIcon=svg('M12 3l6 8-2.5 7.5h-7L6 11l6-8zM12 3v8m-3 7.5L8 21h8l-1-2.5');
export const StarIcon=svg('M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z');
export const PolygonIcon=svg('M12 3l8 5.8-3 9.4H7l-3-9.4L12 3z');
export const NodeIcon=svg('M5 19L19 5M3.5 17.5h3v3h-3zM17.5 3.5h3v3h-3z');
export const ToFrontIcon=svg('M7 11l5-5 5 5M7 18l5-5 5 5');
