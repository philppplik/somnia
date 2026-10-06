/** Look options: accent colour, UI scale, editor font size, line height, density. Applied as CSS variables on :root; stored in localStorage. */
import type {WindowBackground} from './windowBackground';
export type Density='compact'|'normal'|'comfortable';
export interface Look{accent:string|null;uiScale:number;editorFont:number;lineHeight:number;density:Density;background:WindowBackground;glassBlur:number;glassPanels:boolean;outerRadius:number}
export const DEFAULT_LOOK:Look={accent:null,uiScale:100,editorFont:12,lineHeight:1.5,density:'normal',background:'solid',glassBlur:24,glassPanels:true,outerRadius:25};
export const LOOK_KEY='somnia.look.v2';
const LEGACY_KEY='somnia.look.v1';
const clamp=(n:unknown,lo:number,hi:number,d:number)=>typeof n==='number'&&Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):d;
export const isHex=(v:unknown):v is string=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v);
export function sanitizeLook(x:any):Look{return{accent:isHex(x?.accent)?x.accent.toLowerCase():null,uiScale:clamp(x?.uiScale,85,130,100),editorFont:clamp(x?.editorFont,10,22,12),lineHeight:clamp(x?.lineHeight,1.2,2,1.5),background:x?.background==='glass'?'glass':'solid',glassBlur:Math.round(clamp(x?.glassBlur,0,40,24)),glassPanels:typeof x?.glassPanels==='boolean'?x.glassPanels:true,outerRadius:Math.round(clamp(x?.outerRadius,0,25,25)),density:x?.density==='compact'||x?.density==='comfortable'?x.density:'normal'};}
/** v2 wins, including reset defaults. Read legacy v1 without changing it; the next edit writes v2. */
export function readLook():Look{try{const raw=localStorage.getItem(LOOK_KEY);if(raw!==null){const saved=JSON.parse(raw);return saved?.version===2?sanitizeLook(saved.look):{...DEFAULT_LOOK};}return sanitizeLook(JSON.parse(localStorage.getItem(LEGACY_KEY)||'{}'));}catch{return{...DEFAULT_LOOK};}}
export function rememberLook(l:Look){try{localStorage.setItem(LOOK_KEY,JSON.stringify({version:2,look:sanitizeLook(l)}));}catch{/* storage unavailable */}}
const lin=(c:number)=>{const s=c/255;return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4);};
export const luminance=(hex:string)=>{const n=parseInt(hex.slice(1),16);return 0.2126*lin(n>>16&255)+0.7152*lin(n>>8&255)+0.0722*lin(n&255);};
export function contrastRatio(a:string,b:string){const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return Math.round(((x+0.05)/(y+0.05))*100)/100;}
/** Readable text colour (white or near-black) on top of the accent. */
export const textOnAccent=(accent:string)=>contrastRatio(accent,'#ffffff')>=contrastRatio(accent,'#101014')?'#ffffff':'#101014';
export const GAP:Record<Density,string>={compact:'3px',normal:'6px',comfortable:'10px'};
export function applyLook(l:Look,root:HTMLElement=document.documentElement){
 const safe=sanitizeLook(l);
 const s=root.style;
 s.setProperty('--glass-blur',`${safe.glassBlur}px`);s.setProperty('--r-outer',`${safe.outerRadius}px`);root.dataset.glassPanels=String(safe.glassPanels);
 if(l.accent){s.setProperty('--accent',l.accent);s.setProperty('--accent-soft',`color-mix(in srgb, ${l.accent} 18%, transparent)`);s.setProperty('--accent-ink',textOnAccent(l.accent));}
 else{s.removeProperty('--accent');s.removeProperty('--accent-soft');s.removeProperty('--accent-ink');}
 s.setProperty('--ui-zoom',String(l.uiScale/100));s.setProperty('--editor-font-size',`${l.editorFont}px`);s.setProperty('--editor-line-height',String(l.lineHeight));s.setProperty('--gap',GAP[l.density]);}
