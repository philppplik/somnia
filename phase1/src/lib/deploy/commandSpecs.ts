/**
 * Deploy CommandSpecs (concept section 11.1).
 *
 * Levels: `deploy.targets.list` read, `deploy.plan` propose (stages the plan for the human, no upload),
 * everything that changes state is `ui` level, so agent and MCP origins are refused by the
 * dispatcher (`forbidden-origin`). Beyond that, every state-changing handler re-checks the origin
 * against HUMAN_ORIGINS (extension, macro, cli and the dev control channel cannot publish either)
 * and cannot complete without a confirmation dialog result: no token, flag, setting or schedule
 * is accepted as a parameter, so there is no UI-free route.
 *
 * An agent that wants a publish calls `deploy.plan`; the plan shows up in the Publish panel through
 * subscribeStagedPlans and the human starts `deploy.publish` with a click.
 */
import { openDeploySetup } from './setup';
import { CommandDispatchError } from '../commandDispatcher';
import type { CommandContext, CommandOrigin, CommandSpec } from '../commandSpec';
import type { DeployBackend, DeployHostKeyInfo, DeployOutcome, DeployPlan, DeployTarget, DeployTargetStatus } from './contract';
import { consumeGesture, DeployConfirmationError, getDeployConfirmPresenter } from './confirmation';

/** Origins that stand for a person at the keyboard. Test builds use `test`. */
export const HUMAN_ORIGINS: readonly CommandOrigin[] = ['ui', 'palette', 'menu', 'shortcut', 'test'];

const ID = '^[a-z0-9-]{1,40}$';
const RELEASE = '^[a-z0-9-]{1,64}$|^[0-9]{8}T[0-9]{6}Z-[a-z0-9]{1,16}$';
const FINGERPRINT = '^SHA256:[A-Za-z0-9+/=]{10,64}$';
const idProp = { type: 'string', pattern: ID };
const NO_EXTRA = { additionalProperties: false } as const;

function requireHuman(ctx: CommandContext, id: string): void {
  if (!HUMAN_ORIGINS.includes(ctx.origin)) throw new CommandDispatchError('forbidden-origin', `Command ${id} needs a person: origin "${ctx.origin}" cannot run it.`);
}
/** Plain-language cancel: not an error, nothing happened. */
export interface Cancelled { status: 'cancelled' }
const cancelled: Cancelled = { status: 'cancelled' };

type StagedListener = (plan: DeployPlan) => void;
const staged = new Set<StagedListener>();
export function subscribeStagedPlans(fn: StagedListener): () => void { staged.add(fn); return () => { staged.delete(fn); }; }

export interface DeployCommandDeps { backend: () => DeployBackend }

