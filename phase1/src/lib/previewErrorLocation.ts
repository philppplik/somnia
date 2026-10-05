/** One executed script in the generated srcDoc. Lines and columns are 1-based. */
export interface PreviewScriptLocation {
 file:string; url:string;
 sourceLine:number; sourceCol:number;
 generatedLine:number; generatedCol:number;
 content:string;
}
export interface PreviewSourceLocation {file:string;line:number;col:number}
export interface PreviewError {message:string;filename?:string;line?:number;col?:number;stack?:string;syntax?:boolean}

/** Never guess a source position for resource errors, eval code or unknown stacks. */
export function mapPreviewErrorLocation(error:PreviewError,scripts:readonly PreviewScriptLocation[]):PreviewSourceLocation|null {
 const map=(filename:string,line:number,col:number):PreviewSourceLocation|null=>{
  if(!Number.isInteger(line)||line<1||!Number.isInteger(col)||col<1)return null;
  for(const script of scripts){
   let localLine:number,localCol:number;
   // Chromium reports srcDoc coordinates for parse failures even with sourceURL.
   if(filename===script.url&&!error.syntax){localLine=line;localCol=col;}
   else if(filename==='about:srcdoc'||filename===script.url&&error.syntax){
    localLine=line-script.generatedLine+1;
    localCol=col-(localLine===1?script.generatedCol-1:0);
   }else continue;
   const lines=script.content.split('\n');
   if(localLine<1||localLine>lines.length||localCol<1||localCol>lines[localLine-1].length+1)continue;
   return {file:script.file,line:script.sourceLine+localLine-1,col:localCol+(localLine===1?script.sourceCol-1:0)};
  }
  return null;
 };
 const direct=map(error.filename??'',error.line??0,error.col??1);
 if(direct)return direct;
 // Promise rejections have no ErrorEvent coordinates. Use the first known project frame.
 // Do not use about:srcdoc stack frames here: eval can reuse that URL with unrelated offsets.
 for(const frame of (error.stack??'').split('\n')){
  const match=frame.match(/(somnia-preview:\/\/script\/[^\s)]+):(\d+):(\d+)\)?$/);
  if(match){const result=map(match[1],Number(match[2]),Number(match[3]));if(result)return result;}
 }
 return null;
}
