/**
 * Menu and palette entries for CodeMirror editing commands the Code studio already binds to keys or never exposed:
 * multi-cursor (next occurrence, all occurrences, cursor above and below), delete line and toggle comment.
 * Thin wrappers: no new editing engine, one CodeMirror transaction each, so one undo step.
 */
import {addCursorAbove,addCursorBelow,deleteLine,toggleComment} from '@codemirror/commands';
import {selectNextOccurrence,selectSelectionMatches} from '@codemirror/search';
import type {EditorView} from '@codemirror/view';
export type EditorCommandId='nextOccurrence'|'allOccurrences'|'cursorAbove'|'cursorBelow'|'deleteLine'|'toggleComment';
export const EDITOR_COMMANDS:Record<EditorCommandId,(view:EditorView)=>boolean>={
 nextOccurrence:selectNextOccurrence,
 allOccurrences:selectSelectionMatches,
 cursorAbove:addCursorAbove,
 cursorBelow:addCursorBelow,
 deleteLine,
 toggleComment,
};
/** Runs one command in the editor; false when the view is read-only or the command had nothing to do. */
export function runEditorCommand(view:EditorView,id:EditorCommandId):boolean{
 const writes=id==='deleteLine'||id==='toggleComment';
 if(writes&&view.state.readOnly)return false;
 return EDITOR_COMMANDS[id](view);
}