export function createDeployCommandSpecs(deps: DeployCommandDeps): CommandSpec<never, unknown>[] {
  const be = () => deps.backend();
  const target = async (targetId: string): Promise<DeployTarget> => {
    const found = (await be().targetsList()).find(s => s.target.id === targetId);
    if (!found) throw Object.assign(new Error('deploy:target-not-found'), { expected: true });
    return found.target;
  };
  const common = { category: 'Project' as const };

  const specs: CommandSpec<any, any>[] = [
    {
      id: 'deploy.setup.open', title: 'Prepare publish server', ...common, level: 'ui',
      params: { type: 'object', properties: { targetId: idProp }, required: ['targetId'], ...NO_EXTRA },
      run: async (p: { targetId: string }, ctx: CommandContext) => { requireHuman(ctx, 'deploy.setup.open'); await target(p.targetId); openDeploySetup(p.targetId); return { status: 'opened' }; },
    },
    {
      id: 'deploy.key.public', title: 'Show publish public key', ...common, level: 'ui',
      params: { type: 'object', properties: { targetId: idProp }, required: ['targetId'], ...NO_EXTRA },
      run: async (p: { targetId: string }, ctx: CommandContext) => { requireHuman(ctx, 'deploy.key.public'); if (!be().keyPublic) throw new Error('deploy:key-backend'); return { publicKey: await be().keyPublic!(p.targetId) }; },
    },
    {
      id: 'deploy.cancel', title: 'Cancel publish', ...common, level: 'ui',
      params: { type: 'object', properties: { targetId: idProp }, required: ['targetId'], ...NO_EXTRA },
      run: async (p: { targetId: string }, ctx: CommandContext) => { requireHuman(ctx, 'deploy.cancel'); if (!be().cancel) throw new Error('deploy:engine-failed'); return { cancelled: await be().cancel!(p.targetId) }; },
    },
    {
      id: 'deploy.targets.list', title: 'List publish targets', ...common, level: 'read', params: { type: 'object', properties: {}, ...NO_EXTRA },
      run: (): Promise<DeployTargetStatus[]> => be().targetsList(),
    },
    {
      id: 'deploy.plan', title: 'Plan publish', ...common, level: 'propose',
      params: { type: 'object', properties: { targetId: idProp }, required: ['targetId'], ...NO_EXTRA },
      run: async (p: { targetId: string }): Promise<DeployPlan> => {
        const plan = await be().plan(p.targetId);
        for (const fn of [...staged]) { try { fn(plan); } catch { /* listeners must not break planning */ } }
        return plan;
      },
    },
    {
      id: 'deploy.publish', title: 'Publish', ...common, level: 'ui', keywords: ['deploy', 'upload', 'go live'],
      params: { type: 'object', properties: { targetId: idProp }, required: ['targetId'], ...NO_EXTRA },
      run: async (p: { targetId: string }, ctx: CommandContext): Promise<DeployOutcome | Cancelled> => {
        requireHuman(ctx, 'deploy.publish');
        const t = await target(p.targetId);
        const plan = await be().plan(p.targetId);
        const answer = await getDeployConfirmPresenter().confirmPlan(plan, t);
        if (!answer) return cancelled;
        consumeGesture(answer);
        const token = await be().confirmIssue(plan.planHash);
        return be().publish({ targetId: p.targetId, planHash: plan.planHash, token });
      },
    },
    {
      id: 'deploy.rollback', title: 'Go back to a previous version', ...common, level: 'ui',
      params: { type: 'object', properties: { targetId: idProp, releaseId: { type: 'string', pattern: RELEASE } }, required: ['targetId', 'releaseId'], ...NO_EXTRA },
      run: async (p: { targetId: string; releaseId: string }, ctx: CommandContext): Promise<DeployOutcome | Cancelled> => {
        requireHuman(ctx, 'deploy.rollback');
        const t = await target(p.targetId);
        const plan = await be().planRollback(p.targetId, p.releaseId);
        const answer = await getDeployConfirmPresenter().confirmPlan(plan, t);
        if (!answer) return cancelled;
        consumeGesture(answer);
        const token = await be().confirmIssue(plan.planHash);
        return be().rollback({ targetId: p.targetId, releaseId: p.releaseId, planHash: plan.planHash, token });
      },
    },
    {
      id: 'deploy.target.save', title: 'Save publish target', ...common, level: 'ui',
      params: {
        type: 'object', required: ['target'], ...NO_EXTRA,
        properties: { target: {
          type: 'object', required: ['id', 'name', 'host', 'port', 'user', 'kind', 'keySlot'], ...NO_EXTRA,
          properties: {
            id: idProp, name: { type: 'string', minLength: 1, maxLength: 80 }, host: { type: 'string', minLength: 1, maxLength: 253 },
            port: { type: 'integer', minimum: 1, maximum: 65535 }, user: { type: 'string', minLength: 1, maxLength: 32 },
            domain: { type: 'string', maxLength: 253 }, kind: { type: 'string', enum: ['static', 'node', 'upload-only'] },
            keySlot: { type: 'string', maxLength: 60 }, spa: { type: 'boolean' }, appPort: { type: 'integer', minimum: 1024, maximum: 65535 },
          },
        } },
      },
      run: async (p: { target: DeployTarget }, ctx: CommandContext): Promise<{ status: 'saved' }> => { requireHuman(ctx, 'deploy.target.save'); await be().targetSave(p.target); return { status: 'saved' }; },
    },
    {
      id: 'deploy.target.delete', title: 'Delete publish target', ...common, level: 'ui',
      params: { type: 'object', properties: { targetId: idProp, deleteKey: { type: 'boolean' } }, required: ['targetId'], ...NO_EXTRA },
      run: async (p: { targetId: string; deleteKey?: boolean }, ctx: CommandContext): Promise<{ status: 'deleted' }> => {
        requireHuman(ctx, 'deploy.target.delete');
        await be().targetDelete(p.targetId, p.deleteKey === true);
        return { status: 'deleted' };
      },
    },
    {
      id: 'deploy.hostkey.trust', title: 'Trust server key', ...common, level: 'ui',
      params: { type: 'object', properties: { targetId: idProp }, required: ['targetId'], ...NO_EXTRA },
      run: async (p: { targetId: string }, ctx: CommandContext): Promise<{ status: 'trusted'; fingerprint: string } | Cancelled> => {
        requireHuman(ctx, 'deploy.hostkey.trust');
        const t = await target(p.targetId);
        const info: DeployHostKeyInfo = await be().hostkeyProbe(p.targetId);
        const answer = await getDeployConfirmPresenter().confirmHostKey(t, info);
        if (!answer) return cancelled;
        consumeGesture(answer);
        await be().hostkeyTrust(p.targetId, info.fingerprint);
        return { status: 'trusted', fingerprint: info.fingerprint };
      },
    },
    {
      id: 'deploy.hostkey.replace', title: 'Replace server key', ...common, level: 'ui',
      params: { type: 'object', properties: { targetId: idProp, oldFingerprint: { type: 'string', pattern: FINGERPRINT } }, required: ['targetId', 'oldFingerprint'], ...NO_EXTRA },
      run: async (p: { targetId: string; oldFingerprint: string }, ctx: CommandContext): Promise<{ status: 'replaced'; fingerprint: string } | Cancelled> => {
        requireHuman(ctx, 'deploy.hostkey.replace');
        const t = await target(p.targetId);
        const info = await be().hostkeyProbe(p.targetId);
        const answer = await getDeployConfirmPresenter().confirmHostKeyReplace(t, p.oldFingerprint, info);
        if (!answer || !answer.acknowledged) return cancelled;
        consumeGesture(answer.gesture);
        await be().hostkeyReplace({ targetId: p.targetId, oldFingerprint: p.oldFingerprint, newFingerprint: info.fingerprint, acknowledged: true });
        return { status: 'replaced', fingerprint: info.fingerprint };
      },
    },
    {
      id: 'deploy.key.create', title: 'Create publish key', ...common, level: 'ui',
      params: { type: 'object', properties: { targetId: idProp }, required: ['targetId'], ...NO_EXTRA },
      run: async (p: { targetId: string }, ctx: CommandContext): Promise<{ publicKey: string }> => {
        requireHuman(ctx, 'deploy.key.create');
        return { publicKey: await be().keyCreate(p.targetId) };
      },
    },
  ];
  return specs;
}

export { DeployConfirmationError };
