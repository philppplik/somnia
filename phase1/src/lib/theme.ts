export type Theme='light'|'dark';
export type ThemeChoice='system'|'light'|'dark'|'cream'|'green'|'midnight'|'blueice'|'grape'|'melon'|'forestlight'|'royal'|'royallight'|'slate-dark'|'slate-light'|'nord'|'nordlight'|'crimson'|'crimsonlight'|'honey-amber-light'|'honey-amber-dark'|'ocean-blue-light'|'ocean-blue-dark'|'sakura-light'|'sakura-dark'|'sunset-orange-light'|'sunset-orange-dark'|'lagoon-teal-light'|'lagoon-teal-dark';
/** Named themes. System follows the OS light/dark setting; the others force their mode and palette. */
export const THEME_CHOICES:{id:ThemeChoice;label:string;mode:Theme|null;palette:string}[]=[
 {id:'system',label:'System (follow OS)',mode:null,palette:'default'},
 {id:'light',label:'Light',mode:'light',palette:'default'},
 {id:'dark',label:'Dark',mode:'dark',palette:'default'},
 {id:'cream',label:'Coffee Shop (light)',mode:'light',palette:'cream'},
 {id:'green',label:'Forest Green',mode:'dark',palette:'forest'},
 {id:'midnight',label:'Midnight Blue',mode:'dark',palette:'midnight'},
 {id:'blueice',label:'Blue Ice (light)',mode:'light',palette:'blueice'},
 {id:'grape',label:'Grape Red',mode:'dark',palette:'grape'},
 {id:'melon',label:'Melon Pink (light)',mode:'light',palette:'melon'},
 {id:'forestlight',label:'Forest Green (light)',mode:'light',palette:'forest'},
 {id:'royal',label:'Royal Purple',mode:'dark',palette:'royal'},
 {id:'royallight',label:'Royal Purple (light)',mode:'light',palette:'royal'},
 {id:'slate-dark',label:'Slate Mono (dark)',mode:'dark',palette:'slate'},
 {id:'slate-light',label:'Slate Mono (light)',mode:'light',palette:'slate'},
 {id:'nord',label:'Nord Frost',mode:'dark',palette:'nord'},
 {id:'nordlight',label:'Nord Frost (light)',mode:'light',palette:'nordlight'},
 {id:'crimson',label:'Crimson Red',mode:'dark',palette:'crimson'},
 {id:'crimsonlight',label:'Crimson Red (light)',mode:'light',palette:'crimsonlight'},
 {id:'honey-amber-light',label:'Honey Amber (light)',mode:'light',palette:'honey-amber'},
 {id:'honey-amber-dark',label:'Honey Amber (dark)',mode:'dark',palette:'honey-amber'},
 {id:'ocean-blue-light',label:'Ocean Blue (light)',mode:'light',palette:'ocean-blue'},
 {id:'ocean-blue-dark',label:'Ocean Blue (dark)',mode:'dark',palette:'ocean-blue'},
 {id:'sakura-light',label:'Sakura Pink (light)',mode:'light',palette:'sakura'},
 {id:'sakura-dark',label:'Sakura Pink (dark)',mode:'dark',palette:'sakura'},
 {id:'sunset-orange-light',label:'Sunset Orange (light)',mode:'light',palette:'sunset-orange'},
 {id:'sunset-orange-dark',label:'Sunset Orange (dark)',mode:'dark',palette:'sunset-orange'},
 {id:'lagoon-teal-light',label:'Lagoon Teal (light)',mode:'light',palette:'lagoon-teal'},
 {id:'lagoon-teal-dark',label:'Lagoon Teal (dark)',mode:'dark',palette:'lagoon-teal'}];
/** Ids stay stable across renames (cream = Coffee Shop, green = Forest Green), so saved choices keep working. */
const key='somnia.theme',choiceKey='somnia.themeChoice';
export function readTheme():Theme{try{return localStorage.getItem(key)==='dark'?'dark':'light';}catch{return 'light';}}
export function rememberTheme(theme:Theme){try{localStorage.setItem(key,theme);}catch{/* Appearance remains usable when storage is unavailable. */}}
export function readThemeChoice():ThemeChoice{try{const v=localStorage.getItem(choiceKey);if(THEME_CHOICES.some(t=>t.id===v))return v as ThemeChoice;return readTheme();}catch{return 'light';}}
export function rememberThemeChoice(c:ThemeChoice){try{localStorage.setItem(choiceKey,c);}catch{/* storage unavailable */}}
export const systemMode=():Theme=>typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
export function resolveTheme(c:ThemeChoice):{mode:Theme;palette:string}{const t=THEME_CHOICES.find(x=>x.id===c)!;return{mode:t.mode??systemMode(),palette:t.palette};}
