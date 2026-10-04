/** Apply formatting: Prettier (standalone, loaded on first use) for HTML, CSS and JS/TS. Indentation comes from Settings > Code editor. */
export interface FormatPrefs{indent:2|4|8|'tab'}
const KEY='somnia.format.v1';
export const readFormatPrefs=():FormatPrefs=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');return{indent:v.indent===4||v.indent===8||v.indent==='tab'?v.indent:2};}catch{return{indent:2};}};
export const saveFormatPrefs=(p:FormatPrefs)=>{try{localStorage.setItem(KEY,JSON.stringify(p));}catch{/* storage unavailable */}};
export type Lang='html'|'css'|'babel'|'typescript';
export const langFor=(file:string):Lang|null=>/\.html?$/i.test(file)?'html':/\.css$/i.test(file)?'css':/\.(jsx?|mjs)$/i.test(file)?'babel':/\.tsx?$/i.test(file)?'typescript':null;
export async function formatCode(text:string,lang:Lang,prefs:FormatPrefs=readFormatPrefs()):Promise<string>{
 const pick=async(name:'html'|'postcss'|'babel'|'estree'|'typescript')=>{const m=await (name==='html'?import('prettier/plugins/html'):name==='postcss'?import('prettier/plugins/postcss'):name==='babel'?import('prettier/plugins/babel'):name==='estree'?import('prettier/plugins/estree'):import('prettier/plugins/typescript'));return ((m as {default?:unknown}).default??m) as never;};
 // Only load what the language needs; HTML also formats embedded CSS and JS.
 const need=lang==='html'?['html','postcss','babel','estree'] as const:lang==='css'?['postcss'] as const:lang==='babel'?['babel','estree'] as const:['typescript','estree'] as const;
 const [prettier,...plugins]=await Promise.all([import('prettier/standalone'),...need.map(pick)]);
 return prettier.format(text,{parser:lang,plugins,useTabs:prefs.indent==='tab',tabWidth:prefs.indent==='tab'?4:prefs.indent,printWidth:100});}
