import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { DeployArtifactManifest } from './types'

test('artifact contract keeps static and Node metadata renderer-safe', () => {
  const staticArtifact: DeployArtifactManifest = {
    kind: 'static', buildId: 'build-1',
    files: [{ path: 'index.html', sha256: 'a'.repeat(64), size: 2, mode: 0o644 }],
  }
  const nodeArtifact: DeployArtifactManifest = {
    ...staticArtifact, kind: 'node', entry: 'index.html', engines: { node: '>=22' }, port: 3000,
  }
  const roundTrip = JSON.parse(JSON.stringify(nodeArtifact))
  assert.equal(roundTrip.buildId, 'build-1')
  assert.equal(roundTrip.files[0].mode, 420)
  assert.deepEqual(roundTrip.engines, { node: '>=22' })
  assert.equal(roundTrip.entry, 'index.html')
  assert.equal(roundTrip.port, 3000)
  const rust = readFileSync('src-tauri/src/deploy/manifest.rs', 'utf8')
  for (const field of ['kind', 'files', 'entry', 'engines', 'port', 'build_id']) {
    assert.ok(rust.includes(`pub ${field}:`), `Rust missing ${field}`)
  }
  assert.ok(rust.includes('rename_all = "camelCase"'))
  const types = readFileSync('src/lib/deploy/types.ts', 'utf8')
  assert.doesNotMatch(types, /(?:privateKey|password|passphrase|accessToken)\s*:/)
})
