import * as Y from "yjs";
import { HASH_RE } from "./net/blobProtocol";
import { isSafeProjectPath } from "./paths";
import { cleanDisplayName } from "./invite";
export const CHAT_MAX_ATTACHMENT = 10_000_000,
  CHAT_MAX_ATTACHMENTS = 5,
  CHAT_MAX_TOTAL = 50_000_000,
  CHAT_MAX_FILES = 100;
export const CHAT_MAX_BODY = 8192,
  CHAT_MAX_MESSAGES = 500,
  CHAT_MAX_HISTORY_BYTES = 512 * 1024;
export interface ChatAuthor {
  id: string;
  name: string;
  token: number;
}
export interface ChatAttachment {
  id: string;
  name: string;
  hash: string;
  size: number;
  mime: string;
}
export interface ChatReference {
  file: string;
  line: number;
}
export interface ChatMessage {
  id: string;
  author: ChatAuthor;
  body: string;
  sentAt: number;
  mentions: string[];
  replyTo?: string;
  reference?: ChatReference;
  attachments: ChatAttachment[];
}
const ID = {
  test: (v: unknown): v is string =>
    typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v),
};
const text = (v: unknown, n: number) => typeof v === "string" && v.length <= n;
export function parseAttachment(raw: unknown): ChatAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as ChatAttachment;
  if (
    !ID.test(a.id) ||
    !text(a.name, 180) ||
    !a.name ||
    /[\x00-\x1f/\\]/.test(a.name) ||
    !HASH_RE.test(a.hash) ||
    !Number.isInteger(a.size) ||
    a.size < 1 ||
    a.size > CHAT_MAX_ATTACHMENT
  )
    return null;
  if (
    ![
      "image/png",
      "image/jpeg",
      "application/pdf",
      "application/octet-stream",
    ].includes(a.mime)
  )
    return null;
  return { id: a.id, name: a.name, hash: a.hash, size: a.size, mime: a.mime };
}
export function parseMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as ChatMessage;
  if (
    !ID.test(m.id) ||
    !m.author ||
    !ID.test(m.author.id) ||
    !text(m.author.name, 64) ||
    !Number.isInteger(m.author.token) ||
    m.author.token < 0 ||
    m.author.token > 7 ||
    !text(m.body, CHAT_MAX_BODY) ||
    (typeof m.body === "string" &&
      new TextEncoder().encode(m.body).length > CHAT_MAX_BODY) ||
    !Number.isFinite(m.sentAt) ||
    m.sentAt < 0 ||
    m.sentAt > 8_640_000_000_000_000 ||
    !Array.isArray(m.mentions) ||
    m.mentions.length > 16 ||
    !m.mentions.every((id) => typeof id === "string" && ID.test(id)) ||
    !Array.isArray(m.attachments) ||
    m.attachments.length > CHAT_MAX_ATTACHMENTS
  )
    return null;
  const attachments = m.attachments.map(parseAttachment);
  if (attachments.some((a) => !a) || (!m.body.trim() && !attachments.length))
    return null;
  if (m.replyTo !== undefined && !ID.test(m.replyTo)) return null;
  const reference =
    m.reference &&
    isSafeProjectPath(m.reference.file) &&
    Number.isInteger(m.reference.line) &&
    m.reference.line > 0 &&
    m.reference.line <= 10_000_000
      ? { file: m.reference.file, line: m.reference.line }
      : undefined;
  return {
    id: m.id,
    author: { ...m.author, name: cleanDisplayName(m.author.name) },
    body: m.body,
    sentAt: m.sentAt,
    mentions: [...new Set(m.mentions)],
    replyTo: m.replyTo,
    reference,
    attachments: attachments as ChatAttachment[],
  };
}
/** No persistence hooks: this doc is destroyed when the session ends. Plain-text messages only. */
export class ChatModel {
  readonly doc = new Y.Doc();
  readonly messages = this.doc.getMap<ChatMessage>("messages");
  readonly colours = this.doc.getMap<number>("colours");
  readonly order = this.doc.getMap<number>("order");
  readonly meta = this.doc.getMap<boolean>("meta");
  private ls = new Set<() => void>();
  private version = 0;
  private stopped = false;
  private change = () => {
    this.version++;
    this.ls.forEach((f) => f());
  };
  constructor() {
    this.messages.observe(this.change);
    this.colours.observe(this.change);
    this.order.observe(this.change);
    this.meta.observe(this.change);
  }
  subscribe = (f: () => void) => {
    this.ls.add(f);
    return () => {
      this.ls.delete(f);
    };
  };
  snapshot = () => this.version;
  list() {
    const out: ChatMessage[] = [];
    this.messages.forEach((raw) => {
      const m = parseMessage(raw);
      if (m) out.push(m);
    });
    return out
      .sort(
        (a, b) =>
          (this.sequence(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (this.sequence(b.id) ?? Number.MAX_SAFE_INTEGER) ||
          a.id.localeCompare(b.id),
      )
      .slice(-CHAT_MAX_MESSAGES);
  }
  sequence(id: string) {
    const value = this.order.get(id);
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? value
      : undefined;
  }
  /** Cooperative host sequencing. Shared-key participants are not cryptographically authenticated. */
  confirmPending() {
    let next = 0;
    for (const n of this.order.values())
      if (Number.isSafeInteger(n) && n > next) next = n;
    this.doc.transact(() => {
      for (const m of this.list())
        if (this.sequence(m.id) === undefined) this.order.set(m.id, ++next);
    }, "chat-confirm");
  }
  send(input: Omit<ChatMessage, "id" | "sentAt">) {
    if (this.stopped) throw new Error("session-ended");
    const m = parseMessage({
      ...input,
      id: crypto.randomUUID(),
      sentAt: Date.now(),
    });
    if (!m) throw new Error("invalid-message");
    // Replies stay one level deep.
    if (m.replyTo) {
      const parent = this.messages.get(m.replyTo);
      if (!parent) throw new Error("invalid-reply");
      m.replyTo = parent.replyTo ?? parent.id;
    }
    this.doc.transact(() => {
      this.messages.set(m.id, m);
      let bytes = 0;
      const keep = new Set<string>();
      const candidates = [
        m,
        ...this.list()
          .filter((value) => value.id !== m.id)
          .reverse(),
      ];
      for (const value of candidates) {
        bytes += new TextEncoder().encode(JSON.stringify(value)).length;
        if (keep.size >= CHAT_MAX_MESSAGES || bytes > CHAT_MAX_HISTORY_BYTES)
          break;
        keep.add(value.id);
      }
      for (const id of this.messages.keys())
        if (!keep.has(id)) {
          this.messages.delete(id);
          this.order.delete(id);
          this.meta.set("trimmed", true);
        }
    }, "chat-send");
    return m;
  }
  assignColour(id: string) {
    const current = this.colours.get(id);
    if (Number.isInteger(current) && current! >= 0 && current! < 8)
      return current!;
    const used = new Set(this.colours.values());
    let token = 0;
    while (token < 8 && used.has(token)) token++;
    if (token === 8) token = this.colours.size % 8;
    this.colours.set(id, token);
    return token;
  }
  destroy() {
    if (this.stopped) return;
    this.stopped = true;
    this.messages.unobserve(this.change);
    this.colours.unobserve(this.change);
    this.order.unobserve(this.change);
    this.meta.unobserve(this.change);
    this.doc.destroy();
    this.ls.clear();
  }
}
