/** Safe ZIP probing for Office files. Reads only the central directory, never inflates entries. */
export const MAX_OFFICE_BYTES = 25_000_000;
export const MAX_OFFICE_UNPACKED = 64 * 1024 * 1024;
export const MAX_OFFICE_ENTRIES = 10_000;
export type OfficeKind = 'docx' | 'xlsx' | 'pptx';
export interface ZipEntry {name: string; size: number; encrypted: boolean}
export const isZip = (b: Uint8Array) => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
/** Lists central-directory entries. Throws on corrupt, multi-volume, ZIP64 or oversized archives. */
export function listZip(data: Uint8Array): ZipEntry[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === data.length) {end = i; break;}
  }
  if (end < 0) throw Error('Invalid Office file: ZIP directory is missing.');
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), offset = view.getUint32(end + 16, true);
  if (count === 65535 || size === 0xffffffff || offset === 0xffffffff) throw Error('ZIP64 Office files are not supported.');
  if (offset + size > end || count > MAX_OFFICE_ENTRIES) throw Error('Invalid or oversized Office ZIP directory.');
  const out: ZipEntry[] = [];
  let cursor = offset, total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > offset + size || view.getUint32(cursor, true) !== 0x02014b50) throw Error('Invalid Office ZIP entry.');
    const n = view.getUint16(cursor + 28, true), x = view.getUint16(cursor + 30, true), c = view.getUint16(cursor + 32, true);
    const next = cursor + 46 + n + x + c;
    if (next > offset + size) throw Error('Invalid Office ZIP entry size.');
    const entrySize = view.getUint32(cursor + 24, true);
    total += entrySize;
    if (total > MAX_OFFICE_UNPACKED) throw Error('Office file expands beyond the 64 MiB safety limit.');
    out.push({name: new TextDecoder().decode(data.subarray(cursor + 46, cursor + 46 + n)), size: entrySize, encrypted: !!(view.getUint16(cursor + 8, true) & 1)});
    cursor = next;
  }
  return out;
}
/** Decides by package parts, not by file name. Returns null for any other ZIP (also legacy .doc/.xls, which are not ZIPs). */
export function sniffOffice(data: Uint8Array): OfficeKind | null {
  if (!isZip(data)) return null;
  let entries: ZipEntry[];
  try {entries = listZip(data);} catch {return null;}
  const has = (n: string) => entries.some(e => e.name === n);
  if (!has('[Content_Types].xml')) return null;
  if (has('word/document.xml')) return 'docx';
  if (has('xl/workbook.xml')) return 'xlsx';
  if (has('ppt/presentation.xml')) return 'pptx';
  return null;
}
