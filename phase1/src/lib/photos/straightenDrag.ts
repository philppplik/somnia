/** Horizon drag -> straighten angle. Pure math, no pixels: the result feeds the existing
 * straighten develop setting, so the engine renders the rotation and undo/versions work. */

/** Drags shorter than this frame fraction are taps, not horizons: they keep the current angle. */
export const STRAIGHTEN_MIN_LEN=0.05;

/** Angle for a dragged horizon line in normalized frame coords (y down).
 * A line sloping down to the right reads as a clockwise-tilted horizon, so the correction
 * is the negative screen angle: straighten = -atan2(dy,dx). Snapped to 0.1 deg, clamped
 * to the setting's +-45 range. Null when the drag is too short to mean anything. */
export function straightenAngle(x0:number,y0:number,x1:number,y1:number):number|null{
 const dx=x1-x0,dy=y1-y0;
 if(Math.hypot(dx,dy)<STRAIGHTEN_MIN_LEN)return null;
 const deg=-Math.atan2(dy,dx)*180/Math.PI;
 const snapped=Math.round(deg*10)/10||0; // normalize -0: a level line commits exactly 0
 return Math.min(45,Math.max(-45,snapped));
}
