export type Theme='light'|'dark';
const key='somnia.theme';
export function readTheme():Theme{try{return localStorage.getItem(key)==='dark'?'dark':'light';}catch{return 'light';}}
export function rememberTheme(theme:Theme){try{localStorage.setItem(key,theme);}catch{/* Appearance remains usable when storage is unavailable. */}}
