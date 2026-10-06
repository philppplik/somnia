import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatRailButton } from './ChatRailButton';
import { AgentRailButton } from './agent/AgentRailButton';
import { setChatSession, type ChatSession } from '../lib/collab/chatSession';
import { selectCommunication } from '../lib/collab/communication';
import { patchState } from '../store/appStore';
import { formatShortcut } from '../lib/commands';

function stubChat(unread: number) {
  return {
    open: false,
    unread,
    setOpen() {},
    snapshot: () => 1,
    subscribe: (_f: () => void) => () => {},
  } as unknown as ChatSession;
}

function reset() {
  selectCommunication('agent');
  setChatSession(null);
  patchState({ agentOpen: false });
}

function withNavigator(platform: string, f: () => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')!;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    enumerable: true,
    get: () => ({ platform }),
  });
  try {
    f();
  } finally {
    Object.defineProperty(globalThis, 'navigator', original);
  }
}

test('renders nothing without a chat session', () => {
  reset();
  assert.equal(renderToStaticMarkup(<ChatRailButton />), '');
});

test('plain state: icon button, no badge, not pressed, platform-formatted tooltip', () => {
  reset();
  setChatSession(stubChat(0));
  const html = renderToStaticMarkup(<ChatRailButton />);
  assert.ok(html.includes('data-testid="chat-rail-open"'));
  assert.ok(html.includes('aria-pressed="false"'));
  assert.ok(html.includes('aria-label="Open chat"'));
  assert.ok(html.includes(`title="Open chat (${formatShortcut('Mod+Alt+C')})"`));
  assert.ok(!html.includes('Ctrl+Alt+C'), 'tooltip must not hardcode the Windows chord');
  assert.ok(html.includes('aria-keyshortcuts="Control+Alt+C"'));
  assert.ok(!html.includes('collab-unread'));
});

test('unread count renders in the badge and the aria-label, singular and plural', () => {
  reset();
  setChatSession(stubChat(1));
  let html = renderToStaticMarkup(<ChatRailButton />);
  assert.ok(html.includes('aria-label="Chat, 1 unread message"'));
  assert.ok(html.includes('<span class="collab-unread" aria-hidden="true">1</span>'));
  setChatSession(stubChat(3));
  html = renderToStaticMarkup(<ChatRailButton />);
  assert.ok(html.includes('aria-label="Chat, 3 unread messages"'));
  assert.ok(html.includes('<span class="collab-unread" aria-hidden="true">3</span>'));
});

test('badge caps at 9+', () => {
  reset();
  setChatSession(stubChat(9));
  let html = renderToStaticMarkup(<ChatRailButton />);
  assert.ok(html.includes('>9</span>'));
  assert.ok(!html.includes('9+'));
  for (const n of [10, 42]) {
    setChatSession(stubChat(n));
    html = renderToStaticMarkup(<ChatRailButton />);
    assert.ok(html.includes('>9+</span>'), `unread ${n} must render as 9+`);
  }
});

test('active chat tab: pressed, close label, badge suppressed even with a stale unread count', () => {
  reset();
  setChatSession(stubChat(5));
  patchState({ agentOpen: true });
  selectCommunication('chat');
  const html = renderToStaticMarkup(<ChatRailButton />);
  assert.ok(html.includes('aria-pressed="true"'));
  assert.ok(html.includes('aria-label="Close panel"'));
  assert.ok(html.includes('bg-accent-soft'));
  assert.ok(!html.includes('collab-unread'), 'active chat must never show an unread badge');
});

test('panel open on the agent tab still shows the unread badge and is not pressed', () => {
  reset();
  setChatSession(stubChat(2));
  patchState({ agentOpen: true });
  selectCommunication('agent');
  const html = renderToStaticMarkup(<ChatRailButton />);
  assert.ok(html.includes('aria-pressed="false"'));
  assert.ok(html.includes('<span class="collab-unread" aria-hidden="true">2</span>'));
});

test('tooltip and aria-keyshortcuts follow the platform on macOS', () => {
  reset();
  setChatSession(stubChat(0));
  withNavigator('MacIntel', () => {
    const html = renderToStaticMarkup(<ChatRailButton />);
    assert.ok(html.includes('title="Open chat (⌘⌥C)"'));
    assert.ok(html.includes('aria-keyshortcuts="Meta+Alt+C"'));
  });
});

test('agent rail button is pressed only when the panel shows the agent tab', () => {
  reset();
  setChatSession(stubChat(0));
  patchState({ agentOpen: true });
  selectCommunication('chat');
  let html = renderToStaticMarkup(<AgentRailButton />);
  assert.ok(html.includes('aria-pressed="false"'), 'AI button must not look active while the chat tab is showing');
  selectCommunication('agent');
  html = renderToStaticMarkup(<AgentRailButton />);
  assert.ok(html.includes('aria-pressed="true"'));
  patchState({ agentOpen: false });
  html = renderToStaticMarkup(<AgentRailButton />);
  assert.ok(html.includes('aria-pressed="false"'));
  reset();
});
