import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { EditorState, Annotation } from '@codemirror/state';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, indentOnInput, syntaxHighlighting, HighlightStyle, foldKeymap } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { tags as t } from '@lezer/highlight';

export const External = Annotation.define();

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: '#0e0e10', color: '#d4d4dc', fontSize: '12.5px' },
  '.cm-content': { fontFamily: "'JetBrains Mono', ui-monospace, monospace", caretColor: '#818cf8', padding: '10px 0' },
  '.cm-gutters': { backgroundColor: '#0e0e10', color: '#4b4b55', border: 'none', paddingLeft: '4px' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,.035)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#9a9aa6' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(99,102,241,.32) !important' },
  '.cm-cursor': { borderLeftColor: '#818cf8' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { lineHeight: '1.65', fontFamily: "'JetBrains Mono', monospace" },
  '.cm-tooltip': { backgroundColor: '#1e1e23', border: '1px solid rgba(255,255,255,.12)', borderRadius: '8px', color: '#ececf1' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'rgba(99,102,241,.3)', color: '#fff' },
  '.cm-foldPlaceholder': { backgroundColor: '#1e1e23', border: 'none', color: '#8b8b97' },
  '.cm-matchingBracket': { backgroundColor: 'rgba(129,140,248,.28)', outline: 'none' },
}, { dark: true });

const hl = HighlightStyle.define([
  { tag: [t.tagName, t.angleBracket], color: '#f0a1c0' },
  { tag: t.attributeName, color: '#c4b5fd' },
  { tag: [t.attributeValue, t.string], color: '#86efac' },
  { tag: t.comment, color: '#5b5b66', fontStyle: 'italic' },
  { tag: [t.keyword, t.operatorKeyword], color: '#a5b4fc' },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: '#93c5fd' },
  { tag: [t.number, t.bool, t.atom, t.unit], color: '#fbbf77' },
  { tag: [t.className, t.labelName], color: '#fcd34d' },
  { tag: [t.variableName, t.definition(t.variableName)], color: '#d4d4dc' },
  { tag: [t.function(t.variableName)], color: '#7dd3fc' },
  { tag: [t.punctuation, t.separator], color: '#8b8b97' },
  { tag: t.meta, color: '#8b8b97' },
]);

function lang(name) {
  if (/\.(html?|svg|xml)$/i.test(name)) return html();
  if (/\.css$/i.test(name)) return css();
  if (/\.(m?js|jsx|ts|tsx|json)$/i.test(name)) return javascript({ typescript: /\.tsx?$/.test(name), jsx: /x$/.test(name) });
  return [];
}

export function createEditor(parent, { onChange, onUndo, onRedo, onSave }) {
  const states = new Map();
  let current = null;
  const view = new EditorView({ parent, state: EditorState.create({ doc: '' }) });

  const mk = (name, text) => EditorState.create({
    doc: text,
    extensions: [
      lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(), foldGutter(),
      indentOnInput(), bracketMatching(), closeBrackets(), autocompletion(), highlightSelectionMatches(),
      syntaxHighlighting(hl), theme, lang(name), EditorState.tabSize.of(2),
      keymap.of([
        { key: 'Mod-z', run: () => { onUndo(); return true; } },
        { key: 'Mod-Shift-z', run: () => { onRedo(); return true; } },
        { key: 'Mod-y', run: () => { onRedo(); return true; } },
        { key: 'Mod-s', run: () => { onSave(); return true; } },
        ...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...foldKeymap, indentWithTab, ...defaultKeymap,
      ]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !u.transactions.some((tr) => tr.annotation(External))) onChange(current, u.state.doc.toString());
      }),
    ],
  });

  return {
    view,
    open(name, text) {
      if (current && current !== name) states.set(current, view.state);
      current = name;
      let st = states.get(name);
      if (!st || st.doc.toString() !== text) st = mk(name, text);
      view.setState(st);
      view.requestMeasure();
    },
    setText(name, text) { // external update, no echo
      if (name !== current) { states.delete(name); return; }
      const cur = view.state.doc.toString();
      if (cur === text) return;
      view.dispatch({ changes: { from: 0, to: cur.length, insert: text }, annotations: External.of(true) });
    },
    forget(name) { states.delete(name); },
    forgetAll() { states.clear(); },
    measure() { view.requestMeasure(); },
    get current() { return current; },
  };
}
