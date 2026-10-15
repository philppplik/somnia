import {pasteText} from './session';
/** Same caps as a paste: the text of one insert. */
export const MAX_TEXT_FILE_CHARS=1_000_000;
export const MAX_TEXT_FILE_LINES=5000;
const EXTS=['txt','text','md','markdown','csv'] as const;
/** Why a file cannot be inserted as text (name, size), or null. */
export function textFileProblem(name:string,size:number):string|null{
 const m=/\.([a-z0-9]{1,10})$/i.exec(name.replace(/^.*[\\/]/,''));
 if(!m||!(EXTS as readonly string[]).includes(m[1].toLowerCase()))return `${name} is not a text, Markdown or CSV file.`;
 if(!Number.isFinite(size)||size<=0)return `${name} is empty.`;
 if(size>MAX_TEXT_FILE_CHARS*4)return `${name} is too large to insert.`;
 return null;
}
/** The file's text for insertion (UTF-8, no byte order mark, line breaks as \n), or an error message. */
export function decodeTextFile(bytes:ArrayBuffer,name:string):{text:string}|{error:string}{
 let s:string;try{s=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return{error:`${name} is not UTF-8 text.`};}
 s=s.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 if(/[\u0000\uFFFC]/.test(s))return{error:`${name} is not plain text.`};
 s=s.replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/g,'').replace(/\n+$/,'');
 if(s==='')return{error:`${name} has no text.`};
 if(s.length>MAX_TEXT_FILE_CHARS)return{error:`${name} has more than ${MAX_TEXT_FILE_CHARS} characters.`};
 if(s.split('\n').length>MAX_TEXT_FILE_LINES)return{error:`${name} has more than ${MAX_TEXT_FILE_LINES} lines.`};
 return{text:s};
}
/** Opens the file picker and inserts the chosen file's text at the caret as one undo step. Resolves null when cancelled. */
export function pickAndInsertText():Promise<{error:string}|{chars:number}|null>{
 return new Promise(resolve=>{
  const input=document.createElement('input');input.type='file';input.accept=EXTS.map(e=>'.'+e).join(',');
  input.onchange=()=>{
   const f=input.files?.[0];if(!f){resolve(null);return;}
   const bad=textFileProblem(f.name,f.size);if(bad){resolve({error:bad});return;}
   void f.arrayBuffer().then(async b=>{const r=decodeTextFile(b,f.name);if('error' in r){resolve(r);return;}await pasteText(r.text);resolve({chars:r.text.length});}).catch(e=>resolve({error:e instanceof Error?e.message:String(e)}));
  };
  input.oncancel=()=>resolve(null);input.click();
 });
}
