import {pageSetupProblem,type PageBorderStyle,type PageNumFormat,type PageSetupPatch,type PageSetupState,type PageVAlign} from './protocol';
export interface PageLookForm{valign:PageVAlign;start:string;format:PageNumFormat;border:boolean;style:PageBorderStyle;width:string;color:string;/** `#RRGGBB` or '' for no page colour. */pageColor:string;tab:string}
export const lookFromState=(s:PageSetupState):PageLookForm=>({valign:s.valign??'top',start:s.pageNumbers?.start==null?'':String(s.pageNumbers.start),format:s.pageNumbers?.format??'decimal',border:!!s.pageBorder,style:s.pageBorder?.style??'single',width:String(s.pageBorder?.width??1),color:s.pageBorder?.color??'#000000',pageColor:s.pageColor??'',tab:s.defaultTab==null?'':String(s.defaultTab)});
/** Only what changed; null when nothing changed or a typed value is not valid. */
export function buildLookPatch(a:PageLookForm,b:PageLookForm):PageSetupPatch|null{
 const p:PageSetupPatch={};
 if(b.valign!==a.valign)p.valign=b.valign;
 const n:NonNullable<PageSetupPatch['pageNumbers']>={};
 if(b.start!==a.start){if(b.start===''){n.start=null;}else{if(!/^\d{1,4}$/.test(b.start))return null;n.start=Number(b.start);}}
 if(b.format!==a.format)n.format=b.format;
 if(Object.keys(n).length)p.pageNumbers=n;
 if(!b.border){if(a.border)p.pageBorder=null;}
 else if(!a.border||b.style!==a.style||b.width!==a.width||b.color!==a.color){
  if(!/^\d{1,2}([.,]\d{1,2})?$/.test(b.width))return null;
  p.pageBorder={style:b.style,width:Number(b.width.replace(',','.')),color:b.color};
 }
 if(b.pageColor!==a.pageColor){if(b.pageColor===''){p.pageColor=null;}else{if(!/^#[0-9a-fA-F]{6}$/.test(b.pageColor))return null;p.pageColor=b.pageColor;}}
 if(b.tab!==a.tab){if(!/^\d{1,3}([.,]\d{1,2})?$/.test(b.tab))return null;p.defaultTab=Number(b.tab.replace(',','.'));}
 return Object.keys(p).length>0&&pageSetupProblem(p)===null?p:null;
}
/** Swatch shown in the colour input while no page colour is set. */
export const PAGE_COLOR_SWATCH='#ffffff';
