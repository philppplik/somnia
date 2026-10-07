/** Collaboration identity: session names and the small session-only avatar thumbnail. Pure and DOM-free except makeThumbnail. */
export const SESSION_NAME_MAX = 32;
export const AVATAR_PX = 48;
/** Ceiling for the whole UTF-8 data URL (prefix and base64 included). */
export const AVATAR_MAX_CHARS = 8 * 1024;
/** Admission budget for all thumbnails of one session, independent of the chat history budget. */
export const AVATAR_TOTAL_CHARS = 128 * 1024;
export const AVATAR_MAX_ENTRIES = 16;
export const AVATAR_MAP_KEY = "participantAvatarsV1";
export type NameCheck =
  | { ok: true; name: string }
  | { ok: false; reason: "empty" | "invalid" | "long" };
// C0/C1 controls, line/paragraph separators, bidi embeddings/overrides/isolates, angle brackets (the wire sanitizer strips these).
const BAD_NAME = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069<>]/;
/** Characters that render as nothing: a name made only of these would look blank to other people. */
const INVISIBLE_ONLY = /[\u200b-\u200d\u2060\u2800\ufeff]/g;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
/** Strict check for the new join/host inputs. Never truncates or deletes characters silently. */
export function checkSessionName(raw: string): NameCheck {
  const name = raw.trim();
  if (!name) return { ok: false, reason: "empty" };
  if (BAD_NAME.test(name) || LONE_SURROGATE.test(name)) return { ok: false, reason: "invalid" };
  if (!name.replace(INVISIBLE_ONLY, "").trim()) return { ok: false, reason: "empty" };
  if (name.length > SESSION_NAME_MAX) return { ok: false, reason: "long" };
  return { ok: true, name };
}
/** Shorten for presentation only, on a grapheme boundary when Intl.Segmenter exists, never inside a surrogate pair. */
export function shortenForDisplay(name: string, max = SESSION_NAME_MAX) {
  if (name.length <= max) return name;
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  let out = "";
  if (Seg) {
    for (const { segment } of new Seg(undefined, { granularity: "grapheme" }).segment(name)) {
      if (out.length + segment.length > max - 1) break;
      out += segment;
    }
  } else {
    for (const ch of name) {
      if (out.length + ch.length > max - 1) break;
      out += ch;
    }
  }
  return out + "\u2026";
}
const JPEG_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const PREFIX = "data:image/jpeg;base64,";
/** Width/height from the first SOF marker; null for anything that is not a plain JPEG. */
export function jpegSize(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const m = bytes[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2) return null;
    if (m === 0xc0 || m === 0xc1 || m === 0xc2) {
      if (i + 9 >= bytes.length) return null;
      return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    if (m === 0xda) return null; // image data before any SOF
    i += 2 + len;
  }
  return null;
}
/** Validate one thumbnail data URL: exact prefix, base64 structure, total length, real JPEG header, 48 x 48. */
export function validAvatarUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > AVATAR_MAX_CHARS || v.length < PREFIX.length + 8 || !JPEG_URL.test(v)) return false;
  const b64 = v.slice(PREFIX.length);
  if (b64.length % 4 !== 0) return false;
  let bin: string;
  try { bin = atob(b64); } catch { return false; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const s = jpegSize(bytes);
  return !!s && s.w === AVATAR_PX && s.h === AVATAR_PX;
}
export interface AvatarRecord { v: 1; data: string }
/** A record carries a version and a data URL and nothing else. */
export function parseAvatarRecord(raw: unknown): AvatarRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const keys = Object.keys(r);
  if (keys.length !== 2 || r.v !== 1 || !validAvatarUrl(r.data)) return null;
  return { v: 1, data: r.data as string };
}
/**
 * Pick which map entries stay. Invalid entries never stay. Known participants come before unknown keys,
 * then keys sort ascending, so every peer reaches the same verdict. Count and total-size budgets apply.
 * Cooperative hygiene only: the participants share one session key, so this is not authentication.
 */
export function admitAvatars(entries: Iterable<[string, unknown]>, known: ReadonlySet<string>): { keep: Set<string>; drop: string[] } {
  const ok: string[] = [], drop: string[] = [], size = new Map<string, number>();
  for (const [k, v] of entries) {
    const rec = /^[a-zA-Z0-9_-]{1,100}$/.test(k) ? parseAvatarRecord(v) : null;
    if (rec) { ok.push(k); size.set(k, rec.data.length); } else drop.push(k);
  }
  ok.sort((a, b) => Number(known.has(b)) - Number(known.has(a)) || (a < b ? -1 : a > b ? 1 : 0));
  const keep = new Set<string>();
  let total = 0;
  for (const k of ok) {
    const n = size.get(k)!;
    if (keep.size >= AVATAR_MAX_ENTRIES || total + n > AVATAR_TOTAL_CHARS) drop.push(k);
    else { keep.add(k); total += n; }
  }
  return { keep, drop };
}
/** Decode, centre-crop and redraw to 48 x 48 JPEG (drops all metadata). Returns null when it cannot meet the 8 KiB ceiling. */
export async function makeThumbnail(src: string): Promise<string | null> {
  try {
    if (typeof document === "undefined" || typeof createImageBitmap !== "function") return null;
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src)) return null;
    const blob = await (await fetch(src)).blob();
    const img = await createImageBitmap(blob);
    try {
      const c = document.createElement("canvas");
      c.width = c.height = AVATAR_PX;
      const g = c.getContext("2d");
      if (!g) return null;
      const side = Math.min(img.width, img.height);
      g.fillStyle = "#fff";
      g.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
      g.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
      for (const q of [0.82, 0.7, 0.58, 0.45, 0.32, 0.2]) {
        const url = c.toDataURL("image/jpeg", q);
        if (url.length <= AVATAR_MAX_CHARS && validAvatarUrl(url)) return url;
      }
      return null;
    } finally { img.close(); }
  } catch { return null; }
}
