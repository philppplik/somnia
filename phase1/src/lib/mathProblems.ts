import type {Problem} from './diagnostics';
import {extractMath} from './mathExtract';
import {hasMathDelims} from './mathExtract';
import {getEngineStatus,makeSink} from './mathRender';
import {renderTex} from './texPreview';
import {readEditorPrefs} from './editorPrefs';
import {isTex} from './media';
const isMd=(f:string)=>/\.md$/i.test(f);
/** Formula errors for the Problems panel and the editor gutter. Only runs once the math engine is loaded (a preview triggers that), so it costs nothing for projects without math. */
export function mathProblems(file:string,text:string):Problem[]{
 if(getEngineStatus()==='failed'&&(isMd(file)||isTex(file))&&hasMathDelims(text))return [{file,line:1,col:1,severity:'warning',message:'Math: the math engine could not be loaded, formulas are shown as source'}];
 if(getEngineStatus()!=='ready'||text.length>600_000)return [];
 const out:Problem[]=[];const sink=makeSink();
 if(isMd(file)){if(!readEditorPrefs().mathMarkdown)return [];
  const x=extractMath(text.replace(/\r\n?/g,'\n'));x.warnings.forEach(w=>out.push({file,line:w.line,col:1,severity:'warning',message:`Math: ${w.message}`}));x.items.forEach(sink.fn);}
 else if(isTex(file)){const r=renderTex(text,sink);r.warnings.forEach(w=>out.push({file,line:w.line,col:1,severity:'warning',message:`Math: ${w.message}`}));}
 else return [];
 sink.errors.forEach(e=>out.push({file,line:e.line,col:1,severity:'error',message:e.message}));
 return out.slice(0,50);}
