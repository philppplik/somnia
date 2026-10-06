import { useSyncExternalStore } from "react";
import {
  ChatModel,
  CHAT_MAX_ATTACHMENT,
  CHAT_MAX_FILES,
  CHAT_MAX_TOTAL,
  type ChatAttachment,
} from "./chatModel";
import { BlobSync, type MediaPort } from "./blobSync";
import { sha256Hex } from "./net/blobProtocol";
import { sniffMedia } from "../media";
import type { CollabClient } from "./net/client";
import type { CollabDoc } from "./collabDoc";
import { safeUser } from "./awarenessSafe";
import { initialOf, tokenFor } from "./badgePolicy";
export { initialOf };
export class ChatSession {
  readonly model: ChatModel;
  readonly blobs: BlobSync;
  private files = new Map<
    string,
    { bytes: Uint8Array; url: string; mime: string }
  >();
  private portListeners = new Set<() => void>();
  private listeners = new Set<() => void>();
  private version = 0;
  private dead = false;
  readonly localId: string;
  private offAwareness:()=>void;private typingTimer:ReturnType<typeof setTimeout>|null=null;
  private offClient: () => void;
  private ready = false;
  private offModel: () => void;
  private seen = new Set<string>();
  unread = 0;
  open = false;
  notification: string | null = null;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    readonly project: CollabDoc,
    private client: CollabClient,
    readonly role: "host" | "guest",
    model = new ChatModel(),
  ) {
    this.model = model;
    const onPresence=()=>{if(this.dead)return;this.changed();if(this.typingTimer)clearTimeout(this.typingTimer);this.typingTimer=setTimeout(()=>this.changed(),4500);};project.awareness.on('change',onPresence);this.offAwareness=()=>project.awareness.off('change',onPresence);
    this.ready = client.snapshot().state === "connected";
    this.offClient = client.subscribe(() => {
      if (!this.ready && client.snapshot().state === "connected") {
        this.ready = true;
        for (const m of this.model.list()) this.seen.add(m.id);
      }
    });
    const user = project.awareness.getLocalState()?.user;
    this.localId = user?.participantId ?? String(project.doc.clientID);
    const port: MediaPort = {
      list: () =>
        [...this.files]
          .filter(([id]) =>
            this.model
              .list()
              .some((m) => m.attachments.some((a) => a.id === id)),
          )
          .map(([path, f]) => ({
            path,
            id: path,
            size: f.bytes.length,
            read: async () => f.bytes,
          })),
      subscribe: (f) => {
        this.portListeners.add(f);
        return () => {
          this.portListeners.delete(f);
        };
      },
      add: async (path, bytes) => {
        if (this.dead) return { error: "session-ended" };
        const attachment = this.model
          .list()
          .flatMap((m) => m.attachments)
          .find((a) => a.id === path);
        if (!attachment) return { error: "unknown-attachment" };
        const mime = sniffMedia(bytes)?.mime ?? "application/octet-stream";
        if (mime !== attachment.mime) return { error: "type-mismatch" };
        if (
          mime.startsWith("image/") &&
          typeof createImageBitmap === "function"
        ) {
          try {
            const image = await createImageBitmap(
              new Blob([bytes as BlobPart], { type: mime }),
            );
            const over =
              image.width * image.height > 40_000_000 ||
              image.width > 16000 ||
              image.height > 16000;
            image.close();
            if (over) return { error: "image-limit" };
          } catch {
            return { error: "invalid-image" };
          }
        }
        if (this.dead) return { error: "session-ended" };
        this.install(path, bytes, mime);
        return { ok: true };
      },
    };
    this.blobs = new BlobSync(
      this.model,
      { port, send: (f) => client.sendBlob(f), onChange: () => this.changed() },
      {
        policy: {
          path: (p) =>
            /^[a-zA-Z0-9_-]{1,100}$/.test(p) &&
            this.model
              .list()
              .some((m) => m.attachments.some((a) => a.id === p)),
          maxFile: CHAT_MAX_ATTACHMENT,
          maxTotal: CHAT_MAX_TOTAL,
          maxFiles: CHAT_MAX_FILES,
        },
      },
    );
    this.offModel = this.model.subscribe(() => {
      if (this.role === "host") this.model.confirmPending();
      this.blobs.kick();
      for (const m of this.model.list()) {
        if (this.seen.has(m.id)) continue;
        this.seen.add(m.id);
        if (!this.ready || m.author.id === this.localId) continue;
        if (!this.open) this.unread++;
        const parent = m.replyTo ? this.model.messages.get(m.replyTo) : null;
        if (
          !this.open &&
          (m.mentions.includes(this.localId) ||
            parent?.author.id === this.localId)
        ) {
          this.notification = m.id;
          if (this.notifyTimer) clearTimeout(this.notifyTimer);
          this.notifyTimer = setTimeout(() => {
            this.notification = null;
            this.changed();
          }, 6000);
        }
      }
      this.changed();
    });
  }
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  snapshot = () => this.version;
  private changed() {
    if (this.dead) return;
    this.version++;
    this.listeners.forEach((f) => f());
  }
  private install(id: string, bytes: Uint8Array, mime: string) {
    const old = this.files.get(id);
    if (old) URL.revokeObjectURL(old.url);
    const url = URL.createObjectURL(
      new Blob([bytes as BlobPart], { type: mime }),
    );
    this.files.set(id, { bytes, url, mime });
    this.changed();
  }
  discardDrafts() {
    const published = new Set(
      this.model.list().flatMap((m) => m.attachments.map((a) => a.id)),
    );
    for (const id of this.files.keys())
      if (!published.has(id)) this.discard(id);
  }
  discard(id: string) {
    const f = this.files.get(id);
    if (f) {
      URL.revokeObjectURL(f.url);
      this.files.delete(id);
      this.changed();
    }
  }
  file(id: string) {
    return this.files.get(id);
  }
  colour(id: string) {
    const n = this.model.colours.get(id);
    return Number.isInteger(n) && n! >= 0 && n! < 8 ? n! : tokenFor(id);
  }
  author() {
    const user = this.project.awareness.getLocalState()?.user;
    return {
      id: this.localId,
      name: safeUser(user, this.project.doc.clientID).name,
      token: this.colour(this.localId),
    };
  }
  participants() {
    return [...this.project.awareness.getStates()]
      .filter(([, s]) => s.user)
      .map(([id, s]) => {
        const u = safeUser(s.user, id),
          pid = u.participantId ?? String(id);
        return {
          id: pid,
          name: u.name,
          token: this.colour(pid),
          file: typeof s.file === "string" ? s.file.slice(0, 180) : "",
          self: id === this.project.doc.clientID,
        };
      });
  }

  setOpen(open: boolean) {
    this.open = open;
    if (open) {
      this.unread = 0;
      this.notification = null;
    }
    this.changed();
  }
  dismiss() {
    this.notification = null;
    this.changed();
  }
  typing(on: boolean) {
    if (this.dead) return;
    this.project.awareness.setLocalStateField("typing", on ? Date.now() : 0);
  }
  async attach(file: File): Promise<ChatAttachment> {
    if (this.dead) throw new Error("session-ended");
    if (file.size < 1 || file.size > CHAT_MAX_ATTACHMENT)
      throw new Error("attachment-limit");
    if (
      this.files.size >= CHAT_MAX_FILES ||
      [...this.files.values()].reduce((n, f) => n + f.bytes.length, 0) +
        file.size >
        CHAT_MAX_TOTAL
    )
      throw new Error("attachment-limit");
    const bytes = new Uint8Array(await file.arrayBuffer()),
      hash = await sha256Hex(bytes);
    if (this.dead) throw new Error("session-ended");
    if (
      this.files.size >= CHAT_MAX_FILES ||
      [...this.files.values()].reduce((n, f) => n + f.bytes.length, 0) +
        bytes.length >
        CHAT_MAX_TOTAL
    )
      throw new Error("attachment-limit");
    const mime = sniffMedia(bytes)?.mime ?? "application/octet-stream";
    if (mime.startsWith("image/") && typeof createImageBitmap === "function") {
      const image = await createImageBitmap(
        new Blob([bytes as BlobPart], { type: mime }),
      );
      const over =
        image.width * image.height > 40_000_000 ||
        image.width > 16000 ||
        image.height > 16000;
      image.close();
      if (over) throw new Error("image-limit");
    }
    if (this.dead) throw new Error("session-ended");
    const id = crypto.randomUUID();
    const name =
      file.name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 180) || "attachment";
    this.install(id, bytes, mime);
    // Announce only when the message is sent; the metadata is not a project path.
    return { id, name, hash, size: bytes.length, mime };
  }
  send(
    body: string,
    mentions: string[],
    replyTo?: string,
    attachments: ChatAttachment[] = [],
    reference?: { file: string; line: number },
  ) {
    if (this.dead) throw new Error("session-ended");
    if (!this.client.snapshot().security.e2e)
      throw new Error("chat-needs-encryption");
    const m = this.model.send({
      author: this.author(),
      body,
      mentions,
      replyTo,
      attachments,
      reference,
    });
    this.model.doc.transact(() => {
      for (const a of attachments)
        this.model.doc
          .getMap("media")
          .set(a.id, { hash: a.hash, size: a.size });
    });
    this.typing(false);
    return m;
  }
  destroy() {
    if (this.dead) return;
    this.dead = true;
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    this.offAwareness();if(this.typingTimer)clearTimeout(this.typingTimer);
    this.offClient();
    this.offModel();
    this.blobs.stop();
    this.files.forEach((f) => URL.revokeObjectURL(f.url));
    this.files.clear();
    this.model.destroy();
    this.seen.clear();
    this.unread = 0;
    this.notification = null;
    this.listeners.clear();
    this.portListeners.clear();
  }
}
let session: ChatSession | null = null;
const listeners = new Set<() => void>();
let off: (() => void) | null = null;
export const getChatSession = () => session;
export function setChatSession(next: ChatSession | null) {
  off?.();
  session = next;
  off = next?.subscribe(() => listeners.forEach((f) => f())) ?? null;
  listeners.forEach((f) => f());
}
export const subscribeChat = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
export function useChatSession() {
  useSyncExternalStore(subscribeChat, () => session?.snapshot() ?? -1);
  return session;
}
