/** Glass v2: one opacity slider plus blur, applied per scope (window frame, panels, code editor). Pure maths, no DOM. */
export const GLASS_DEFAULT_OPACITY=68;
/** Panels sit 20 percentage points above the frame so the default stays 68 / 88. */
export const PANEL_OFFSET=20;
export const CODE_RECOMMENDED_MIN=60;
export const CODE_HARD_MIN=55;
export const CODE_CONTRAST_MIN=4.5;
export const HIGH_BLUR=24;
const NEUTRAL_REF='#808080';
const hex=(v:string)=>{const t=v.trim().toLowerCase();if(/^#[0-9a-f]{3}$/.test(t))return '#'+[...t.slice(1)].map(c=>c+c).join('');return /^#[0-9a-f]{6}$/.test(t)?t:null;};
const chan=(h:string,i:number)=>parseInt(h.slice(1+i*2,3+i*2),16);
const lin=(c:number)=>{const s=c/255;return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4);};
const lum=(h:string)=>0.2126*lin(chan(h,0))+0.7152*lin(chan(h,1))+0.0722*lin(chan(h,2));
/** Panel colour at `opacity` percent, composited over a neutral grey reference background. */
export function compositeOverReference(panel:string,opacity:number):[number,number,number]{
 const a=Math.min(100,Math.max(0,opacity))/100,r=128;
 return [0,1,2].map(i=>Math.round(chan(panel,i)*a+r*(1-a))) as [number,number,number];}
const toHex=(c:[number,number,number])=>'#'+c.map(n=>n.toString(16).padStart(2,'0')).join('');
/** WCAG contrast of text against the panel colour at `opacity` over the neutral reference. Null when colours are not plain #rrggbb. */
export function codeContrast(opacity:number,textColor:string,panelColor:string):number|null{
 const t=hex(textColor),p=hex(panelColor);if(!t||!p)return null;
 const bg=toHex(compositeOverReference(p,opacity));
 const [hi,lo]=[lum(t),lum(bg)].sort((x,y)=>y-x);
 return Math.round(((hi+0.05)/(lo+0.05))*100)/100;}
export interface GlassInput{opacity:number;blur:number;frame:boolean;panels:boolean;code:boolean}
export interface GlassEnv{textColor?:string;panelColor?:string;reducedTransparency?:boolean;blurSupported?:boolean}
export interface GlassResult{frameAlpha:number;panelAlpha:number;codeAlpha:number;blur:number;
 /** Code opacity the user chose is below the hard floor and was raised. */
 floored:boolean;
 /** Percent actually applied to the code editor (after the floor). */
 codeOpacity:number;
 lowContrast:boolean;highBlur:boolean;reduced:boolean}
const frac=(pct:number)=>Math.round(pct)/100;
/** Effective alphas. Scope off or reduced transparency: alpha 1 and blur 0. */
export function resolveGlass(g:GlassInput,env:GlassEnv={}):GlassResult{
 const opacity=Math.min(100,Math.max(0,Math.round(g.opacity)));
 const reduced=!!env.reducedTransparency;
 let codeOpacity=opacity,floored=false;
 if(g.code&&opacity<CODE_HARD_MIN){
  const c=env.textColor&&env.panelColor?codeContrast(opacity,env.textColor,env.panelColor):null;
  /* Colours we cannot measure (not plain hex) never floor; the low-contrast warning still shows. */
  if(c!==null&&c<CODE_CONTRAST_MIN){codeOpacity=CODE_HARD_MIN;floored=true;}}
 const on=!reduced;
 const blurOk=env.blurSupported!==false;
 return{
  frameAlpha:on&&g.frame?frac(opacity):1,
  panelAlpha:on&&g.panels?frac(Math.min(100,opacity+PANEL_OFFSET)):1,
  codeAlpha:on&&g.code?frac(codeOpacity):1,
  blur:on&&blurOk&&(g.frame||g.panels||g.code)?Math.round(g.blur):0,
  floored:g.code&&floored,codeOpacity,
  lowContrast:g.code&&opacity<CODE_RECOMMENDED_MIN,
  highBlur:g.blur>HIGH_BLUR,reduced};}
