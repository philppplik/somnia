import { useT } from '../../lib/useT';
import { Button } from '../ui/button';
import {
  canEditResult, editResult, hasConflictMarkers, isDecided, pickSide, undecidedCount, useBoth, type ConflictDraft,
} from '../../lib/git/variantsFlow';

export interface ConflictResolverProps {
  /** Name of the variant being combined in ("Theirs"). */
  theirsName: string;
  yoursName: string;
  drafts: ConflictDraft[];
  selected: number;
  message: string;
  busy?: boolean;
  onSelect(i: number): void;
  onChange(i: number, d: ConflictDraft): void;
  onMessage(m: string): void;
  onFinish(): void;
  onAbort(): void;
}

/**
 * Three columns: Yours, Theirs, Result. Only Result is editable. Each file needs its own decision; there is no
 * "keep everything of one side" shortcut. Decisions use text labels, not only colour.
 */
export function ConflictResolver(p: ConflictResolverProps) {
  const { t } = useT();
  const d = p.drafts[p.selected];
  const c = d?.conflict;
  const open = undecidedCount(p.drafts);
  const kindLabel = c ? t(`variants.conflict.kind.${c.kind}`) : '';
  const markers = !!d && !c.binary && hasConflictMarkers(d.result);
  return (
    <div className="vr-root">
      <nav className="vr-files" aria-label={t('variants.conflict.files')}>
        <ul>
          {p.drafts.map((x, i) => (
            <li key={x.conflict.path}>
              <button type="button" className="vr-file" aria-current={i === p.selected ? 'true' : undefined} onClick={() => p.onSelect(i)}>
                <span className="vr-file-name" title={x.conflict.path}>{x.conflict.path}</span>
                <span className="vr-file-state" data-decided={isDecided(x)}>{isDecided(x) ? t('variants.conflict.decided') : t('variants.conflict.needs')}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {d && c && (
        <section className="vr-main" aria-label={c.path}>
          <p className="vr-kind">{kindLabel}</p>
          {c.tooLarge && <p className="vr-note" role="note">{t('variants.conflict.tooLarge')}</p>}
          <div className="vr-cols">
            <Column title={t('variants.conflict.yours', { name: p.yoursName })} id="vr-y">
              {c.binary ? <BinaryInfo bytes={c.yoursBytes} /> : <pre tabIndex={0} aria-labelledby="vr-y" className="vr-pre">{c.yours ?? t('variants.conflict.deleted')}</pre>}
              <Button onClick={() => p.onChange(p.selected, pickSide(d, 'yours'))}>{c.yours === null && !c.binary || (c.binary && c.yoursBytes === null) ? t('variants.conflict.acceptDelete') : t('variants.conflict.useYours')}</Button>
            </Column>
            <Column title={t('variants.conflict.theirs', { name: p.theirsName })} id="vr-t">
              {c.binary ? <BinaryInfo bytes={c.theirsBytes} /> : <pre tabIndex={0} aria-labelledby="vr-t" className="vr-pre">{c.theirs ?? t('variants.conflict.deleted')}</pre>}
              <Button onClick={() => p.onChange(p.selected, pickSide(d, 'theirs'))}>{c.theirs === null && !c.binary || (c.binary && c.theirsBytes === null) ? t('variants.conflict.acceptDelete') : t('variants.conflict.useTheirs')}</Button>
            </Column>
            <Column title={t('variants.conflict.result')} id="vr-r">
              {c.binary ? <p className="vr-note">{t('variants.conflict.binary')}</p> : (
                <textarea className="vr-result" aria-labelledby="vr-r" spellCheck={false} value={d.result} readOnly={!canEditResult(c)} onChange={e => p.onChange(p.selected, editResult(d, e.target.value))} />
              )}
              {canEditResult(c) && <Button onClick={() => p.onChange(p.selected, useBoth(d))}>{t('variants.conflict.useBoth')}</Button>}
              {markers && <p className="vr-warn" role="status">{t('variants.conflict.markers')}</p>}
            </Column>
          </div>
        </section>
      )}
      <footer className="vr-foot">
        <label className="vr-msg">
          <span>{t('variants.conflict.message')}</span>
          <input type="text" maxLength={200} value={p.message} onChange={e => p.onMessage(e.target.value)} />
        </label>
        <span className="vr-count" role="status">{open ? t('variants.conflict.open', { count: open }) : t('variants.conflict.allDecided')}</span>
        <Button className="dlg-cancel" disabled={p.busy} onClick={p.onAbort}>{t('variants.conflict.abort')}</Button>
        <Button variant="primary" disabled={p.busy || open > 0} onClick={p.onFinish}>{t('variants.conflict.finish')}</Button>
      </footer>
    </div>
  );
}

function Column({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return <div className="vr-col"><h4 id={id}>{title}</h4>{children}</div>;
}
function BinaryInfo({ bytes }: { bytes: number | null }) {
  const { t } = useT();
  return <p className="vr-binary">{bytes === null ? t('variants.conflict.deleted') : t('variants.conflict.binarySize', { bytes })}</p>;
}
