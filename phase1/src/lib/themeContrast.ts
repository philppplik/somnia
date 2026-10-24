import type {ThemeExchange,ThemeRole} from './themeExchange';
export const THEME_CONTRAST_PAIRS:readonly (readonly [ThemeRole,ThemeRole])[]=[['foreground','background'],['card-foreground','card'],['popover-foreground','popover'],['primary-foreground','primary'],['secondary-foreground','secondary'],['muted-foreground','muted'],['accent-foreground','accent'],['destructive-foreground','destructive'],['sidebar-foreground','sidebar'],['sidebar-primary-foreground','sidebar-primary'],['sidebar-accent-foreground','sidebar-accent']];
export type ThemeContrastIssue={mode:'light'|'dark';foreground:ThemeRole;background:ThemeRole;kind:'low'|'unverified';ratio?:number};
export type Rgba=readonly [number,number,number,number];
const luminance=(rgb:Rgba)=>rgb.slice(0,3).map(x=>{const c=x/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
export function colorContrast(a:Rgba,b:Rgba){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
/** Advisory text-pair audit. No rewriting, fallbacks or invented opacity compositing. */
export function auditThemeContrast(theme:ThemeExchange,resolve:(literal:string)=>Rgba|null):ThemeContrastIssue[]{
 const issues:ThemeContrastIssue[]=[];
 for(const mode of ['light','dark'] as const)for(const [foreground,background] of THEME_CONTRAST_PAIRS){
  const fg=theme[mode][foreground],bg=theme[mode][background];if(!fg&&!bg)continue;
  const a=fg?resolve(fg):null,b=bg?resolve(bg):null;
  if(!a||!b||a[3]<1||b[3]<1){issues.push({mode,foreground,background,kind:'unverified'});continue;}
  const ratio=colorContrast(a,b);if(ratio<4.5)issues.push({mode,foreground,background,kind:'low',ratio});
 }return issues;
}
/** Browser converts supported CSS full literals (including OKLCH) to actual sRGB pixels. */
export function browserThemeColor(literal:string,doc:Document=document):Rgba|null{
 if(typeof CSS==='undefined'||!CSS.supports('color',literal))return null;
 const canvas=doc.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return null;
 ctx.clearRect(0,0,1,1);ctx.fillStyle=literal;ctx.fillRect(0,0,1,1);const bytes=ctx.getImageData(0,0,1,1).data;return [bytes[0],bytes[1],bytes[2],bytes[3]/255];
}
