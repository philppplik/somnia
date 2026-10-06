import test from 'node:test';
import assert from 'node:assert/strict';
import { CollabDoc } from './collabDoc';
import { ChatModel } from './chatModel';
import { ChatSession } from './chatSession';
import { CollabClient } from './net/client';
import { memoryServer } from './net/memoryTransport';
import { newLinkKey } from './net/crypto';
import { makeUser } from './awarenessSafe';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms = 6000) => {
  const start = Date.now();
  while (!f()) {
    if (Date.now() - start > ms) throw Error('timeout');
    await sleep(10);
  }
};

test('unread badge counts only remote messages while the chat is closed, mentions notify', async () => {
  const { server, factory } = memoryServer();
  server.onConnection((end) =>
    end.transport.connect({
      onOpen() {},
      onMessage(frame) {
        for (const peer of server.connections) if (peer !== end) peer.transport.send(frame);
      },
      onClose() {},
    }),
  );
  const key = await newLinkKey();
  const create = (name: string, role: 'host' | 'guest') => {
    const project = new CollabDoc();
    const model = new ChatModel();
    project.awareness.setLocalStateField('user', makeUser(name, project.doc.clientID));
    const client = new CollabClient(`ws://127.0.0.1/room/abcdefgh#key=${key.param}`, {
      session: { doc: project.doc, awareness: project.awareness },
      chatDoc: model.doc,
      transport: factory,
      syncTimeoutMs: 15,
    });
    const chat = new ChatSession(project, client, role, model);
    return { project, model, client, chat };
  };
  const host = create('Mara', 'host');
  const guest = create('Ayse', 'guest');
  try {
    await host.client.connect();
    await guest.client.connect();
    assert.equal(host.chat.unread, 0);
    assert.equal(guest.chat.unread, 0);

    // Remote message while closed: one unread for the guest, none for the author.
    host.chat.send('First update', [], undefined);
    await until(() => guest.chat.unread === 1);
    assert.equal(host.chat.unread, 0);

    // Own messages never count on the sender's badge; the other side increments again.
    guest.chat.send('On it', [], undefined);
    await until(() => host.chat.unread === 1);
    assert.equal(guest.chat.unread, 1);

    // Opening the chat clears the badge; messages while open do not count.
    guest.chat.setOpen(true);
    assert.equal(guest.chat.unread, 0);
    host.chat.send('Second update', [], undefined);
    await until(() => guest.model.list().length === 3);
    await sleep(50);
    assert.equal(guest.chat.unread, 0);

    // Closed again, a mention raises the notification on top of the badge.
    guest.chat.setOpen(false);
    const mention = host.chat.send('@Ayse please look', [guest.chat.localId], undefined);
    await until(() => guest.chat.notification === mention.id);
    assert.equal(guest.chat.unread, 1);
    guest.chat.dismiss();
    assert.equal(guest.chat.notification, null);
    assert.equal(guest.chat.unread, 1, 'dismissing the notification keeps the unread count');
  } finally {
    host.chat.destroy();
    guest.chat.destroy();
    host.client.leave();
    guest.client.leave();
    host.project.destroy();
    guest.project.destroy();
  }
});
