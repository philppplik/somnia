import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commandEnabled,
  registerCommandScope,
  defaultShortcut,
  executeCommand,
  formatShortcut,
  isMac,
  listCommands,
  matchesShortcut,
  shortcutFromEvent,
} from './commands';
import { setChatSession, type ChatSession } from './collab/chatSession';
import { getCommunicationTab, selectCommunication } from './collab/communication';
import { getState, patchState } from '../store/appStore';

const kb = (init: Partial<KeyboardEvent>): KeyboardEvent =>
  ({ key: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...init }) as KeyboardEvent;

function stubChatSession() {
  return {
    open: false,
    unread: 0,
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

test('chat.toggle is registered as Mod+Alt+C, allowed inside inputs, and is the only command on that shortcut', () => {
  const command = listCommands().find((c) => c.id === 'chat.toggle');
  assert.ok(command);
  assert.equal(command.shortcut, 'Mod+Alt+C');
  assert.equal(defaultShortcut('chat.toggle'), 'Mod+Alt+C');
  assert.equal(command.allowInInput, true);
  assert.equal(command.category, 'View');
  assert.equal(listCommands().filter((c) => c.shortcut === 'Mod+Alt+C').length, 1);
});

test('chat.toggle is enabled only while a chat session exists', () => {
  reset();
  const command = listCommands().find((c) => c.id === 'chat.toggle')!;
  assert.equal(commandEnabled(command), false);
  setChatSession(stubChatSession());
  assert.equal(commandEnabled(command), true);
  setChatSession(null);
  assert.equal(commandEnabled(command), false);
});

test('executeCommand routes a disabled chat.toggle to a notice instead of opening anything', async () => {
  reset();
  const result = await executeCommand('chat.toggle');
  assert.equal(result, false);
  assert.equal(getState().agentOpen, false);
  assert.equal(getCommunicationTab(), 'agent');
  assert.match(getState().notice, /unavailable/);
});

test('executeCommand drives the full toggle cycle through the registry', async () => {
  reset();
  setChatSession(stubChatSession());
  assert.equal(await executeCommand('chat.toggle'), true);
  assert.equal(getState().agentOpen, true);
  assert.equal(getCommunicationTab(), 'chat');
  assert.equal(await executeCommand('chat.toggle'), true);
  assert.equal(getState().agentOpen, false);
  assert.equal(getCommunicationTab(), 'chat');
  assert.ok(getState().recentCommands.includes('chat.toggle'));
  reset();
});

test('matchesShortcut resolves Mod+Alt+C strictly on non-Mac', () => {
  assert.ok(!isMac(), 'test runner is expected to be non-Mac');
  assert.equal(matchesShortcut(kb({ key: 'c', ctrlKey: true, altKey: true }), 'Mod+Alt+C'), true);
  // Case-insensitive key compare.
  assert.equal(matchesShortcut(kb({ key: 'C', ctrlKey: true, altKey: true }), 'Mod+Alt+C'), true);
  // Any missing or extra modifier rejects, so chat.toggle never fires on lookalike chords.
  assert.equal(matchesShortcut(kb({ key: 'c', ctrlKey: true }), 'Mod+Alt+C'), false);
  assert.equal(matchesShortcut(kb({ key: 'c', altKey: true }), 'Mod+Alt+C'), false);
  assert.equal(matchesShortcut(kb({ key: 'c', ctrlKey: true, altKey: true, shiftKey: true }), 'Mod+Alt+C'), false);
  assert.equal(matchesShortcut(kb({ key: 'c', ctrlKey: true, altKey: true, metaKey: true }), 'Mod+Alt+C'), false);
  // No cross-talk with the neighbouring agent.toggle shortcut.
  assert.equal(matchesShortcut(kb({ key: 'c', ctrlKey: true, altKey: true }), 'Mod+Alt+A'), false);
  assert.equal(matchesShortcut(kb({ key: 'a', ctrlKey: true, altKey: true }), 'Mod+Alt+C'), false);
});

test('matchesShortcut maps Mod to Cmd on macOS and rejects the Ctrl key there', () => {
  withNavigator('MacIntel', () => {
    assert.ok(isMac());
    assert.equal(matchesShortcut(kb({ key: 'c', metaKey: true, altKey: true }), 'Mod+Alt+C'), true);
    assert.equal(matchesShortcut(kb({ key: 'c', ctrlKey: true, altKey: true }), 'Mod+Alt+C'), false);
    // Cmd+Alt+Ctrl+C must not fire: a grabbed Ctrl changes the chord.
    assert.equal(matchesShortcut(kb({ key: 'c', metaKey: true, ctrlKey: true, altKey: true }), 'Mod+Alt+C'), false);
  });
});

test('shortcutFromEvent renders the chat.toggle chord and ignores bare modifiers', () => {
  // Single-character keys are normalised to lower case; matchesShortcut compares case-insensitively.
  assert.equal(shortcutFromEvent(kb({ key: 'c', ctrlKey: true, altKey: true })), 'Mod+Alt+c');
  assert.equal(shortcutFromEvent(kb({ key: 'C', ctrlKey: true, altKey: true, shiftKey: true })), 'Mod+Alt+Shift+c');
  assert.equal(shortcutFromEvent(kb({ key: 'Control', ctrlKey: true })), null);
  assert.equal(shortcutFromEvent(kb({ key: 'Alt', altKey: true })), null);
});

test('formatShortcut displays the chord per platform', () => {
  assert.equal(formatShortcut('Mod+Alt+C'), 'Ctrl + Alt + C');
  withNavigator('MacIntel', () => {
    assert.equal(formatShortcut('Mod+Alt+C'), '⌘⌥C');
  });
});

test('editor command scope routes menu, enablement and execution without replacing project commands',async()=>{let count=0;let active=true;const off=registerCommandScope(id=>active&&id==='edit.undo'?{id,title:'Image undo',category:'Edit',enabled:()=>true,run:()=>{count++;}}:undefined);try{assert.equal(commandEnabled(listCommands().find(c=>c.id==='edit.undo')!),true);assert.equal(listCommands().find(c=>c.id==='edit.undo')!.title,'Image undo');await executeCommand('edit.undo');assert.equal(count,1);active=false;assert.notEqual(listCommands().find(c=>c.id==='edit.undo')!.title,'Image undo');}finally{off();}});
