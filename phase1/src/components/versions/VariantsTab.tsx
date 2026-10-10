import { useCallback, useEffect, useState } from 'react';
import { GitBranch, Plus } from 'lucide-react';
import { useT } from '../../lib/useT';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import type { GitCombinePreview, GitCombineSession, GitVariant } from '../../lib/git/types';
import {
  abortCombine, deleteVariant, errorKey, finishCombine, initDrafts, loadVariants, openVariant, previewCombine, renameVariant,
  resumeCombine, startCombine, startVariant, type ConflictDraft, type FlowError, type GuardBlock, type Dirty, type VariantsDeps,
} from '../../lib/git/variantsFlow';
import { ConflictResolver } from './ConflictResolver';

/** What the panel says when an action cannot start. Pure so it renders in tests. */
export function Notice({ n, onSaveVersion }: { n: GuardBlock | Dirty | FlowError | { kind: 'text'; key: string }; onSaveVersion?: () => void }) {
  const { t } = useT();
  if (n.kind === 'guard') {
    return (
      <div className="vt-notice" role="alert">
        <strong>{t('variants.guard.title')}</strong>
        {n.unsaved.length > 0 && <><p>{t('variants.guard.unsaved')}</p><ul>{n.unsaved.map(p => <li key={p}>{p}</li>)}</ul></>}
        {n.reviews.length > 0 && <><p>{t('variants.guard.reviews')}</p><ul>{n.reviews.map(p => <li key={p}>{p}</li>)}</ul></>}
      </div>
    );
  }
  if (n.kind === 'dirty') {
    return (
      <div className="vt-notice" role="alert">
        <strong>{t('variants.dirty.title')}</strong>
        <p>{t('variants.dirty.body', { count: n.changes })}</p>
        {onSaveVersion && <Button onClick={onSaveVersion}>{t('variants.dirty.save')}</Button>}
      </div>
    );
  }
  if (n.kind === 'text') return <div className="vt-notice" role="alert"><p>{t(n.key)}</p></div>;
  return <div className="vt-notice" role="alert"><p>{t(errorKey(n.error))}</p></div>;
}

