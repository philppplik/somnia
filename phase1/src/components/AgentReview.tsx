import {useMemo, useState} from 'react';
import {Button} from './ui/button';
import {hunkKey, planApply, reviewChangeSet, summarize, type ApplyPlan, type ChangeSet, type Decisions, type Hunk} from '../lib/agentDiff';

export interface AgentReviewProps {
  changeSet: ChangeSet;
  /** Current editor text (including unsaved edits) or null when the file does not exist. */
  readCurrent: (path: string) => string | null;
  /** Called with a plan that has ok=true. The host applies plan.writes as one undo step, without saving. */
  onApply: (plan: ApplyPlan, decisions: Decisions) => void;
  onDiscard: () => void;
}

const Line = ({sign, text, kind}: {sign: string; text: string; kind: 'same' | 'added' | 'removed'}) => (
  <div role="row" className={`diff-line diff-${kind}`}><span role="cell"/><span role="cell"/><span role="cell" aria-label={kind}>{sign}</span><code role="cell">{text || ' '}</code></div>
);

function HunkView({hunk, decision, disabled, onDecide}: {hunk: Hunk; decision: string | undefined; disabled: boolean; onDecide: (d: 'accept' | 'reject') => void}) {
  return (
    <div className="rounded-[6px] border border-line" role="group" aria-label={`Change at line ${hunk.baseLine}, ${hunk.removed.length} removed, ${hunk.added.length} added`}>
      <div className="flex items-center justify-between px-3 py-1 text-xs text-ink-2">
        <span>Line {hunk.baseLine} · -{hunk.removed.length} +{hunk.added.length}</span>
        <span className="flex gap-1">
          <Button disabled={disabled} aria-pressed={decision === 'accept'} onClick={() => onDecide('accept')}>Accept</Button>
          <Button disabled={disabled} aria-pressed={decision === 'reject'} onClick={() => onDecide('reject')}>Reject</Button>
        </span>
      </div>
      <div role="table" aria-label="Hunk lines">
        {hunk.before.map((t, i) => <Line key={`b${i}`} sign=" " text={t} kind="same"/>)}
        {hunk.removed.map((t, i) => <Line key={`r${i}`} sign="-" text={t} kind="removed"/>)}
        {hunk.added.map((t, i) => <Line key={`a${i}`} sign="+" text={t} kind="added"/>)}
        {hunk.after.map((t, i) => <Line key={`c${i}`} sign=" " text={t} kind="same"/>)}
      </div>
    </div>
  );
}

/** Review surface for an agent ChangeSet. Display only: nothing is written until the host handles onApply. */
export function AgentReview({changeSet, readCurrent, onApply, onDiscard}: AgentReviewProps) {
  const reviews = useMemo(() => reviewChangeSet(changeSet), [changeSet]);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [plan, setPlan] = useState<ApplyPlan | null>(null);
  const locked = !changeSet.complete;
  const sum = summarize(reviews, decisions);
  const set = (keys: string[], d: 'accept' | 'reject') => { setPlan(null); setDecisions(p => ({...p, ...Object.fromEntries(keys.map(k => [k, d]))})); };
  const allKeys = reviews.flatMap(r => r.hunks.map(h => h.key));
  const tryApply = () => {
    const p = planApply(changeSet, decisions, readCurrent);
    setPlan(p);
    if (p.ok) onApply(p, decisions);
  };
  return (
    <section className="flex flex-col gap-3" aria-label="Review agent changes">
      <header className="flex items-center justify-between">
        <strong>{sum.files} file(s) · {sum.hunks} change(s) · +{sum.added} -{sum.removed}</strong>
        <span role="status" className="text-xs text-ink-2">{locked ? 'Agent is still working. Review opens when complete.' : `${sum.accepted} accepted, ${sum.rejected} rejected`}</span>
      </header>
      {reviews.map(r => {
        const keys = r.hunks.map(h => h.key);
        return (
          <article key={r.file.path} className="flex flex-col gap-2" aria-label={r.file.path}>
            <div className="flex items-center justify-between">
              <code className="min-w-0 truncate" title={r.file.path}>{r.file.path}</code>
              <span className="flex items-center gap-1 text-xs">{r.file.kind === 'create' ? 'New file' : 'Edit'}
                <Button disabled={locked || !keys.length} onClick={() => set(keys, 'accept')}>Accept file</Button>
                <Button disabled={locked || !keys.length} onClick={() => set(keys, 'reject')}>Reject file</Button>
              </span>
            </div>
            {r.invalid && <p role="alert">Blocked: {r.invalid}</p>}
            {r.tooLarge && <p role="alert">Too large to review hunk by hunk. It cannot be applied.</p>}
            {r.hunks.map(h => <HunkView key={h.key} hunk={h} decision={decisions[h.key]} disabled={locked} onDecide={d => set([h.key], d)}/>)}
          </article>
        );
      })}
      {plan && !plan.ok && <ul role="alert" aria-label="Cannot apply">{plan.blockers.map((b, i) => <li key={i}>{b.path ? `${b.path}: ` : ''}{b.detail}</li>)}</ul>}
      <footer className="flex flex-wrap gap-2">
        <Button disabled={locked || !allKeys.length} onClick={() => set(allKeys, 'accept')}>Accept all</Button>
        <Button disabled={locked || !allKeys.length} onClick={() => set(allKeys, 'reject')}>Reject all</Button>
        <Button variant="primary" disabled={locked || sum.accepted === 0} onClick={tryApply}>Apply {sum.accepted} change(s) to editor</Button>
        <Button onClick={onDiscard}>Discard proposal</Button>
      </footer>
      <p className="text-xs text-ink-2">Applying changes the editor only. Nothing is saved to disk until you save.</p>
    </section>
  );
}
export {hunkKey};
