import {useEffect, useState} from 'react';
import type {GitBackend, GitVersion} from '../../lib/git/types';
import {useT} from '../../lib/useT';
/** Two version dropdowns (older, newer) over the project log. Defaults to the newest two versions. */
export function VersionPicker({backend, onChange, disabled}: {backend: GitBackend; disabled?: boolean; onChange: (from: string, to: string) => void}) {
 const {t, locale} = useT();
 const [versions, setVersions] = useState<GitVersion[] | null>(null), [from, setFrom] = useState(''), [to, setTo] = useState(''), [error, setError] = useState(false);
 useEffect(() => {let on = true; backend.log({limit: 50}).then(v => {if (!on) return; setVersions(v); if (v.length > 1) {setTo(v[0].sha); setFrom(v[1].sha); onChange(v[1].sha, v[0].sha);}}).catch(() => {if (on) {setVersions([]); setError(true);}}); return () => {on = false;};}, [backend]);
 const label = (v: GitVersion) => `${v.subject.slice(0, 48)} · ${new Intl.DateTimeFormat(locale, {dateStyle: 'medium'}).format(v.time * 1000)} · ${v.sha.slice(0, 8)}`;
 if (versions === null) return <p className="text-xs text-ink-3" role="status">{t('versions.loading')}</p>;
 if (error) return <p role="alert" className="text-xs text-ink">{t('versions.explain.error')}</p>;
 if (versions.length < 2) return <p className="text-xs text-ink-3" data-testid="picker-few">{t('versions.explain.needTwo')}</p>;
 const sel = (id: string, text: string, value: string, set: (v: string) => void, other: (v: string) => void) => <label className="flex flex-col gap-1 text-[11px] text-ink-2">{text}
  <select data-testid={id} disabled={disabled} className="h-8 min-w-0 rounded-sm border border-subtle bg-elevated px-2 text-xs text-ink" value={value} onChange={e => {set(e.target.value); other(e.target.value);}}>{versions.map(v => <option key={v.sha} value={v.sha}>{label(v)}</option>)}</select></label>;
 return <div className="flex flex-col gap-2">
  {sel('picker-from', t('versions.explain.from'), from, setFrom, v => onChange(v, to))}
  {sel('picker-to', t('versions.explain.to'), to, setTo, v => onChange(from, v))}
 </div>;
}