export interface VariantsListProps {
  variants: GitVariant[];
  busy?: boolean;
  onOpen(v: GitVariant): void;
  onCombine(v: GitVariant): void;
  onRename(v: GitVariant): void;
  onDelete(v: GitVariant): void;
}
export function VariantsList(p: VariantsListProps) {
  const { t } = useT();
  if (!p.variants.length) return <p className="vt-empty">{t('variants.empty')}</p>;
  return (
    <ul className="vt-list" aria-label={t('variants.list.aria')}>
      {p.variants.map(v => (
        <li key={v.name} className="vt-item" data-current={v.current}>
          <div className="vt-item-head">
            <GitBranch size={14} aria-hidden="true" />
            <strong className="vt-name" title={v.name}>{v.name}</strong>
            {v.current && <span className="vt-badge">{t('variants.open.badge')}</span>}
          </div>
          <p className="vt-meta">
            {v.current ? t('variants.meta.current') : v.merged ? t('variants.meta.merged') : t('variants.meta.ahead', { count: v.ahead })}
          </p>
          <div className="vt-actions">
            {!v.current && <Button disabled={p.busy} onClick={() => p.onOpen(v)} aria-label={t('variants.action.openNamed', { name: v.name })}>{t('variants.action.open')}</Button>}
            {!v.current && !v.merged && <Button disabled={p.busy} onClick={() => p.onCombine(v)} aria-label={t('variants.action.combineNamed', { name: v.name })}>{t('variants.action.combine')}</Button>}
            <Button disabled={p.busy} onClick={() => p.onRename(v)} aria-label={t('variants.action.renameNamed', { name: v.name })}>{t('variants.action.rename')}</Button>
            {!v.current && <Button disabled={p.busy} onClick={() => p.onDelete(v)} aria-label={t('variants.action.deleteNamed', { name: v.name })}>{t('variants.action.delete')}</Button>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface VariantsTabProps {
  deps: VariantsDeps;
  /** Agent Board handoff. Uses this existing Combine flow, not a second merge path. */
  initialCombineTarget?: string;
  beforeCombine?: () => void;
  /** The project files on disk changed (switch, combine, abort): reload them in the editor. */
  onDiskChanged(): void;
  /** Jump to the Changes tab so the user can save a version first. */
  onSaveVersion?(): void;
  /** Refresh repo state in the panel header (branch name). */
  onRepoChanged?(): void;
}

type Pending = GuardBlock | Dirty | FlowError | { kind: 'text'; key: string } | null;

export function VariantsTab({ deps, onDiskChanged, onSaveVersion, onRepoChanged, initialCombineTarget, beforeCombine }: VariantsTabProps) {
  const { t } = useT();
  const [variants, setVariants] = useState<GitVariant[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Pending>(null);
  const [newName, setNewName] = useState('');
  const [rename, setRename] = useState<{ v: GitVariant; value: string } | null>(null);
  const [del, setDel] = useState<GitVariant | null>(null);
  const [preview, setPreview] = useState<GitCombinePreview | null>(null);
  const [resolver, setResolver] = useState<{ session: GitCombineSession; drafts: ConflictDraft[]; selected: number; message: string } | null>(null);

  const refresh = useCallback(async () => {
    const r = await loadVariants(deps);
    if (r.kind === 'list') setVariants(r.variants); else setNotice(r);
  }, [deps]);
  const changed = () => { onRepoChanged?.(); void refresh(); };
  const openResolver = (session: GitCombineSession) => setResolver({ session, drafts: initDrafts(session.conflicts), selected: 0, message: session.proposedMessage });

  useEffect(() => {
    void (async () => {
      await refresh();
      const r = await resumeCombine(deps);
      if (r.kind === 'session' && r.session?.merging) openResolver(r.session);
    })();
  }, [deps, refresh]);

  const run = async (f: () => Promise<void>) => { setBusy(true); setNotice(null); try { await f(); } finally { setBusy(false); } };

  const create = (open: boolean) => run(async () => {
    const r = await startVariant(deps, newName, open);
    if (r.kind === 'error') return setNotice(r);
    setNewName(''); changed();
  });
  const doOpen = (v: GitVariant) => run(async () => {
    const r = await openVariant(deps, v.name);
    if (r.kind !== 'opened') return setNotice(r);
    onDiskChanged(); changed();
  });
  const doRename = () => run(async () => {
    if (!rename) return;
    const r = await renameVariant(deps, rename.v.name, rename.value);
    if (r.kind === 'error') return setNotice(r);
    setRename(null); changed();
  });
  const doDelete = (confirm: boolean) => run(async () => {
    if (!del) return;
    const r = await deleteVariant(deps, del, confirm);
    if (r.kind === 'error') { setDel(null); return setNotice(r); }
    if (r.kind === 'deleted') { setDel(null); changed(); }
  });
  const doPreview = (v: GitVariant) => run(async () => {
    try { beforeCombine?.(); } catch { return setNotice({kind:'text',key:'board.error.stale'}); }
    const r = await previewCombine(deps, v.name);
    if (r.kind === 'error') return setNotice(r);
    setPreview(r.preview);
  });
  const doStart = () => run(async () => {
    if (!preview) return;
    try { beforeCombine?.(); } catch { setPreview(null); return setNotice({kind:'text',key:'board.error.stale'}); }
    const r = await startCombine(deps, preview);
    if (r.kind === 'guard' || r.kind === 'dirty' || r.kind === 'error') { setPreview(null); return setNotice(r); }
    setPreview(null);
    onDiskChanged(); changed();
    if (r.kind !== 'fast-forwarded') openResolver(r.session);
  });
  const doFinish = () => run(async () => {
    if (!resolver) return;
    const r = await finishCombine(deps, resolver.session, resolver.drafts, resolver.message);
    if (r.kind === 'finished') { setResolver(null); onDiskChanged(); return changed(); }
    if (r.kind === 'incomplete') return setNotice({ kind: 'text', key: 'variants.err.unresolved' });
    setNotice(r);
  });
  const doAbort = () => run(async () => {
    const r = await abortCombine(deps);
    if (r.kind !== 'aborted') return setNotice(r);
    setResolver(null); onDiskChanged(); changed();
  });

  useEffect(() => {
    if (!initialCombineTarget) return;
    let active = true;
    try { beforeCombine?.(); } catch { setNotice({kind:'text',key:'board.error.stale'}); return; }
    void previewCombine(deps,initialCombineTarget).then(r=>{if(active){if(r.kind==='preview')setPreview(r.preview);else setNotice(r);}});
    return()=>{active=false;};
  }, [deps, initialCombineTarget]);

  return (
    <div className="vt-root">
      <form className="vt-new" onSubmit={e => { e.preventDefault(); void create(true); }}>
        <label htmlFor="vt-new-name">{t('variants.new.label')}</label>
        <div className="vt-new-row">
          <input id="vt-new-name" type="text" value={newName} maxLength={100} placeholder={t('variants.new.placeholder')} onChange={e => setNewName(e.target.value)} />
          <Button type="submit" variant="primary" disabled={busy || !newName.trim()}><Plus size={14} aria-hidden="true" />{t('variants.new.start')}</Button>
        </div>
        <p className="vt-hint">{t('variants.new.hint')}</p>
      </form>
      {notice && <Notice n={notice} onSaveVersion={onSaveVersion} />}
      <VariantsList variants={initialCombineTarget?variants.filter(v=>v.name===initialCombineTarget):variants} busy={busy} onOpen={doOpen} onCombine={doPreview} onRename={v => setRename({ v, value: v.name })} onDelete={setDel} />

      <Dialog open={!!rename} onOpenChange={o => { if (!o) setRename(null); }}>
        <DialogContent className="dlg-popup" aria-label={t('variants.rename.title')}>
          <div className="dlg-body">
            <DialogTitle>{t('variants.rename.title')}</DialogTitle>
            <input type="text" aria-label={t('variants.rename.title')} value={rename?.value ?? ''} maxLength={100} onChange={e => rename && setRename({ ...rename, value: e.target.value })} />
          </div>
          <footer className="dlg-foot"><Button className="dlg-cancel" onClick={() => setRename(null)}>{t('dialogs.cancel')}</Button><span className="dlg-spacer" /><Button variant="primary" disabled={busy || !rename?.value.trim()} onClick={() => void doRename()}>{t('variants.rename.confirm')}</Button></footer>
        </DialogContent>
      </Dialog>

      <Dialog open={!!del} onOpenChange={o => { if (!o) setDel(null); }}>
        <DialogContent className="dlg-popup" role="alertdialog" aria-label={t('variants.delete.title', { name: del?.name ?? '' })}>
          <div className="dlg-body">
            <DialogTitle>{t('variants.delete.title', { name: del?.name ?? '' })}</DialogTitle>
            <DialogDescription>{del && !del.merged ? t('variants.delete.unmerged', { count: del.ahead }) : t('variants.delete.merged')}</DialogDescription>
          </div>
          <footer className="dlg-foot"><Button className="dlg-cancel" autoFocus onClick={() => setDel(null)}>{t('dialogs.cancel')}</Button><span className="dlg-spacer" /><Button className="dlg-danger" disabled={busy} onClick={() => void doDelete(true)}>{t('variants.delete.confirm')}</Button></footer>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={o => { if (!o) setPreview(null); }}>
        <DialogContent className="dlg-popup" aria-label={t('variants.combine.title')}>
          {preview && (
            <div className="dlg-body">
              <DialogTitle>{t('variants.combine.titleNamed', { name: preview.name, current: preview.current })}</DialogTitle>
              <DialogDescription>{preview.fastForward ? t('variants.combine.ff') : t('variants.combine.body')}</DialogDescription>
              <h4>{t('variants.combine.versions', { count: preview.commits.length })}</h4>
              <ul className="vt-commits">{preview.commits.map(c => <li key={c.sha}>{c.subject}</li>)}</ul>
              <h4>{t('variants.combine.files', { count: preview.files.length })}</h4>
              <ul className="vt-commits">{preview.files.map(f => <li key={f.path}>{t(`variants.combine.kind.${f.kind}`)}: {f.path}</li>)}</ul>
              {preview.truncated && <p className="vt-hint">{t('variants.combine.truncated')}</p>}
              <p className="vt-hint">{t('variants.combine.safety')}</p>
            </div>
          )}
          <footer className="dlg-foot"><Button className="dlg-cancel" onClick={() => setPreview(null)}>{t('dialogs.cancel')}</Button><span className="dlg-spacer" /><Button variant="primary" autoFocus disabled={busy || !!preview?.upToDate} onClick={() => void doStart()}>{t('variants.combine.start')}</Button></footer>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resolver} onOpenChange={() => { /* no light dismiss: use Cancel combine or Finish */ }}>
        <DialogContent className="dlg-popup vr-popup" role="alertdialog" aria-label={t('variants.conflict.title')}>
          {resolver && (
            <>
              <header className="dlg-head"><div className="dlg-head-text"><DialogTitle>{t('variants.conflict.title')}</DialogTitle><DialogDescription>{t('variants.conflict.desc', { name: resolver.session.name })}</DialogDescription></div></header>
              {resolver.session.conflicts.length === 0 && <p className="vt-hint">{t('variants.conflict.none')}</p>}
              <ConflictResolver
                yoursName={t('variants.conflict.openVariant')}
                theirsName={resolver.session.name}
                drafts={resolver.drafts}
                selected={resolver.selected}
                message={resolver.message}
                busy={busy}
                onSelect={i => setResolver({ ...resolver, selected: i })}
                onChange={(i, d) => setResolver({ ...resolver, drafts: resolver.drafts.map((x, j) => (j === i ? d : x)) })}
                onMessage={m => setResolver({ ...resolver, message: m })}
                onFinish={() => void doFinish()}
                onAbort={() => void doAbort()}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
