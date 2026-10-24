import type {CfIconSet} from './protocol';
import {CF_ICON_SETS} from './cfOps';
/** Draws conditional-format data bars and icon sets. Pure functions: every engine value is validated before it reaches a CSS string. */
export type CfLayer={image:string;size:string;position:string;repeat:string;padLeft:number};
const HEX=/^#[0-9A-Fa-f]{6}$/;
const RED='#E5484D',AMBER='#F5A524',YELLOW='#E9C73C',GREEN='#30A46C',GREY='#B8BCC4';
const PALETTE:Record<number,string[]>={3:[RED,AMBER,GREEN],4:[RED,AMBER,YELLOW,GREEN],5:[RED,AMBER,YELLOW,'#8BBF4A',GREEN]};
export const iconLevels=(set:string)=>{const n=Number(set[0]);return Number.isInteger(n)&&n>=3&&n<=5?n:0;};
const ARROW=(deg:number,c:string)=>`<path d="M8 2 L13 8 H9.5 V14 H6.5 V8 H3 Z" fill="${c}" transform="rotate(${deg} 8 8)"/>`;
const ARROW_ANGLES:Record<number,number[]>={3:[180,90,0],4:[180,135,45,0],5:[180,135,90,45,0]};
/** SVG markup for one icon of a set; `index` 0 is the lowest level. Returns null for unknown input. */
export function iconSvg(set:string,index:number):string|null{
 if(!(CF_ICON_SETS as readonly string[]).includes(set))return null;const k=iconLevels(set);
 if(!Number.isInteger(index)||index<0||index>=k)return null;
 const c=PALETTE[k][index];let body='';
 if(set.endsWith('Arrows'))body=ARROW(ARROW_ANGLES[k][index],c);
 else if(set==='3TrafficLights1')body=`<circle cx="8" cy="8" r="6" fill="${c}"/>`;
 else if(set==='3Symbols')body=index===2?`<circle cx="8" cy="8" r="6.5" fill="${c}"/><path d="M4.8 8.2 L7 10.4 L11.2 5.8" fill="none" stroke="#FFFFFF" stroke-width="1.8"/>`:index===1?`<path d="M8 2 L14.5 13.5 H1.5 Z" fill="${c}"/><path d="M8 6.5 V9.5 M8 11 V12" stroke="#FFFFFF" stroke-width="1.6"/>`:`<circle cx="8" cy="8" r="6.5" fill="${c}"/><path d="M5.3 5.3 L10.7 10.7 M10.7 5.3 L5.3 10.7" stroke="#FFFFFF" stroke-width="1.8"/>`;
 else if(set==='3Flags')body=`<path d="M4 2 V14" stroke="${c}" stroke-width="1.6"/><path d="M4.8 2.8 H13 L10.8 5.6 L13 8.4 H4.8 Z" fill="${c}"/>`;
 else if(set.endsWith('Rating'))body=Array.from({length:k},(_,i)=>{const h=3+i*(10/(k-1)),x=1.5+i*(13/k);return `<rect x="${x.toFixed(2)}" y="${(14-h).toFixed(2)}" width="${(13/k-1).toFixed(2)}" height="${h.toFixed(2)}" fill="${i<=index?c:GREY}"/>`;}).join('');
 else if(set==='5Quarters'){const q=index;body=`<circle cx="8" cy="8" r="6" fill="none" stroke="${c}" stroke-width="1.4"/>`+(q>=4?`<circle cx="8" cy="8" r="6" fill="${c}"/>`:q>0?`<path d="${quarter(q)}" fill="${c}"/>`:'');}
 else return null;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${body}</svg>`;
}
/** Quarter pie path: arcs from 12 o'clock clockwise. */
function quarter(q:number):string{const end:[number,number][]=[[14,8],[8,14],[2,8],[8,2]];const [x,y]=end[Math.min(3,q-1)];return `M8 8 V2 A6 6 0 ${q>=3?1:0} 1 ${x} ${y} Z`;}
/** The CSS background layers for a cell's bar and icon, or null when it has neither. */
export function cfLayers(bar:unknown,icon:unknown,zoom:number):CfLayer|null{
 const images:string[]=[],sizes:string[]=[],positions:string[]=[];let pad=0;
 const z=Number.isFinite(zoom)?Math.max(0.25,Math.min(4,zoom)):1;
 if(Array.isArray(bar)&&bar.length===3&&typeof bar[0]==='number'&&Number.isFinite(bar[0])&&typeof bar[1]==='string'&&HEX.test(bar[1])){
  const f=Math.max(0,Math.min(1,bar[0])),c=bar[1];
  images.push(bar[2]===true?`linear-gradient(to right, ${c}, ${c}33)`:`linear-gradient(${c}, ${c})`);sizes.push(`${(f*100).toFixed(1)}% 70%`);positions.push('left center');
 }
 if(Array.isArray(icon)&&icon.length===2&&typeof icon[0]==='string'&&typeof icon[1]==='number'){
  const svg=iconSvg(icon[0],icon[1]);
  if(svg){const px=Math.round(13*z);images.unshift(`url("data:image/svg+xml,${encodeURIComponent(svg)}")`);sizes.unshift(`${px}px ${px}px`);positions.unshift('3px center');pad=px+5;}
 }
 if(!images.length)return null;
 return {image:images.join(', '),size:sizes.join(', '),position:positions.join(', '),repeat:'no-repeat',padLeft:pad};
}
export type {CfIconSet};
