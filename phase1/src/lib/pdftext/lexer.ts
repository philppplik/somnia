import { PdfTextError } from './types';
export interface Token { start: number; end: number; value: string; kind: 'name' | 'number' | 'string' | 'operator'; bytes?: Uint8Array }
const white = /[\x00\t\n\f\r ]/;
const delimiter = /[\x00\t\n\f\r ()<>\[\]{}\/%]/;
const unsupported = (message: string): never => { throw new PdfTextError('UNSUPPORTED_CONTENT', message); };
/** Small fail-closed lexer, not a general PDF parser. Never regex-replace PDF bytes. */
export function tokenize(source: string): Token[] {
  const result: Token[] = [];
  let i = 0;
  while (i < source.length) {
    if (white.test(source[i])) { i++; continue; }
    if (source[i] === '%') { while (i < source.length && !/[\r\n]/.test(source[i])) i++; continue; }
    const start = i;
    let kind: Token['kind'];
    let bytes: Uint8Array | undefined;
    if (source[i] === '(') {
      kind = 'string'; i++; let depth = 1; const values: number[] = [];
      while (i < source.length && depth) {
        let ch = source[i++];
        if (ch === '\\') {
          if (i >= source.length) unsupported('Incomplete literal string escape.');
          ch = source[i++];
          if (ch === '\r' || ch === '\n') { if (ch === '\r' && source[i] === '\n') i++; continue; }
          if (/[0-7]/.test(ch)) { let octal = ch; for (let n = 0; n < 2 && /[0-7]/.test(source[i] ?? 'x'); n++) octal += source[i++]; values.push(parseInt(octal, 8) & 255); }
          else values.push(({ n: 10, r: 13, t: 9, b: 8, f: 12 } as Record<string, number>)[ch] ?? ch.charCodeAt(0));
        } else if (ch === '(') { depth++; values.push(40); }
        else if (ch === ')') { if (--depth) values.push(41); }
        else if (ch === '\r') { if (source[i] === '\n') i++; values.push(10); }
        else values.push(ch.charCodeAt(0));
      }
      if (depth) unsupported('Unterminated literal string.');
      bytes = Uint8Array.from(values);
    } else if (source[i] === '<' && source[i + 1] !== '<') {
      kind = 'string'; i++; let hex = '';
      while (i < source.length && source[i] !== '>') { if (!white.test(source[i])) hex += source[i]; i++; }
      if (source[i++] !== '>' || !/^[0-9a-f]*$/i.test(hex)) unsupported('Invalid hexadecimal string.');
      if (hex.length % 2) hex += '0';
      bytes = Uint8Array.from(hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);
    } else {
      if ('[]<>{}'.includes(source[i])) unsupported('Arrays, dictionaries, TJ text arrays and inline image data are not supported.');
      if (source[i] === '/') { kind = 'name'; i++; }
      else kind = 'operator';
      while (i < source.length && !delimiter.test(source[i])) i++;
      if (i === start) unsupported('Unexpected content delimiter.');
      if (kind === 'operator' && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(source.slice(start, i))) kind = 'number';
    }
    result.push({ start, end: i, kind, value: source.slice(start, i), bytes });
  }
  return result;
}
