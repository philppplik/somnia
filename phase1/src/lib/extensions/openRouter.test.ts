import test from 'node:test';
import assert from 'node:assert/strict';
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



test('registers an offer and routes it by validated kind', () => { resetExtensionOpenOffers();
    registerExtensionOpenOffer(base, ownsAll);
    assert.deepEqual(extensionOffersFor('text').map(o => o.id),['acme.md-viewer']);
    assert.deepEqual(extensionOffersFor('audio'),[]);
  });

test('hard-caps priority below every built-in default handler', () => { resetExtensionOpenOffers();
    registerExtensionOpenOffer({...base, priority: 1000}, ownsAll);
    assert.equal(extensionOffersFor('text')[0].effectivePriority,MAX_EXTENSION_OPEN_PRIORITY);
  });

test('rejects kinds outside the validated document-kind set', () => { resetExtensionOpenOffers();
    assert.throws(() => registerExtensionOpenOffer({...base, kinds: ['exe' as never]}, ownsAll),/not a validated document kind/);
  });

test('rejects an offer whose command the extension does not own', () => { resetExtensionOpenOffers();
    assert.throws(() => registerExtensionOpenOffer(base, ownsNothing),/not contributed by/);
    assert.throws(() => registerExtensionOpenOffer(base, ownsOnly('other.cmd')),/not contributed by/);
    assert.deepEqual(extensionOffersFor('text'),[]);
  });

test('rejects duplicate ids and only unregisters its own entry', () => { resetExtensionOpenOffers();
    const dispose = registerExtensionOpenOffer(base, ownsAll);
    assert.throws(() => registerExtensionOpenOffer(base, ownsAll),/already registered/);
    dispose();
    dispose(); // idempotent, must not throw or remove others
    assert.deepEqual(extensionOffersFor('text'),[]);
  });

test('sorts candidates by effective priority, never by registration order alone', () => { resetExtensionOpenOffers();
    registerExtensionOpenOffer(base, ownsAll);
    registerExtensionOpenOffer({...base, id: 'acme.richedit', commandId: 'acme.viewer.open2', priority: 20, capability: 'edit', title: 'Rich'}, ownsAll);
    assert.deepEqual(extensionOffersFor('text').map(o => o.id),['acme.richedit','acme.md-viewer']);
  });

test('keeps a built-in winner as winner and exposes offers separately for Open with', () => { resetExtensionOpenOffers();
    registerExtensionOpenOffer(base, ownsAll);
    const merged = mergeWithBuiltIns({handler: 'builtin'}, 'text');
    assert.deepEqual(merged.winner,{handler:'builtin'});
    assert.deepEqual(merged.extensionCandidates.map(o => o.id),['acme.md-viewer']);
  });

test('validates id and title bounds', () => { resetExtensionOpenOffers();
    assert.throws(() => registerExtensionOpenOffer({...base, id: ''}, ownsAll),/id is invalid/);
    assert.throws(() => registerExtensionOpenOffer({...base, title: ''}, ownsAll),/display title/);
  });
