import {copyLineDown} from '@codemirror/commands';
import {EditorState,EditorSelection} from '@codemirror/state';
import {keymap,rectangularSelection,crosshairCursor,EditorView} from '@codemirror/view';
import {bracketMatching,foldGutter,foldKeymap,indentUnit} from '@codemirror/language';
/** Existing CodeMirror features, no alternate editor or document history. */
export const codeEditingExtensions=[EditorState.allowMultipleSelections.of(true),rectangularSelection(),crosshairCursor(),bracketMatching(),foldGutter(),keymap.of(foldKeymap),EditorView.theme({'.cm-matchingBracket':{backgroundColor:'var(--accent-soft)',outline:'1px solid var(--accent)'},'.cm-nonmatchingBracket':{textDecoration:'underline wavy',textDecorationColor:'var(--syntax-keyword)'},'.cm-foldPlaceholder':{backgroundColor:'var(--bg-hover)',color:'var(--text-secondary)',border:'1px solid var(--border-subtle)'},'.cm-foldGutter':{color:'var(--text-tertiary)'}})];

export const codeIndentExtensions=(indent:2|4|8|'tab')=>[indentUnit.of(indent==='tab'?'\t':' '.repeat(indent)),EditorState.tabSize.of(indent==='tab'?4:indent)];

/** Keep Mod+D as Duplicate. Duplicate every nonempty selection; mixed empty cursors stay in place. */
export function duplicateCodeSelectionOrLine(view:EditorView){
 if(view.state.readOnly||!view.state.facet(EditorView.editable))return false;
 if(view.state.selection.ranges.every(r=>r.empty))return copyLineDown(view);
 view.dispatch({...view.state.changeByRange(range=>{if(range.empty)return {range};const text=view.state.sliceDoc(range.from,range.to);return {changes:{from:range.to,insert:text},range:EditorSelection.range(range.to,range.to+text.length)};}),userEvent:'input.duplicate'});return true;
}
