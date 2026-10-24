import type {ReactNode} from 'react';
/** Peer-presence label/box coloured with the peer's assigned colours at runtime. Dynamic values are set via ref so surfaces stay free of inline-style objects (P0 ratchet). */
export function PeerSwatch({bg,color,className,testId,children}:{bg:string;color?:string;className?:string;testId?:string;children:ReactNode}){
 return <span ref={el=>{if(el){el.style.background=bg;if(color)el.style.color=color;}}} data-testid={testId} className={className}>{children}</span>;
}
/** Absolutely positioned peer selection rectangle; geometry and border colour are dynamic and applied via ref. */
export function PeerSelectionBox({left,top,width,height,color,children}:{left:number;top:number;width:number;height:number;color:string;children?:ReactNode}){
 return <div aria-hidden ref={el=>{if(el){const s=el.style;s.position='absolute';s.left=left+'px';s.top=top+'px';s.width=width+'px';s.height=height+'px';s.border='2px solid '+color;s.pointerEvents='none';s.zIndex='4';}}}>{children}</div>;
}
