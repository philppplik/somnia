/** Undo history for one video timeline: snapshots of the clip list, capped so long sessions stay cheap. Pure model - no session state. */
import type {TimelineClip} from './timeline';

/** How many edit steps stay undoable. */
export const VIDEO_HISTORY_LIMIT=100;
/** Repeats of the same gesture key inside this window extend the open entry instead of adding one (a trim drag is one undo step). */
export const GESTURE_MS=1000;

export interface VideoHistory{
 past:TimelineClip[][];
 future:TimelineClip[][];
 /** Identifies the continuous gesture holding the newest entry open (trim drag, gain slider, title typing). */
 gestureKey:string|null;
 gestureAt:number;
}

export const emptyVideoHistory=():VideoHistory=>({past:[],future:[],gestureKey:null,gestureAt:0});

/**
 * Records `previous` as an undo step and clears the redo stack (a new edit forks the history).
 * A repeat of the same gesture key within GESTURE_MS keeps the first snapshot of the gesture, so the whole drag undoes in one step.
 */
export function pushHistory(h:VideoHistory,previous:TimelineClip[],gestureKey:string|null,now:number):VideoHistory{
 if(gestureKey&&h.gestureKey===gestureKey&&now-h.gestureAt<GESTURE_MS)return{...h,gestureAt:now};
 const past=[...h.past,previous];
 if(past.length>VIDEO_HISTORY_LIMIT)past.shift();
 return{past,future:[],gestureKey,gestureAt:now};
}

/** Steps one edit back: the newest snapshot becomes current, the current state lands on the redo stack. Null when nothing to undo. */
export function undoHistory(h:VideoHistory,current:TimelineClip[]):{history:VideoHistory;clips:TimelineClip[]}|null{
 if(!h.past.length)return null;
 const clips=h.past[h.past.length-1];
 return{history:{past:h.past.slice(0,-1),future:[...h.future,current],gestureKey:null,gestureAt:0},clips};
}

/** Re-applies the newest undone edit. Null when nothing to redo. */
export function redoHistory(h:VideoHistory,current:TimelineClip[]):{history:VideoHistory;clips:TimelineClip[]}|null{
 if(!h.future.length)return null;
 const clips=h.future[h.future.length-1];
 return{history:{past:[...h.past,current],future:h.future.slice(0,-1),gestureKey:null,gestureAt:0},clips};
}
