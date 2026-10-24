/** Camera safe-frame guides: the classic broadcast action-safe and title-safe rectangles as fractions of the frame. Pure data, node-testable; the viewport draws them as a DOM overlay so they never end up in renders or exports. */
export interface SafeFrameRect{/** Inset from every edge as a fraction of the frame (0..0.5). */inset:number;label:'action'|'title';}
export const SAFE_FRAMES:readonly SafeFrameRect[]=[{inset:0.05,label:'action'},{inset:0.1,label:'title'}];
/** Overlay colour, kept in lib so components carry no raw colour literals. */
export const SAFE_FRAME_COLOR='#f2c14e';
