import type {ReactNode} from 'react';
import {ResizeHandle} from '../ResizeHandle';
/** Preserve Code's exact grid and DOM. The studio owns the content, the frame owns the side slots. */
export function ShellFrame({leftRail,rightRail,left,right,canvas,communication,leftOpen,rightOpen,leftWidth,rightWidth}:{leftRail:ReactNode;rightRail:ReactNode;left:ReactNode;right:ReactNode;canvas:ReactNode;communication?:ReactNode;leftOpen:boolean;rightOpen:boolean;leftWidth:number;rightWidth:number}){
 return <div className="flex min-h-0 flex-1 gap-1">{leftRail}<div className="editor-layout" style={{gridTemplateColumns:`${leftOpen?`${leftWidth}px var(--gap)`:'0px 0px'} minmax(180px,1fr) ${rightOpen?`var(--gap) ${rightWidth}px`:'0px 0px'}`}}><div className="pane-slot">{leftOpen&&left}</div>{leftOpen?<ResizeHandle side="left"/>:<span/>}{canvas}{rightOpen?<ResizeHandle side="right"/>:<span/>}<div className="pane-slot">{rightOpen&&right}</div></div>{communication}{rightRail}</div>;
}
