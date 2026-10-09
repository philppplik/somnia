import { exportSvg, importSvg, LIMITS, type VectorDocument, type ImportResult } from '../../../lib/vectorio';
/** Import replaces a document, never silently merges two identity spaces. */
export async function readSvgFile(file: Pick<File, 'size' | 'text'>): Promise<ImportResult> {
  if (file.size > LIMITS.maxBytes) throw new RangeError('SVG exceeds the 8 MiB import limit.');
  return importSvg(await file.text());
}
export function svgExportSource(doc: VectorDocument): string {
  if (!(Number.isFinite(doc.width) && doc.width > 0 && Number.isFinite(doc.height) && doc.height > 0)) throw new RangeError('Document dimensions must be positive.');
  for (const p of doc.paths) for (const n of p.nodes) for (const point of [n, n.in, n.out]) {
    if (point && (!Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new RangeError('Document contains invalid coordinates.');
  }
  return exportSvg(doc);
}
export function downloadSvg(doc: VectorDocument, name = 'Untitled.svg'): void {
  const url = URL.createObjectURL(new Blob([svgExportSource(doc)], { type: 'image/svg+xml;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name.replace(/\.svg$/i, '') + '.svg';
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
