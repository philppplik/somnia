import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const files = ['README.md','USER-GUIDE.md','DEVELOPER-GUIDE.md','SECURITY-AND-POLICY.md','INTEGRATION.md'];
test('auth documentation local links resolve', () => {
  for (const file of files) {
    const path = `docs/auth/${file}`;
    for (const match of read(path).matchAll(/\]\(([^)]+)\)/g)) {
      const link = match[1].split('#')[0];
      if (!link || /^(https?:|mailto:)/.test(link)) continue;
      assert.ok(existsSync(resolve(root, dirname(path), link)), `${path}: ${link}`);
    }
  }
});
test('baseline guide does not present OAuth as implemented', () => {
  assert.match(read('docs/auth/README.md'), /Account OAuth is not implemented/);
  assert.match(read('docs/auth/USER-GUIDE.md'), /Not available in the inspected baseline/);
  assert.match(read('docs/auth/SECURITY-AND-POLICY.md'), /research result pending/);
});
test('documented native commands exist in inspected source', () => {
  const source = read('phase1/src-tauri/src/desktop.rs');
  const docs = read('docs/auth/DEVELOPER-GUIDE.md');
  for (const name of ['agent_key_status','agent_key_save','agent_key_delete','agent_settings_load','agent_settings_save','provider_http_start','provider_http_next','provider_http_cancel']) {
    assert.ok(source.includes(`fn ${name}(`), `${name} source`);
    assert.ok(docs.includes(`\`${name}\``), `${name} documentation`);
  }
});
test('metadata endpoints correspond to authentication adapter', () => {
  const source = read('phase1/src/lib/agent/providerAuth.ts');
  const docs = read('docs/auth/DEVELOPER-GUIDE.md');
  for (const url of ['https://api.openai.com/v1/models','https://api.anthropic.com/v1/models?limit=1','https://openrouter.ai/api/v1/key','http://127.0.0.1:11434/api/tags']) {
    assert.ok(source.includes(url), `${url} source`);
    assert.ok(docs.includes(url), `${url} documentation`);
  }
});
