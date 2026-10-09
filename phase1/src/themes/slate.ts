/** Slate Mono theme entries. Palette 'slate' is styled in ./slate.css (import it once, e.g. from styles/global.css).
 *  Registry wiring: append these to THEME_CHOICES in lib/theme.ts and extend the ThemeChoice union with 'slate-dark'|'slate-light'. */
export const SLATE_THEME_CHOICES=[
 {id:'slate-dark',label:'Slate Mono (dark)',mode:'dark' as const,palette:'slate'},
 {id:'slate-light',label:'Slate Mono (light)',mode:'light' as const,palette:'slate'}];
