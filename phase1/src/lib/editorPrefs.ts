/** Editor intelligence switches. Each one can be turned off separately in Settings > Code editor. */
export interface EditorPrefs{autocomplete:boolean;closeBrackets:boolean;closeTags:boolean;lint:boolean;emmet:boolean}
export const DEFAULT_EDITOR_PREFS:EditorPrefs={autocomplete:true,closeBrackets:true,closeTags:true,lint:true,emmet:true};
const KEY='somnia.editorPrefs.v1';
export function readEditorPrefs():EditorPrefs{try{const x=JSON.parse(localStorage.getItem(KEY)||'{}');const out={...DEFAULT_EDITOR_PREFS};for(const k of Object.keys(out) as (keyof EditorPrefs)[])if(typeof x[k]==='boolean')out[k]=x[k];return out;}catch{return{...DEFAULT_EDITOR_PREFS};}}
export function rememberEditorPrefs(p:EditorPrefs){try{localStorage.setItem(KEY,JSON.stringify(p));}catch{/* storage unavailable */}}
