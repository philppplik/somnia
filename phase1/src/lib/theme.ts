export type Theme='light'|'dark';
export type ThemeChoice='system'|'light'|'dark'|'cream'|'green'|'midnight';
/** Named themes. System follows the OS light/dark setting; the others force their mode and palette. */
export const THEME_CHOICES:{id:ThemeChoice;label:string;mode:Theme|null;palette:string}[]=[
 {id:'system',label:'System (follow OS)',mode:null,palette:'default'},
 {id:'light',label:'Light',mode:'light',palette:'default'},
 {id:'dark',label:'Dark',mode:'dark',palette:'default'},
 {id:'cream',label:'Cream (light)',mode:'light',palette:'cream'},
 {id:'green',label:'Dark Green',mode:'dark',palette:'green'},
 {id:'midnight',label:'Midnight Blue',mode:'dark',palette:'midnight'}];
const key='somnia.theme',choiceKey='somnia.themeChoice';
export function readTheme():Theme{try{return localStorage.getItem(key)==='dark'?'dark':'light';}catch{return 'light';}}
export function rememberTheme(theme:Theme){try{localStorage.setItem(key,theme);}catch{/* Appearance remains usable when storage is unavailable. */}}
export function readThemeChoice():ThemeChoice{try{const v=localStorage.getItem(choiceKey);if(THEME_CHOICES.some(t=>t.id===v))return v as ThemeChoice;return readTheme();}catch{return 'light';}}
export function rememberThemeChoice(c:ThemeChoice){try{localStorage.setItem(choiceKey,c);}catch{/* storage unavailable */}}
export const systemMode=():Theme=>typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
export function resolveTheme(c:ThemeChoice):{mode:Theme;palette:string}{const t=THEME_CHOICES.find(x=>x.id===c)!;return{mode:t.mode??systemMode(),palette:t.palette};}
