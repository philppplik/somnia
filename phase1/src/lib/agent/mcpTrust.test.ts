import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESTRICTED_POSTURE, permits, withPermission, digestIntact,
  grantSatisfiesMcpCall, revokeGrant, skillScriptGate, trustBadge,
  type AnyGrant, type McpGrant,
} from './mcpTrust';

test('restricted default permits nothing and trusts nothing', () => {
  const p = RESTRICTED_POSTURE;
  assert.equal(p.publisher.state, 'unverified');
  assert.equal(p.review, 'unreviewed');
  assert.equal(p.pinnedDigest, '');
  for (const perm of ['spawn_process', 'network_egress', 'read_filesystem', 'write_filesystem', 'read_clipboard', 'write_clipboard'] as const) {
    assert.equal(permits(p, perm), false);
  }
  assert.equal(digestIntact(p, 'ab'.repeat(32)), false);
});

test('axes are independent: a verified publisher changes neither review nor permissions', () => {
  const p = { ...RESTRICTED_POSTURE, publisher: { state: 'verified', keynum: 'aabbccdd' } as const };
  assert.equal(p.review, 'unreviewed');
  assert.equal(permits(p, 'network_egress'), false);
  const q = withPermission(p, 'read_clipboard');
  assert.equal(permits(q, 'read_clipboard'), true);
  assert.equal(permits(q, 'write_clipboard'), false);
});

test('a digest pin matches only the exact artifact', () => {
  const pin = 'cd'.repeat(32);
  const p = { ...RESTRICTED_POSTURE, pinnedDigest: pin };
  assert.equal(digestIntact(p, pin), true);
  assert.equal(digestIntact(p, 'ef'.repeat(32)), false);
});

test('grant types are separated: folder grants never satisfy MCP calls', () => {
  const folder: AnyGrant = { kind: 'folder', target: '/home/user/project' };
  const mcp: McpGrant = { kind: 'mcp', server: 'docs', tool: 'search', schemaHash: 'aa' };
  const call = { server: 'docs', tool: 'search', schemaHash: 'aa' };
  assert.equal(grantSatisfiesMcpCall(folder, call), false);
  assert.equal(grantSatisfiesMcpCall(mcp, call), true);
  // A changed schema hash drops the grant; a different tool of the same server too.
  assert.equal(grantSatisfiesMcpCall(mcp, { ...call, schemaHash: 'bb' }), false);
  assert.equal(grantSatisfiesMcpCall(mcp, { ...call, tool: 'delete' }), false);
});

test('revoking one grant store leaves the other untouched', () => {
  const grants: AnyGrant[] = [
    { kind: 'folder', target: '/tmp/a' },
    { kind: 'mcp', server: 'docs', tool: 'search', schemaHash: 'aa' },
  ];
  const withoutMcp = revokeGrant(grants, 'mcp', () => true);
  assert.deepEqual(withoutMcp.map((g) => g.kind), ['folder']);
  const withoutFolder = revokeGrant(grants, 'folder', () => true);
  assert.deepEqual(withoutFolder.map((g) => g.kind), ['mcp']);
});

test('skill script gate mirrors the policy mapping and never pre-approves', () => {
  assert.equal(skillScriptGate('unreviewed'), 'disabled');
  assert.equal(skillScriptGate('scanned'), 'consent-per-run');
  assert.equal(skillScriptGate('verified'), 'consent-per-run');
  assert.equal(trustBadge('verified'), 'verified');
});
