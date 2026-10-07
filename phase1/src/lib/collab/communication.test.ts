import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCommunicationTab,
  openSessionChat,
  selectCommunication,
  toggleSessionChat,
} from './communication';
import { setChatSession, type ChatSession } from './chatSession';
import { getState, patchState } from '../../store/appStore';

/** Minimal stand-in: the module under test only reads identity, setOpen, subscribe and snapshot. */
function stubChat() {
  const setOpenCalls: boolean[] = [];
  const stub = {
    open: false,
    unread: 0,
    setOpen(open: boolean) {
      stub.open = open;
      setOpenCalls.push(open);
    },
    snapshot: () => 1,
    subscribe: (_f: () => void) => () => {},
  };
  return { stub: stub as unknown as ChatSession, setOpenCalls };
}

function reset() {
  selectCommunication('agent');
  setChatSession(null);
  patchState({ agentOpen: false });
}

test('toggleSessionChat without a session is a no-op', () => {
  reset();
  toggleSessionChat();
  assert.equal(getCommunicationTab(), 'agent');
  assert.equal(getState().agentOpen, false);
});

test('toggle opens the chat tab, closes the panel, then reopens on the chat tab', () => {
  reset();
  const { stub } = stubChat();
  setChatSession(stub);
  toggleSessionChat();
  assert.equal(getCommunicationTab(), 'chat');
  assert.equal(getState().agentOpen, true);
  // Second toggle closes the panel but keeps the chat tab, so the next open lands on chat again.
  toggleSessionChat();
  assert.equal(getState().agentOpen, false);
  assert.equal(getCommunicationTab(), 'chat');
  toggleSessionChat();
  assert.equal(getState().agentOpen, true);
  assert.equal(getCommunicationTab(), 'chat');
});

test('toggle with the panel open on the agent tab switches to chat without closing', () => {
  reset();
  const { stub } = stubChat();
  setChatSession(stub);
  patchState({ agentOpen: true });
  toggleSessionChat();
  assert.equal(getCommunicationTab(), 'chat');
  assert.equal(getState().agentOpen, true);
});

test('selectCommunication("agent") hides the chat view inside the session', () => {
  reset();
  const { stub, setOpenCalls } = stubChat();
  setChatSession(stub);
  openSessionChat();
  assert.deepEqual(setOpenCalls, []);
  selectCommunication('agent');
  assert.equal(getCommunicationTab(), 'agent');
  assert.deepEqual(setOpenCalls, [false]);
  // The panel itself is not touched by a tab switch.
  assert.equal(getState().agentOpen, true);
});

test('session end while the chat tab is open falls back to the agent tab and keeps the panel open', () => {
  reset();
  const { stub } = stubChat();
  setChatSession(stub);
  openSessionChat();
  setChatSession(null);
  assert.equal(getCommunicationTab(), 'agent');
  assert.equal(getState().agentOpen, true);
});

test('session end while the agent tab is open changes nothing', () => {
  reset();
  const { stub } = stubChat();
  setChatSession(stub);
  patchState({ agentOpen: true });
  setChatSession(null);
  assert.equal(getCommunicationTab(), 'agent');
  assert.equal(getState().agentOpen, true);
});

test('a new session while the chat tab is open keeps the chat tab', () => {
  reset();
  const first = stubChat();
  setChatSession(first.stub);
  openSessionChat();
  const second = stubChat();
  setChatSession(second.stub);
  assert.equal(getCommunicationTab(), 'chat');
  assert.equal(getState().agentOpen, true);
  reset();
});
