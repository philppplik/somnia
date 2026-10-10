import {useMemo, useState} from 'react';
import {useT} from '../lib/useT';
import {Button} from './ui/button';
import {hunkKey, planApply, reviewChangeSet, summarize, type ApplyPlan, type ChangeSet, type Decisions, type Hunk} from '../lib/agentDiff';

export interface AgentReviewProps {
  changeSet: ChangeSet;
  /** Task worktree review records evidence without applying bytes to the open editor. */
  submitLabel?: string;
  completionHint?: string;
  /** Current editor text (including unsaved edits) or null when the file does not exist. */
  readCurrent: (path: string) => string | null;
  /** Called with a plan that has ok=true. The host applies plan.writes as one undo step, without saving. */
  onApply: (plan: ApplyPlan, decisions: Decisions) => void;
  onDiscard: () => void;
}

const Line = ({sign, text, kind}: {sign: string; text: string; kind: 'same' | 'added' | 'removed'}) => (
  <div role="row" className={`diff-line diff-${kind}`}><span role="cell"/><span role="cell"/><span role="cell" aria-label={kind}>{sign}</span><code role="cell" data-copyable>{text || ' '}</code></div>
);

function HunkView({hunk, decision, disabled, onDecide}: {hunk: Hunk; decision: string | undefined; disabled: boolean; onDecide: (d: 'accept' | 'reject') => void}) {
  const {t}=useT();
  return (
    <div className="rounded-[6px] border border-line" role="group" aria-label={t('board.hunks.hunk',{line:hunk.baseLine,removed:hunk.removed.length,added:hunk.added.length})}>
      <div className="flex items-center justify-between px-3 py-1 text-xs text-ink-2">
        <span>{t('board.hunks.line',{line:hunk.baseLine,removed:hunk.removed.length,added:hunk.added.length})}</span>
        <span className="flex gap-1">
          <Button disabled={disabled} aria-pressed={decision === 'accept'} onClick={() => onDecide('accept')}>{t('board.hunks.accept')}</Button>
          <Button disabled={disabled} aria-pressed={decision === 'reject'} onClick={() => onDecide('reject')}>{t('board.hunks.reject')}</Button>
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
export function AgentReview({changeSet, readCurrent, onApply, onDiscard, submitLabel, completionHint}: AgentReviewProps) {
  const {t}=useT();
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
        <strong>{t('board.hunks.summary',{files:sum.files,hunks:sum.hunks,added:sum.added,removed:sum.removed})}</strong>
        <span role="status" className="text-xs text-ink-2">{locked ? t('board.hunks.working') : t('board.hunks.decisions',{accepted:sum.accepted,rejected:sum.rejected})}</span>
      </header>
      {reviews.map(r => {
        const keys = r.hunks.map(h => h.key);
        return (
          <article key={r.file.path} className="flex flex-col gap-2" aria-label={r.file.path}>
            <div className="flex items-center justify-between">
              <code className="min-w-0 truncate" title={r.file.path}>{r.file.path}</code>
              <span className="flex items-center gap-1 text-xs">{t(r.file.kind === 'create' ? 'board.hunks.newFile' : 'board.hunks.edit')}
                <Button disabled={locked || !keys.length} onClick={() => set(keys, 'accept')}>{t('board.hunks.acceptFile')}</Button>
                <Button disabled={locked || !keys.length} onClick={() => set(keys, 'reject')}>{t('board.hunks.rejectFile')}</Button>
              </span>
            </div>
            {r.invalid && <p role="alert">{t('board.hunks.blocked',{reason:r.invalid})}</p>}
            {r.tooLarge && <p role="alert">{t('board.hunks.large')}</p>}
            {r.hunks.map(h => <HunkView key={h.key} hunk={h} decision={decisions[h.key]} disabled={locked} onDecide={d => set([h.key], d)}/>)}
          </article>
        );
      })}
      {plan && !plan.ok && <ul role="alert" aria-label={t('board.hunks.cannotApply')}>{plan.blockers.map((b, i) => <li key={i}>{b.path ? `${b.path}: ` : ''}{b.detail}</li>)}</ul>}
      <footer className="flex flex-wrap gap-2">
        <Button disabled={locked || !allKeys.length} onClick={() => set(allKeys, 'accept')}>{t('board.hunks.acceptAll')}</Button>
        <Button disabled={locked || !allKeys.length} onClick={() => set(allKeys, 'reject')}>{t('board.hunks.rejectAll')}</Button>
        <Button variant="primary" disabled={locked || sum.accepted === 0} onClick={tryApply}>{submitLabel ?? `Apply ${sum.accepted} change(s) to editor`}</Button>
        <Button onClick={onDiscard}>{t('board.hunks.discard')}</Button>
      </footer>
      <p className="text-xs text-ink-2">{completionHint ?? 'Applying changes the editor only. Nothing is saved to disk until you save.'}</p>
    </section>
  );
}
export {hunkKey};
