/** XLSX read (values only) and write (plain values). Pure fflate (MIT) + XML text handling; no formulas evaluated, no macros, no styles. */
import {unzipSync, zipSync, strToU8, strFromU8} from 'fflate';
import {decodeXML} from 'entities';
import {listZip, sniffOffice, MAX_OFFICE_BYTES} from './zipProbe';
export type Cell = string | number | boolean | null;
export interface Sheet {name: string; rows: Cell[][]; truncated: boolean}
export const LIMITS = {rows: 5000, cols: 200, sheets: 50, cellChars: 32_767, part: 32 * 1024 * 1024};
const colIndex = (ref: string) => {let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1;};
const colName = (i: number) => {let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s;};
const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
const dec = (s: string) => decodeXML(s);
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => dec(m[1])).join('');
function part(files: Record<string, Uint8Array>, name: string): string | null {
  const f = files[name]; return f ? strFromU8(f) : null;
}
export function readXlsx(bytes: Uint8Array): {sheets: Sheet[]; warnings: string[]} {
  if (bytes.length > MAX_OFFICE_BYTES) throw Error('XLSX is larger than 25 MB.');
  if (sniffOffice(bytes) !== 'xlsx') throw Error('Not a valid XLSX file.');
  const entries = listZip(bytes);
  if (entries.some(e => e.encrypted)) throw Error('Encrypted XLSX files are not supported.');
  if (entries.some(e => e.size > LIMITS.part)) throw Error('An XLSX part is larger than the 32 MB safety limit.');
  const want = (n: string) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n);
  const files = unzipSync(bytes, {filter: f => want(f.name)});
  const warnings: string[] = ['Values only. Formulas show their last saved result; formatting, charts, pivots and macros are not shown.'];
  const shared = (part(files, 'xl/sharedStrings.xml')?.match(/<si\b[\s\S]*?<\/si>/g) ?? []).map(textOf);
  const wb = part(files, 'xl/workbook.xml') ?? '';
  const rels = part(files, 'xl/_rels/workbook.xml.rels') ?? '';
  const target = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {const id = attr(m[0], 'Id'), t = attr(m[0], 'Target'); if (id && t) target.set(id, t.startsWith('/') ? t.slice(1) : 'xl/' + t);}
  const sheets: Sheet[] = [];
  const tags = [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => m[0]);
  if (tags.length > LIMITS.sheets) warnings.push(`Only the first ${LIMITS.sheets} sheets are shown.`);
  for (const tag of tags.slice(0, LIMITS.sheets)) {
    const name = dec(attr(tag, 'name') ?? 'Sheet'), rid = /\br:id="([^"]*)"/.exec(tag)?.[1];
    const path = rid ? target.get(rid) : undefined;
    const xml = path ? part(files, path) : null;
    if (xml === null) {warnings.push(`Sheet "${name}" could not be read.`); continue;}
    const rows: Cell[][] = []; let truncated = false;
    for (const r of xml.matchAll(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)) {
      const rowTag = /^<row\b[^>]*/.exec(r[0])![0];
      const ri = Number(attr(rowTag, 'r') ?? rows.length + 1) - 1;
      if (ri >= LIMITS.rows) {truncated = true; break;}
      const row: Cell[] = rows[ri] = rows[ri] ?? [];
      for (const c of r[0].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ci = colIndex(attr(c[1], 'r') ?? colName(row.length));
        if (ci < 0 || ci >= LIMITS.cols) {truncated = true; continue;}
        const t = attr(c[1], 't'), body = c[2] ?? '';
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let val: Cell = null;
        if (t === 'inlineStr') val = textOf(body);
        else if (v !== undefined) {
          if (t === 's') val = shared[Number(v)] ?? '';
          else if (t === 'b') val = v === '1';
          else if (t === 'str' || t === 'e') val = dec(v);
          else val = Number.isFinite(Number(v)) ? Number(v) : dec(v);
        }
        if (typeof val === 'string' && val.length > LIMITS.cellChars) {val = val.slice(0, LIMITS.cellChars); truncated = true;}
        row[ci] = val;
      }
    }
    for (let i = 0; i < rows.length; i++) rows[i] = Array.from(rows[i] ?? [], x => x ?? null);
    if (truncated) warnings.push(`Sheet "${name}" is cut to ${LIMITS.rows} rows and ${LIMITS.cols} columns.`);
    sheets.push({name, rows, truncated});
  }
  if (/<definedName|vbaProject/.test(wb) || entries.some(e => /vbaProject\.bin$/.test(e.name))) warnings.push('This file contains macros or named ranges. They are ignored and never run.');
  return {sheets, warnings};
}
const esc = (s: string) => s.replace(/[<>&"]/g, c => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;'}[c]!)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const safeSheetName = (n: string, used: Set<string>) => {
  let s = n.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
  for (let i = 2; used.has(s.toLowerCase()); i++) s = s.slice(0, 28) + ' ' + i;
  used.add(s.toLowerCase()); return s;
};
/** Writes plain values. Strings starting with = + - @ are stored as text (inline strings), never as formulas. */
export function writeXlsx(sheets: {name: string; rows: Cell[][]}[]): Uint8Array {
  if (!sheets.length) throw Error('At least one sheet is required.');
  const used = new Set<string>();
  const names = sheets.map(s => safeSheetName(s.name, used));
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`),
  };
  sheets.forEach((s, i) => {
    const rows = s.rows.slice(0, 1_048_576).map((r, ri) => {
      const cells = r.slice(0, 16_384).map((v, ci) => {
        if (v === null || v === undefined || v === '') return '';
        const ref = colName(ci) + (ri + 1);
        if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : '';
        if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v.slice(0, LIMITS.cellChars))}</t></is></c>`;
      }).join('');
      return cells ? `<row r="${ri + 1}">${cells}</row>` : '';
    }).join('');
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`);
  });
  return zipSync(files, {level: 6});
}
/** CSV with RFC 4180 quoting. Values are not altered; open the result as data, not as a trusted spreadsheet. */
export function sheetToCsv(rows: Cell[][]): string {
  return rows.map(r => r.map(v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n') + '\r\n';
}
