/** Divider position for the before/after split view, normalized 0..1 across the displayed frame. */
export const clampSplitX=(x:number)=>Math.min(0.98,Math.max(0.02,Number.isFinite(x)?x:0.5));
export type SplitDirection='vertical'|'horizontal';
export interface SplitClearRect{x:number;y:number;width:number;height:number;}
/** Region of the original-frame overlay to erase so the developed frame shows through: right of a vertical divider, below a horizontal one. */
export function splitClearRect(frameWidth:number,frameHeight:number,splitX:number,direction:SplitDirection='vertical'):SplitClearRect{
 if(direction==='horizontal'){
  const y=Math.round(clampSplitX(splitX)*frameHeight);
  return{x:0,y,width:frameWidth,height:frameHeight-y};
 }
 const x=Math.round(clampSplitX(splitX)*frameWidth);
 return{x,y:0,width:frameWidth-x,height:frameHeight};
}
