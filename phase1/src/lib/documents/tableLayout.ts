import {tableLayoutProblem,type TableLayoutPatch,type TableLayoutState} from './protocol';
export interface TableLayoutForm{align:'auto'|'left'|'center'|'right';width:string;header:boolean;keep:boolean;valign:'top'|'center'|'bottom';caption:string;rowRule:'auto'|'atLeast'|'exact';rowHeight:string;allRows:boolean}
export const layoutFromState=(s:TableLayoutState):TableLayoutForm=>({align:s.align??'auto',width:s.widthPct==null?'':String(Math.round(s.widthPct)),header:s.headerRow,keep:s.keepRows,valign:s.cellValign,caption:s.caption,rowRule:s.rowRule??'auto',rowHeight:s.rowHeight==null?'':String(s.rowHeight),allRows:false});
/** Only what changed; null when nothing changed or the width is not a whole number from 10 to 100. An empty width means automatic. */
export function buildLayoutPatch(a:TableLayoutForm,b:TableLayoutForm):TableLayoutPatch|null{
 const p:TableLayoutPatch={};
 if(b.align!==a.align)p.align=b.align==='auto'?null:b.align;
 if(b.width!==a.width){if(b.width==='')p.widthPct=null;else{if(!/^\d{2,3}$/.test(b.width))return null;p.widthPct=Number(b.width);}}
 if(b.header!==a.header)p.headerRow=b.header;
 if(b.keep!==a.keep)p.keepRows=b.keep;
 if(b.valign!==a.valign)p.cellValign=b.valign;
 if(b.caption!==a.caption)p.caption=b.caption;
 if(b.rowRule!==a.rowRule||b.rowHeight!==a.rowHeight||b.allRows){
  if(b.rowRule==='auto'){if(b.rowHeight!==a.rowHeight||b.rowRule!==a.rowRule||b.allRows)p.rowHeight={rule:'auto'};}
  else{const v=Number(b.rowHeight);if(b.rowHeight.trim()===''||!Number.isFinite(v))return null;p.rowHeight={rule:b.rowRule,value:v};}
  if(b.allRows)p.allRows=true;
 }
 return Object.keys(p).length>0&&tableLayoutProblem(p)===null?p:null;
}
