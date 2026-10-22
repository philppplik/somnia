import {afterEach,describe,expect,it} from 'vitest';
import {
  MAX_EXTENSION_OPEN_PRIORITY,
  extensionOffersFor,
  mergeWithBuiltIns,
  registerExtensionOpenOffer,
  resetExtensionOpenOffers,
  type CommandOwnership,
  type ExtensionOpenOffer,
} from './openRouter';

const ownsAll: CommandOwnership = () => true;
const ownsNothing: CommandOwnership = () => false;
const ownsOnly = (cmd: string): CommandOwnership => (_ext, c) => c === cmd;

const base: ExtensionOpenOffer = {
  id: 'acme.md-viewer',
  extensionId: 'acme.viewer',
  kinds: ['text'],
  commandId: 'acme.viewer.open',
  capability: 'preview',
  priority: 10,
  title: 'Markdown Viewer',
};

afterEach(() => resetExtensionOpenOffers());

describe('extension open router', () => {
  it('registers an offer and routes it by validated kind', () => {
    registerExtensionOpenOffer(base, ownsAll);
    expect(extensionOffersFor('text').map(o => o.id)).toEqual(['acme.md-viewer']);
    expect(extensionOffersFor('audio')).toEqual([]);
  });

  it('hard-caps priority below every built-in default handler', () => {
    registerExtensionOpenOffer({...base, priority: 1000}, ownsAll);
    expect(extensionOffersFor('text')[0].effectivePriority).toBe(MAX_EXTENSION_OPEN_PRIORITY);
  });

  it('rejects kinds outside the validated document-kind set', () => {
    expect(() => registerExtensionOpenOffer({...base, kinds: ['exe' as never]}, ownsAll))
      .toThrowError(/not a validated document kind/);
  });

  it('rejects an offer whose command the extension does not own', () => {
    expect(() => registerExtensionOpenOffer(base, ownsNothing)).toThrowError(/not contributed by/);
    expect(() => registerExtensionOpenOffer(base, ownsOnly('other.cmd'))).toThrowError(/not contributed by/);
    expect(extensionOffersFor('text')).toEqual([]);
  });

  it('rejects duplicate ids and only unregisters its own entry', () => {
    const dispose = registerExtensionOpenOffer(base, ownsAll);
    expect(() => registerExtensionOpenOffer(base, ownsAll)).toThrowError(/already registered/);
    dispose();
    dispose(); // idempotent, must not throw or remove others
    expect(extensionOffersFor('text')).toEqual([]);
  });

  it('sorts candidates by effective priority, never by registration order alone', () => {
    registerExtensionOpenOffer(base, ownsAll);
    registerExtensionOpenOffer({...base, id: 'acme.richedit', commandId: 'acme.viewer.open2', priority: 20, capability: 'edit', title: 'Rich'}, ownsAll);
    expect(extensionOffersFor('text').map(o => o.id)).toEqual(['acme.richedit', 'acme.md-viewer']);
  });

  it('keeps a built-in winner as winner and exposes offers separately for Open with', () => {
    registerExtensionOpenOffer(base, ownsAll);
    const merged = mergeWithBuiltIns({handler: 'builtin'}, 'text');
    expect(merged.winner).toEqual({handler: 'builtin'});
    expect(merged.extensionCandidates.map(o => o.id)).toEqual(['acme.md-viewer']);
  });

  it('validates id and title bounds', () => {
    expect(() => registerExtensionOpenOffer({...base, id: ''}, ownsAll)).toThrowError(/id is invalid/);
    expect(() => registerExtensionOpenOffer({...base, title: ''}, ownsAll)).toThrowError(/display title/);
  });
});
