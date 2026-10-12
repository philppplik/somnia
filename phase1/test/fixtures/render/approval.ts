import {existsSync, readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {manifest, root} from './corpus';
export interface GoldenApproval {
  approver: 'Philipp Paulik'; source: string; reason: string; fixtures: string[];
}
export function validateApproval(value: unknown): GoldenApproval {
  const a = value as Partial<GoldenApproval> | null;
  if (!a || a.approver !== 'Philipp Paulik' || typeof a.source !== 'string' || !a.source.trim()
      || typeof a.reason !== 'string' || !a.reason.trim() || !Array.isArray(a.fixtures) || !a.fixtures.length
      || a.fixtures.some(id => typeof id !== 'string' || !manifest.fixtures.some(f => f.id === id))
      || new Set(a.fixtures).size !== a.fixtures.length) {
    throw new Error('Golden update requires Philipp Paulik approval: source reference, reason, explicit valid fixture IDs.');
  }
  return a as GoldenApproval;
}
export function updateScope(env = process.env): string[] | null {
  if (env.SOMNIA_RENDER_BOOTSTRAP === '1') {
    if (existsSync(path.join(root, 'goldens')) && readdirSync(path.join(root, 'goldens')).some(f => f.endsWith('.png'))) {
      throw new Error('Bootstrap is only for an empty golden directory. Existing references need approval.');
    }
    return manifest.fixtures.map(f => f.id);
  }
  if (!env.SOMNIA_RENDER_APPROVAL) throw new Error('Use the approved update runner; direct snapshot updates are refused.');
  return validateApproval(JSON.parse(readFileSync(env.SOMNIA_RENDER_APPROVAL, 'utf8'))).fixtures;
}
