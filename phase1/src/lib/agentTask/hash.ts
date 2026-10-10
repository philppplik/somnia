/** SHA-256 hex via Web Crypto (browser, Tauri webview and Node >= 19). */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}
/** Content hash over (path, blob sha) entries, order independent. Used to bind verification/review approvals. */
export async function contentHashOf(entries: readonly { path: string; sha: string }[]): Promise<string> {
  const lines = entries.map(e => `${e.sha}\t${e.path}`).sort();
  return sha256Hex(lines.join('\n'));
}
