import type {ChartPalette,ChartInfo,ChartOp,ChartScene,Prim,SparklineOp,SparklineScene} from './protocol';
/** Charts and sparklines: validation of untrusted command input and of bridge answers, and the drawing of the bridge's primitives as an SVG image.
 *  The Rust bridge re-validates every field. */
export const CHART_TYPES=['column','bar','line','pie','doughnut','area','scatter','radar','histogram','waterfall','funnel','treemap'] as const;
export const CHART_SUBTYPES=['clustered','stacked','stacked100','markers','lines'] as const;
export const LEGENDS=['none','bottom','top','left','right'] as const;
export const CHART_PALETTES=['colorful','monochrome','accent1','accent2','accent3','accent4','accent5','accent6'] as const;
/** Series colors the panel offers (the engine accepts any #rrggbb). */
export const CHART_COLORS={blue:'#2f6fd0',red:'#c0392b',green:'#2e8b57',orange:'#e08a1e',purple:'#7d4cc2',teal:'#1f9a9a',pink:'#d6458f',gray:'#6b7280'} as const;
export const MAX_SERIES=64;
export const SPARKLINE_TYPES=['line','column','winLoss'] as const;
export const MAX_CHARTS=50,MAX_SPARKLINES=500,MAX_PRIMS=20_000,MAX_TITLE_CHARS=120,MIN_CHART_PX=20,MAX_CHART_PX=4000;
const titleBad=(v:unknown)=>typeof v!=='string'||[...v].length>MAX_TITLE_CHARS||/[\u0000-\u001f\u007f]/.test(v);
const intIn=(v:unknown,lo:number,hi:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=lo&&v<=hi;
const oneOf=(list:readonly string[],v:unknown)=>typeof v==='string'&&list.includes(v);
export function parseChartCommand(input:unknown):ChartOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Chart operation must be an object.');
 const o=input as Record<string,unknown>,only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown chart field.');};
 const id=()=>{if(!intIn(o.chart,0,4294967295))throw Error('Pick a chart.');return o.chart as number;};
 const type=(out:Record<string,unknown>)=>{if(o.type!==undefined){if(!oneOf(CHART_TYPES,o.type))throw Error('Unsupported chart type.');out.type=o.type;}if(o.subtype!==undefined){if(!oneOf(CHART_SUBTYPES,o.subtype))throw Error('Unsupported chart subtype.');out.subtype=o.subtype;}};
 switch(o.kind){
  case 'create':{only('kind','type','subtype','title');const out:Record<string,unknown>={kind:'create'};type(out);if(o.title!==undefined){if(titleBad(o.title))throw Error('Invalid chart title.');out.title=o.title;}return out as ChartOp;}
  case 'set':{only('kind','chart','type','subtype','title','legend','dataLabels','gridlines','style','xTitle','yTitle','at','width','height');const out:Record<string,unknown>={kind:'set',chart:id()};type(out);
   for(const k of ['title','xTitle','yTitle'])if(o[k]!==undefined){if(titleBad(o[k]))throw Error('Invalid chart text.');out[k]=o[k];}
   if(o.legend!==undefined){if(!oneOf(LEGENDS,o.legend))throw Error('Unsupported legend position.');out.legend=o.legend;}
   for(const k of ['dataLabels','gridlines'])if(o[k]!==undefined){if(typeof o[k]!=='boolean')throw Error('`'+k+'` must be true or false.');out[k]=o[k];}
   if(o.style!==undefined){if(!intIn(o.style,1,16))throw Error('Style must be 1 to 16.');out.style=o.style;}
   if(o.at!==undefined){if(typeof o.at!=='string'||!/^[A-Za-z]{1,3}[0-9]{1,7}$/.test(o.at))throw Error('`at` must be a cell like H2.');out.at=o.at.toUpperCase();}
   for(const k of ['width','height'])if(o[k]!==undefined){if(!intIn(o[k],MIN_CHART_PX,MAX_CHART_PX))throw Error('Size must be '+MIN_CHART_PX+' to '+MAX_CHART_PX+' pixels.');out[k]=o[k];}
   if(Object.keys(out).length<3)throw Error('Name at least one chart setting.');return out as ChartOp;}
  case 'switch':case 'delete':only('kind','chart');return {kind:o.kind,chart:id()};
  case 'palette':{only('kind','chart','palette');if(!oneOf(CHART_PALETTES,o.palette))throw Error('Unsupported palette.');return {kind:'palette',chart:id(),palette:o.palette as ChartPalette};}
  case 'color':{only('kind','chart','series','color');if(!intIn(o.series,0,MAX_SERIES-1))throw Error('Pick a data series.');if(typeof o.color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(o.color))throw Error('Color must be like #2f6fd0.');return {kind:'color',chart:id(),series:o.series as number,color:o.color.toLowerCase()};}
  case 'data':{only('kind','chart','byRows');const out:ChartOp={kind:'data',chart:id()};if(o.byRows!==undefined){if(typeof o.byRows!=='boolean')throw Error('`byRows` must be true or false.');out.byRows=o.byRows;}return out;}
  case 'layout':{only('kind','chart','layout');if(!intIn(o.layout,1,6))throw Error('Layout must be 1 to 6.');return {kind:'layout',chart:id(),layout:o.layout as number};}
  case 'element':{only('kind','chart','element','on');if(o.element!=='title'&&o.element!=='axisTitles')throw Error('Unsupported chart element.');if(typeof o.on!=='boolean')throw Error('`on` must be true or false.');return {kind:'element',chart:id(),element:o.element,on:o.on};}
  case 'moveSheet':{only('kind','chart','sheet');if(typeof o.sheet!=='string'||o.sheet===''||[...o.sheet].length>64||/[\u0000-\u001f\u007f]/.test(o.sheet))throw Error('Name the sheet to move the chart to.');return {kind:'moveSheet',chart:id(),sheet:o.sheet};}
  default:throw Error('Unsupported chart operation.');
 }
}
export function parseSparklineCommand(input:unknown):SparklineOp{
 if(input===undefined)return {};
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Sparkline operation must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>k!=='type'&&k!=='markers'))throw Error('Unknown sparkline field.');
 const out:SparklineOp={};if(o.type!==undefined){if(!oneOf(SPARKLINE_TYPES,o.type))throw Error('Unsupported sparkline type.');out.type=o.type as SparklineOp['type'];}
 if(o.markers!==undefined){if(typeof o.markers!=='boolean')throw Error('`markers` must be true or false.');out.markers=o.markers;}return out;
}
/** null when a block can feed a sparkline: one row or one column of 2 to 500 cells. */
export function sparklineBlockProblem(rows:number,cols:number):'shape'|null{
 const ok=Number.isInteger(rows)&&Number.isInteger(cols)&&((rows===1&&cols>=2)||(cols===1&&rows>=2))&&rows*cols<=500;return ok?null:'shape';
}
const num=(v:unknown,d=0)=>typeof v==='number'&&Number.isFinite(v)?v:d;
export function parseCharts(raw:unknown):ChartInfo[]{
 if(!Array.isArray(raw))return [];const out:ChartInfo[]=[];
 for(const c of raw.slice(0,MAX_CHARTS)){const r=c as Record<string,unknown>|null;if(!r||typeof r!=='object'||!intIn(r.id,0,4294967295))continue;
  out.push({id:r.id as number,kind:typeof r.kind==='string'?r.kind.slice(0,40):'',title:typeof r.title==='string'?r.title.slice(0,MAX_TITLE_CHARS):null,row:num(r.row),col:num(r.col),dx:num(r.dx),dy:num(r.dy),width:Math.max(MIN_CHART_PX,Math.min(MAX_CHART_PX,num(r.width,480))),height:Math.max(MIN_CHART_PX,Math.min(MAX_CHART_PX,num(r.height,288))),legend:typeof r.legend==='string'?r.legend.slice(0,12):'',dataLabels:r.dataLabels===true,gridlines:r.gridlines===true,style:num(r.style,1),series:num(r.series)});}
 return out;
}
type Rgba=[number,number,number,number];
const color=(v:unknown):Rgba|null=>Array.isArray(v)&&v.length===4&&v.every(n=>intIn(n,0,255))?v as unknown as Rgba:null;
const stroke=(v:unknown):{c:Rgba;w:number}|null=>{if(!Array.isArray(v)||v.length!==2)return null;const c=color(v[0]);return c&&typeof v[1]==='number'&&Number.isFinite(v[1])?{c,w:Math.max(0,Math.min(50,v[1]))}:null;};
const pts=(v:unknown):[number,number][]|null=>Array.isArray(v)&&v.length<=20_000&&v.every(p=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1]))?v as [number,number][]:null;
/** Keeps only well-formed primitives (at most 20,000); anything else from the bridge is dropped. */
export function parsePrims(raw:unknown):Prim[]{
 if(!Array.isArray(raw))return [];const out:Prim[]=[];
 for(const p of raw.slice(0,MAX_PRIMS)){
  if(!p||typeof p!=='object')continue;const [tag,body]=Object.entries(p as Record<string,unknown>)[0]??[];const b=body as Record<string,unknown>|null;if(!b||typeof b!=='object')continue;
  const n=(k:string)=>typeof b[k]==='number'&&Number.isFinite(b[k] as number)?b[k] as number:null;
  if(tag==='Rect'){const x=n('x'),y=n('y'),w=n('w'),h=n('h');if(x!==null&&y!==null&&w!==null&&h!==null)out.push({t:'rect',x,y,w,h,fill:color(b.fill),stroke:stroke(b.stroke),radius:Math.max(0,n('radius')??0)});}
  else if(tag==='Line'){const pp=pts(b.pts),c=color(b.color),w=n('width');if(pp&&c&&w!==null)out.push({t:'line',pts:pp,color:c,width:Math.max(0,Math.min(50,w)),dash:b.dash===true});}
  else if(tag==='Polygon'){const pp=pts(b.pts),f=color(b.fill);if(pp&&f)out.push({t:'polygon',pts:pp,fill:f,stroke:stroke(b.stroke)});}
  else if(tag==='Wedge'){const cx=n('cx'),cy=n('cy'),ro=n('r_outer'),ri=n('r_inner'),a0=n('a0'),a1=n('a1'),f=color(b.fill);if(cx!==null&&cy!==null&&ro!==null&&ri!==null&&a0!==null&&a1!==null&&f)out.push({t:'wedge',cx,cy,ro,ri,a0,a1,fill:f,stroke:stroke(b.stroke)});}
  else if(tag==='Circle'){const cx=n('cx'),cy=n('cy'),r=n('r');if(cx!==null&&cy!==null&&r!==null)out.push({t:'circle',cx,cy,r:Math.max(0,r),fill:color(b.fill),stroke:stroke(b.stroke)});}
  else if(tag==='Text'){const x=n('x'),y=n('y'),size=n('size'),c=color(b.color);if(x!==null&&y!==null&&size!==null&&c&&typeof b.text==='string')out.push({t:'text',x,y,text:b.text.slice(0,200),size:Math.max(1,Math.min(200,size)),color:c,bold:b.bold===true,align:b.align==='Center'?'middle':b.align==='Right'?'end':'start',valign:b.valign==='Middle'?'central':b.valign==='Top'?'hanging':'auto',rotation:n('rotation')??0});}
 }
 return out;
}
export function parseScene(raw:unknown):ChartScene|null{
 const r=raw as Record<string,unknown>|null;if(!r||typeof r!=='object'||!num(r.width)||!num(r.height))return null;
 return {width:Math.max(1,Math.min(MAX_CHART_PX,num(r.width))),height:Math.max(1,Math.min(MAX_CHART_PX,num(r.height))),prims:parsePrims(r.prims)};
}
export function parseSparklines(raw:unknown):SparklineScene[]{
 if(!Array.isArray(raw))return [];const out:SparklineScene[]=[];
 for(const s of raw.slice(0,MAX_SPARKLINES)){const r=s as Record<string,unknown>|null;const sc=parseScene(r);if(r&&sc&&intIn(r.row,0,1048575)&&intIn(r.col,0,16383))out.push({row:r.row as number,col:r.col as number,...sc});}
 return out;
}
const f2=(n:number)=>String(Math.round(n*100)/100);
const rgba=(c:Rgba)=>`rgba(${c[0]},${c[1]},${c[2]},${f2(c[3]/255)})`;
const esc=(t:string)=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const strokeAttr=(s:{c:Rgba;w:number}|null)=>s?` stroke="${rgba(s.c)}" stroke-width="${f2(s.w)}"`:'';
const fillAttr=(c:Rgba|null)=>c?` fill="${rgba(c)}"`:' fill="none"';
const polar=(cx:number,cy:number,r:number,a:number)=>`${f2(cx+r*Math.sin(a))} ${f2(cy-r*Math.cos(a))}`;
function wedgePath(p:Extract<Prim,{t:'wedge'}>):string{
 const span=p.a1-p.a0,full=Math.abs(span)>=Math.PI*2-1e-4;
 if(full){const ring=(r:number)=>`M ${f2(p.cx-r)} ${f2(p.cy)} a ${f2(r)} ${f2(r)} 0 1 0 ${f2(2*r)} 0 a ${f2(r)} ${f2(r)} 0 1 0 ${f2(-2*r)} 0 Z`;return p.ri>0?ring(p.ro)+' '+ring(p.ri):ring(p.ro);}
 const large=Math.abs(span)>Math.PI?1:0,sweep=span>=0?1:0;
 const outer=`M ${polar(p.cx,p.cy,p.ro,p.a0)} A ${f2(p.ro)} ${f2(p.ro)} 0 ${large} ${sweep} ${polar(p.cx,p.cy,p.ro,p.a1)}`;
 return p.ri>0?`${outer} L ${polar(p.cx,p.cy,p.ri,p.a1)} A ${f2(p.ri)} ${f2(p.ri)} 0 ${large} ${1-sweep} ${polar(p.cx,p.cy,p.ri,p.a0)} Z`:`${outer} L ${f2(p.cx)} ${f2(p.cy)} Z`;
}
/** The primitives as a standalone SVG document (text is escaped; no scripts or links), for use as an image. */
export function sceneToSvg(scene:ChartScene):string{
 const w=f2(scene.width),h=f2(scene.height),body:string[]=[];
 for(const p of scene.prims){
  switch(p.t){
   case 'rect':body.push(`<rect x="${f2(p.x)}" y="${f2(p.y)}" width="${f2(p.w)}" height="${f2(p.h)}" rx="${f2(p.radius)}"${fillAttr(p.fill)}${strokeAttr(p.stroke)}/>`);break;
   case 'line':body.push(`<polyline points="${p.pts.map(q=>f2(q[0])+','+f2(q[1])).join(' ')}" fill="none" stroke="${rgba(p.color)}" stroke-width="${f2(p.width)}"${p.dash?' stroke-dasharray="4 3"':''} stroke-linejoin="round"/>`);break;
   case 'polygon':body.push(`<polygon points="${p.pts.map(q=>f2(q[0])+','+f2(q[1])).join(' ')}"${fillAttr(p.fill)}${strokeAttr(p.stroke)}/>`);break;
   case 'wedge':body.push(`<path d="${wedgePath(p)}" fill-rule="evenodd"${fillAttr(p.fill)}${strokeAttr(p.stroke)}/>`);break;
   case 'circle':body.push(`<circle cx="${f2(p.cx)}" cy="${f2(p.cy)}" r="${f2(p.r)}"${fillAttr(p.fill)}${strokeAttr(p.stroke)}/>`);break;
   case 'text':body.push(`<text x="${f2(p.x)}" y="${f2(p.y)}" font-size="${f2(p.size)}" font-family="sans-serif"${p.bold?' font-weight="700"':''} fill="${rgba(p.color)}" text-anchor="${p.align}" dominant-baseline="${p.valign}"${p.rotation?` transform="rotate(${f2(p.rotation*180/Math.PI)} ${f2(p.x)} ${f2(p.y)})"`:''}>${esc(p.text)}</text>`);break;
  }
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body.join('')}</svg>`;
}
export const svgDataUrl=(svg:string)=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
