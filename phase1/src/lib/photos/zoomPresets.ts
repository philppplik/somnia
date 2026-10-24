/** Zoom preset stops (scale factors) offered as one-click levels in the photo workspace bar. */
export const ZOOM_PRESETS:readonly number[]=[0.5,1,2,4];

/** True when the explicit zoom (null = fit-to-window) currently sits on a preset stop. */
export function isZoomPresetActive(zoom:number|null,preset:number):boolean{
 return zoom!==null&&Math.abs(zoom-preset)<1e-6;
}

/** Short percent label for a preset stop, e.g. 0.5 -> "50%". */
export function zoomPresetLabel(preset:number):string{
 return `${Math.round(preset*100)}%`;
}
