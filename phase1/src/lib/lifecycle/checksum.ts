/**
 * Integrity checksums for lifecycle checkpoints. FNV-1a (two 32-bit lanes
 * with distinct seeds, rendered as 64-bit hex): fast, deterministic and good
 * enough to catch torn or stale in-memory checkpoints. Not a security hash.
 */

const fnv = (data: Uint8Array, seed: number): number => {
  let h = seed >>> 0;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

export function checksumBytes(data: Uint8Array): string {
  const a = fnv(data, 0x811c9dc5);
  const b = fnv(data, 0x01000193);
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/**
 * Checksum over heterogeneous identity parts. Strings and numbers are encoded
 * with separators and length prefixes so concatenation ambiguities cannot
 * produce equal checksums for different payloads.
 */
export function checksumParts(parts: readonly (string | number | Uint8Array | null | undefined)[]): string {
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    if (part == null) {
      chunks.push(utf8('\0n\0'));
    } else if (typeof part === 'number') {
      chunks.push(utf8(`\0d${part}\0`));
    } else if (typeof part === 'string') {
      chunks.push(utf8(`\0s${part.length}:${part}\0`));
    } else {
      const head = utf8(`\0b${part.byteLength}:`);
      chunks.push(head, part, utf8('\0'));
    }
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const flat = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    flat.set(c, offset);
    offset += c.byteLength;
  }
  return checksumBytes(flat);
}
