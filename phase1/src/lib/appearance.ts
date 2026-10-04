export type Contrast='standard'|'high';
export const CODE_THEMES=['classic','ocean','forest','github','solarized','monokai','dracula','nord'];
export type CodeTheme=string;
export function readAppearance():{contrast:Contrast;codeTheme:CodeTheme;wrapLines:boolean}{try{const x=JSON.parse(localStorage.getItem('somnia.appearance')||'{}');return {contrast:x.contrast==='high'?'high':'standard',wrapLines:x.wrapLines===true,codeTheme:typeof x.codeTheme==='string'&&/^[a-z0-9.-]{1,120}$/.test(x.codeTheme)?x.codeTheme:'classic'};}catch{return {contrast:'standard',codeTheme:'classic',wrapLines:false};}}
export function rememberAppearance(contrast:Contrast,codeTheme:CodeTheme,wrapLines=false){try{localStorage.setItem('somnia.appearance',JSON.stringify({contrast,codeTheme,wrapLines}));return true;}catch{return false;}}
