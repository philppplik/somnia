import {EditorState} from '@codemirror/state';
import {keymap,rectangularSelection,crosshairCursor,EditorView} from '@codemirror/view';
import {bracketMatching,foldGutter,foldKeymap} from '@codemirror/language';
/** Existing CodeMirror features, no alternate editor or document history. */
export const codeEditingExtensions=[EditorState.allowMultipleSelections.of(true),rectangularSelection(),crosshairCursor(),bracketMatching(),foldGutter(),keymap.of(foldKeymap),EditorView.theme({'.cm-matchingBracket':{backgroundColor:'var(--accent-soft)',outline:'1px solid var(--accent)'},'.cm-nonmatchingBracket':{textDecoration:'underline wavy',textDecorationColor:'var(--syntax-keyword)'},'.cm-foldPlaceholder':{backgroundColor:'var(--bg-hover)',color:'var(--text-secondary)',border:'1px solid var(--border-subtle)'},'.cm-foldGutter':{color:'var(--text-tertiary)'}})];
