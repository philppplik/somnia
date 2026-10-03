export type Contrast='standard'|'high';
export const CODE_THEMES=['classic','ocean','forest','github','solarized','monokai','dracula','nord'];
export type CodeTheme='classic'|'ocean'|'forest'|'github'|'solarized'|'monokai'|'dracula'|'nord';
export function readAppearance():{contrast:Contrast;codeTheme:CodeTheme}{try{const x=JSON.parse(localStorage.getItem('somnia.appearance')||'{}');return {contrast:x.contrast==='high'?'high':'standard',codeTheme:CODE_THEMES.includes(x.codeTheme)?x.codeTheme:'classic'};}catch{return {contrast:'standard',codeTheme:'classic'};}}
export function rememberAppearance(contrast:Contrast,codeTheme:CodeTheme){try{localStorage.setItem('somnia.appearance',JSON.stringify({contrast,codeTheme}));return true;}catch{return false;}}
