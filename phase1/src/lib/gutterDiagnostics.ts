import type {Text} from '@codemirror/state';
import type {Diagnostic} from '@codemirror/lint';
import type {Problem} from './diagnostics';

/** Map the Problems panel's one-based locations to the active CodeMirror document.
 * Only the active file contributes markers. Clamp stale/out-of-range locations so
 * opening a shorter file or a diagnostic at EOF never crashes the editor.
 * CodeMirror groups diagnostics by line and gives errors priority over warnings.
 */
export function gutterDiagnostics(doc:Text,file:string,problems:readonly Problem[]):Diagnostic[]{
 return problems.filter(p=>p.file===file).map(p=>{
  const line=doc.line(Math.max(1,Math.min(doc.lines,p.line)));
  const from=Math.min(line.to,line.from+Math.max(0,p.col-1));
  return {from,to:Math.min(line.to,from+1),severity:p.severity,message:p.message};
 });
}
