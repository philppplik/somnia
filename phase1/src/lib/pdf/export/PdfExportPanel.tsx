import { useId, useRef, useState } from 'react';
import { exportPdf } from './pipeline';
import { exportPrintInWorker } from './workerClient';
import { exportMessages } from './locales';
import { exportCapabilities, type ExportEnvironment } from './capabilities';
import type { ExportLocale, ExportPreset, ExportResult, RasterRenderer } from './types';
import './panel.css';
/** Source snapshot in, copy out. Parent owns filesystem saves and dirty-session state. */
export function PdfExportPanel({ bytes, locale = 'en', environment, renderer, onExport }: {
  bytes: Uint8Array; locale?: ExportLocale; environment: ExportEnvironment;
  renderer?: RasterRenderer; onExport: (result: ExportResult) => void | Promise<void>;
}) {
  const m = exportMessages[locale], id = useId();
  const capabilities = exportCapabilities({ ...environment, canvas:environment.canvas && !!renderer }, locale);
  const [preset,setPreset] = useState<ExportPreset>('print');
  const [title,setTitle] = useState(''), [author,setAuthor] = useState(''), [subject,setSubject] = useState(''), [keywords,setKeywords] = useState('');
  const [dpi,setDpi] = useState(120), [quality,setQuality] = useState(78);
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [ready,setReady] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const enabled = capabilities.find(c => c.id === preset)?.enabled;
  async function run() {
    if (busy || !enabled) return;
    setBusy(true); setError(''); setReady(false);
    const ac = new AbortController(); controller.current = ac;
    try {
      const options = { dpi, quality:quality/100, signal:ac.signal,
        metadata:{ ...(title ? { title } : {}), ...(author ? { author } : {}), ...(subject ? { subject } : {}),
          ...(keywords ? { keywords:keywords.split(',').map(s => s.trim()).filter(Boolean) } : {}) } };
      const result = preset === 'print' ? await exportPrintInWorker(bytes, options) : await exportPdf(bytes, { ...options, preset, renderer });
      await onExport(result); setReady(true);
    } catch(e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : m.invalid); }
    finally { setBusy(false); controller.current = null; }
  }
  return <section className="pdf-export-panel" aria-labelledby={`${id}-title`} aria-busy={busy}>
    <h2 id={`${id}-title`}>{m.title}</h2>
    <fieldset disabled={busy}><legend>{m.preset}</legend>
      {capabilities.filter(c => c.id === 'print' || c.id === 'screen').map(c => <label className="pdf-export-option" key={c.id}>
        <span><input type="radio" name={`${id}-preset`} checked={preset === c.id} disabled={!c.enabled} onChange={() => setPreset(c.id as ExportPreset)} /> {c.label}</span><small>{c.reason}</small>
      </label>)}
      {preset === 'screen' && <div className="pdf-export-grid"><label>{m.dpi}<input type="number" min={72} max={300} value={dpi} onChange={e => setDpi(e.target.valueAsNumber)} /></label><label>{m.quality}<input type="number" min={10} max={100} value={quality} onChange={e => setQuality(e.target.valueAsNumber)} /></label></div>}
    </fieldset>
    <p>{m.flattenHelp}</p><p className="pdf-export-note">{m.unsupported}</p>
    <fieldset disabled={busy}><legend>{m.metadata}</legend><div className="pdf-export-grid">
      <label>{m.documentTitle}<input value={title} maxLength={20000} onChange={e => setTitle(e.target.value)} /></label>
      <label>{m.author}<input value={author} maxLength={20000} onChange={e => setAuthor(e.target.value)} /></label>
      <label>{m.subject}<input value={subject} maxLength={20000} onChange={e => setSubject(e.target.value)} /></label>
      <label>{m.keywords}<input value={keywords} onChange={e => setKeywords(e.target.value)} /></label>
    </div></fieldset>
    <ul className="pdf-export-features">{capabilities.filter(c => c.id !== 'print' && c.id !== 'screen').map(c => <li key={c.id}>
      <label><input type="checkbox" disabled checked={c.enabled} readOnly /> {c.label}</label><small>{c.reason}</small>
    </li>)}</ul>
    {error && <p role="alert">{error}</p>}{ready && <p role="status">{m.done}</p>}
    <div className="pdf-export-actions"><button type="button" disabled={busy || !enabled} onClick={() => void run()}>{busy ? m.busy : m.export}</button>
      {busy && <button type="button" onClick={() => controller.current?.abort()}>{m.cancel}</button>}</div>
  </section>;
}
