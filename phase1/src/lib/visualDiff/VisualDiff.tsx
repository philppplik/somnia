import {useMemo, useState} from 'react';
import {sideBySide, diffStats} from '../diffView';
import type {DiffLine} from '../sourceDiff';
import {fileChanges, STATIC_LIMITS} from './model';
import type {VisualComparison, VisualDiffMode} from './model';
import {staticPreview} from './staticPreview';
import './visualDiff.css';

export interface VisualDiffProps {
  comparison: VisualComparison;
  initialMode?: VisualDiffMode;
}
const modeNames: Record<VisualDiffMode, string> = {slider: 'Slider', 'side-by-side': 'Side by side', 'only-changes': 'Only changes'};
function CodeCell({line, side}: {line?: DiffLine; side: 'before' | 'after'}) {
  return <td>{line && <><span className="visual-diff-line-number">{side === 'before' ? line.diskLine : line.editorLine}</span><span aria-label={line.kind}>{line.kind === 'removed' ? '- ' : line.kind === 'added' ? '+ ' : '  '}</span><code data-copyable>{line.text || ' '}</code></>}</td>;
}
/** Independent read-only viewer. The integrator supplies both complete file sets.
 * Text changes reuse the existing sourceDiff and sideBySide implementations.
 */
export function VisualDiff({comparison, initialMode = 'slider'}: VisualDiffProps) {
  const [mode, setMode] = useState<VisualDiffMode>(initialMode);
  const [position, setPosition] = useState(50);
  const [width, setWidth] = useState(960);
  const before = useMemo(() => staticPreview(comparison.before, comparison.path), [comparison.before, comparison.path]);
  const after = useMemo(() => staticPreview(comparison.after, comparison.path), [comparison.after, comparison.path]);
  const changes = useMemo(() => fileChanges(comparison), [comparison]);
  const rows = useMemo(() => sideBySide(changes.lines).filter(r => r.left?.kind !== 'same' || r.right?.kind !== 'same'), [changes]);
  const stats = diffStats(changes.lines);
  const warnings = [...new Set([...before.warnings, ...after.warnings])];
  const blocked = comparison.binary || comparison.before.incomplete || comparison.after.incomplete;
  const frame = (side: 'before' | 'after') => <iframe key={side} title={`${side === 'before' ? 'Before' : 'After'}: ${side === 'before' ? comparison.before.label : comparison.after.label}`} srcDoc={side === 'before' ? before.html : after.html} sandbox="" tabIndex={-1} style={{width, height: 540}} />;
  return <section className="visual-diff" aria-label="Visual file comparison">
    <header><strong title={comparison.path}>{comparison.path}</strong><div role="group" aria-label="Comparison mode">{(Object.keys(modeNames) as VisualDiffMode[]).map(m => <button type="button" key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>{modeNames[m]}</button>)}</div></header>
    <p className="visual-diff-limits">{STATIC_LIMITS}</p>
    <p className="visual-diff-labels"><span>Before: {comparison.before.label}</span><span>After: {comparison.after.label}</span></p>
    {blocked && <p role="alert">{comparison.binary ? 'Binary file. Visual and text comparison are unavailable.' : 'Incomplete snapshot. This comparison is not a full review.'}</p>}
    {warnings.length > 0 && <ul aria-label="Preview limitations">{warnings.map(w => <li key={w}>{w}</li>)}</ul>}
    {mode === 'only-changes' ? <div className="visual-diff-code">
      <p role="status">{changes.limited ? 'Text comparison exceeds its limit or is unavailable. Open the code viewer for manual review.' : `${stats.added} added, ${stats.removed} removed lines. Text changes only, not visual regions.`}</p>
      {!changes.limited && (rows.length ? <table aria-label="Changed source lines"><thead><tr><th>Before (- removed)</th><th>After (+ added)</th></tr></thead><tbody>{rows.map((row, i) => <tr key={i}><CodeCell line={row.left} side="before"/><CodeCell line={row.right} side="after"/></tr>)}</tbody></table> : <p>No text differences.</p>)}
    </div> : blocked ? null : <>
      <label className="visual-diff-viewport">Viewport width<select aria-label="Preview viewport width" value={width} onChange={e => setWidth(Number(e.target.value))}>{[320, 768, 960, 1440].map(w => <option key={w} value={w}>{w}px</option>)}</select><span>Fixed 540px height. Scroll horizontally to inspect the full width.</span></label>
      {mode === 'slider' && <label className="visual-diff-slider-label">Before / After split: {position}%<input aria-label="Before / After split" type="range" min="0" max="100" value={position} onChange={e => setPosition(Number(e.target.value))}/></label>}
      <div className="visual-diff-scroll" tabIndex={0} role="region" aria-label="Static preview viewport">
        {mode === 'slider' ? <div className="visual-diff-overlay" style={{width, height: 540}}>
          <div className="visual-diff-frame">{frame('after')}</div>
          <div className="visual-diff-frame" style={{clipPath: `inset(0 ${100 - position}% 0 0)`}}>{frame('before')}</div>
          <div className="visual-diff-divider" style={{left: `${position}%`}} aria-hidden="true"/>
          <span className="visual-diff-badge visual-diff-badge-before">Before</span><span className="visual-diff-badge visual-diff-badge-after">After</span>
        </div> : <div className="visual-diff-pair" style={{width: width * 2 + 16}}><div><p>Before</p>{frame('before')}</div><div><p>After</p>{frame('after')}</div></div>}
      </div>
    </>}
  </section>;
}
