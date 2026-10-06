import { useEffect, useRef, useState } from "react";
import { useChatSession } from "../lib/collab/chatSession";
import {
  CHAT_MAX_ATTACHMENTS,
  CHAT_MAX_BODY,
  type ChatAttachment,
  type ChatMessage,
} from "../lib/collab/chatModel";
import { initialOf } from "../lib/collab/badgePolicy";
import { formatBytes } from "../lib/media";
import { getState, patchState } from "../store/appStore";
import { useT } from "../lib/useT";
import { openSessionChat } from "../lib/collab/communication";
export function SessionChat() {
  const { t, locale } = useT(),
    session = useChatSession();
  const [body, setBody] = useState(""),
    [mentions, setMentions] = useState<string[]>([]),
    [reply, setReply] = useState<ChatMessage | null>(null),
    [files, setFiles] = useState<ChatAttachment[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [drop, setDrop] = useState(false),
    [mentionIndex, setMentionIndex] = useState(0),
    [below, setBelow] = useState(0),
    [readBoundary, setReadBoundary] = useState<number | null>(null),
    [reference, setReference] = useState<
      { file: string; line: number } | undefined
    >();
  const input = useRef<HTMLTextAreaElement>(null),
    picker = useRef<HTMLInputElement>(null),
    log = useRef<HTMLDivElement>(null),
    pinned = useRef(true),
    previousCount = useRef(0);
  const messages = session?.model.list() ?? [];
  const lastAt = body.lastIndexOf("@"),
    query =
      lastAt >= 0 && !/\s/.test(body.slice(lastAt + 1))
        ? body.slice(lastAt + 1).toLocaleLowerCase()
        : null;
  const participants = (session?.participants() ?? []).filter(
    (p) => query !== null && p.name.toLocaleLowerCase().includes(query),
  );
  useEffect(() => {
    setBody("");
    setFiles([]);
    setMentions([]);
    setReply(null);
    setBelow(0);
    setReference(undefined);
    setReadBoundary(null);
    if (session?.unread)
      setReadBoundary(
        Math.max(0, session.model.list().length - session.unread),
      );
    session?.setOpen(true);
    return () => {
      session?.setOpen(false);
      session?.typing(false);
      session?.discardDrafts();
    };
  }, [session]);
  useEffect(() => {
    const delta = messages.length - previousCount.current;
    previousCount.current = messages.length;
    if (pinned.current && log.current)
      log.current.scrollTop = log.current.scrollHeight;
    else if (delta > 0) setBelow((n) => n + delta);
  }, [messages.length]);
  useEffect(() => {
    if (!session) return;
    session.typing(Boolean(body));
    const timer = setTimeout(() => session.typing(false), 3000);
    return () => clearTimeout(timer);
  }, [body, session]);
  const choose = (i: number) => {
    const p = participants[i];
    if (!p) return;
    setBody(body.slice(0, lastAt) + "@" + p.name + " ");
    setMentions([...new Set([...mentions, p.id])]);
    setMentionIndex(0);
    input.current?.focus();
  };
  const attach = async (incoming: File[]) => {
    if (!session || busy) return;
    if (files.length + incoming.length > CHAT_MAX_ATTACHMENTS) {
      setError(t("chat.limit"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const added: ChatAttachment[] = [];
      try {
        for (const f of incoming) added.push(await session.attach(f));
        setFiles((prev) => [...prev, ...added]);
      } catch (error) {
        for (const a of added) session.discard(a.id);
        throw error;
      }
    } catch {
      setError(t("chat.limit"));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<File[]>).detail;
      if (Array.isArray(detail)) void attach(detail);
    };
    window.addEventListener("somnia:chat-drop", listener);
    return () => window.removeEventListener("somnia:chat-drop", listener);
  }, [session, busy, files.length]);
  const send = () => {
    if (!session || busy || (!body.trim() && !files.length)) return;
    try {
      session.send(body, mentions, reply?.id, files, reference);
      setBody("");
      setMentions([]);
      setReply(null);
      setFiles([]);
      setReference(undefined);
      setError("");
      pinned.current = true;
      setBelow(0);
    } catch {
      setError(t("chat.failed"));
    }
  };
  const jump = (r: { file: string; line: number }) => {
    if (getState().files[r.file] === undefined) {
      setError(t("chat.missing"));
      return;
    }
    patchState({
      activeFile: r.file,
      jumpTo: { file: r.file, line: r.line, col: 1, nonce: Date.now() },
      viewMode: "code",
    });
  };
  const time = (at: number) =>
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(at);
  return (
    <section
      className="sc-panel"
      aria-label={t("chat.title")}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.stopPropagation();
          setDrop(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDrop(false);
        void attach([...e.dataTransfer.files]);
      }}
    >
      <header className="sc-header">
        <h2>{t("chat.title")}</h2>
        <span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="3"
              y="7"
              width="10"
              height="7"
              rx="2"
              stroke="currentColor"
            />
            <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" />
          </svg>{" "}
          {t("chat.sessionOnly")}
        </span>
      </header>
      {!session ? (
        <p className="sc-empty">{t("chat.noSession")}</p>
      ) : (
        <>
          <div
            className="sc-log"
            ref={log}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            onScroll={(e) => {
              pinned.current =
                e.currentTarget.scrollHeight -
                  e.currentTarget.scrollTop -
                  e.currentTarget.clientHeight <
                48;
              if (pinned.current) setBelow(0);
            }}
          >
            {session.model.meta.get("trimmed") && (
              <p className="sc-empty">{t("chat.trimmed")}</p>
            )}
            {messages.length === 0 && (
              <p className="sc-empty">{t("chat.empty")}</p>
            )}
            {messages.map((m, i) => {
              const grouped =
                i > 0 &&
                messages[i - 1].author.id === m.author.id &&
                m.sentAt - messages[i - 1].sentAt < 120000;
              const parent = m.replyTo
                ? messages.find((p) => p.id === m.replyTo)
                : null;
              return (
                <div key={m.id}>
                  {readBoundary === i && (
                    <div className="sc-unread-divider">
                      {t("chat.new", { count: messages.length - i })}
                    </div>
                  )}
                  <article
                    className={`sc-row ${m.mentions.includes(session.localId) ? "sc-mentioned" : ""} ${grouped ? "sc-grouped" : ""}`}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key.toLowerCase() === "r") {
                        e.preventDefault();
                        setReply(m);
                        input.current?.focus();
                      }
                    }}
                  >
                    {!grouped && (
                      <span
                        className="sc-avatar"
                        data-person-token={m.author.token}
                        title={m.author.name}
                      >
                        {initialOf(m.author.name)}
                      </span>
                    )}
                    <div className="sc-content">
                      {!grouped && (
                        <div className="sc-meta">
                          <strong data-person-token={m.author.token}>
                            {m.author.id === session.localId
                              ? t("chat.you")
                              : m.author.name}
                          </strong>
                          <time dateTime={new Date(m.sentAt).toISOString()}>
                            {time(m.sentAt)}
                          </time>
                          {m.author.id === session.localId && (
                            <span className="sc-delivery">
                              {t(
                                session.model.sequence(m.id)
                                  ? "chat.shared"
                                  : "chat.sending",
                              )}
                            </span>
                          )}
                        </div>
                      )}
                      {parent && (
                        <button
                          className="sc-quote"
                          type="button"
                          data-person-token={parent.author.token}
                          onClick={() => {
                            const row = log.current?.querySelector(
                              `[data-message-id="${parent.id}"]`,
                            );
                            row?.scrollIntoView({ block: "nearest" });
                          }}
                        >
                          {parent.author.name}: {parent.body.slice(0, 100)}
                        </button>
                      )}
                      <p data-message-id={m.id}>
                        {m.body.split(/(@[^\s]+)/g).map((part, j) =>
                          part.startsWith("@") ? (
                            <span className="sc-mention" key={j}>
                              {part}
                            </span>
                          ) : (
                            part
                          ),
                        )}
                      </p>
                      {m.reference && (
                        <button
                          className="sc-reference"
                          onClick={() => jump(m.reference!)}
                        >
                          ‹› {m.reference.file} ·{" "}
                          {t("chat.line", { line: m.reference.line })} ↗
                        </button>
                      )}
                      {m.attachments.map((a) => {
                        const f = session.file(a.id),
                          progress = session.blobs.progress(a.id);
                        return (
                          <div className="sc-file" key={a.id}>
                            {f && a.mime.startsWith("image/") && (
                              <img src={f.url} alt={a.name} loading="lazy" />
                            )}
                            <div>
                              <strong>{a.name}</strong>
                              <span>{formatBytes(a.size)}</span>
                              {f ? (
                                <a href={f.url} download={a.name}>
                                  {t("chat.download")}
                                </a>
                              ) : (
                                <>
                                  <span>
                                    {progress.state === "unavailable"
                                      ? t("chat.unavailable")
                                      : t("chat.receiving", {
                                          percent: Math.round(
                                            (progress.received / a.size) * 100,
                                          ),
                                        })}
                                  </span>
                                  <progress
                                    max={a.size}
                                    value={progress.received}
                                  />
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="sc-reply"
                      aria-label={t("chat.reply")}
                      title={t("chat.reply")}
                      onClick={() => {
                        setReply(m);
                        input.current?.focus();
                      }}
                    >
                      ↩
                    </button>
                  </article>
                </div>
              );
            })}
          </div>
          {below > 0 && (
            <button
              className="sc-new"
              onClick={() => {
                pinned.current = true;
                if (log.current)
                  log.current.scrollTop = log.current.scrollHeight;
                setBelow(0);
              }}
            >
              ↓ {t("chat.new", { count: below })}
            </button>
          )}
          <div className="sc-typing">
            {session
              .participants()
              .filter(
                (p) =>
                  !p.self &&
                  [...session.project.awareness.getStates().values()].some(
                    (s) =>
                      s.user?.participantId === p.id &&
                      typeof s.typing === "number" &&
                      Date.now() - s.typing < 4000,
                  ),
              )
              .map((p) => t("chat.typing", { name: p.name }))
              .join(" · ")}
          </div>
          {error && (
            <p role="alert" className="sc-error">
              {error}
            </p>
          )}
          <div className="sc-composer">
            {reply && (
              <div className="sc-draft-reply">
                {t("chat.replyTo", { name: reply.author.name })}:{" "}
                {reply.body.slice(0, 70)}
                <button
                  aria-label={t("chat.cancelReply")}
                  onClick={() => setReply(null)}
                >
                  ×
                </button>
              </div>
            )}
            {files.map((f) => (
              <div className="sc-draft-file" key={f.id}>
                {f.name} · {formatBytes(f.size)}
                <button
                  aria-label={t("chat.removeAttachment")}
                  onClick={() => {
                    session.discard(f.id);
                    setFiles(files.filter((a) => a.id !== f.id));
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            {reference && (
              <button
                onClick={() => setReference(undefined)}
                className="sc-reference"
              >
                {reference.file} · {t("chat.line", { line: reference.line })} ×
              </button>
            )}
            <textarea
              ref={input}
              value={body}
              maxLength={CHAT_MAX_BODY}
              placeholder={t("chat.placeholder")}
              aria-label={t("chat.message")}
              rows={2}
              onChange={(e) => {
                setBody(e.target.value);
                setMentionIndex(0);
              }}
              onPaste={(e) => {
                const fs = [...e.clipboardData.files];
                if (fs.length) {
                  e.preventDefault();
                  e.stopPropagation();
                  void attach(fs);
                }
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (query !== null && participants.length) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex(
                      (mentionIndex +
                        (e.key === "ArrowDown" ? 1 : participants.length - 1)) %
                        participants.length,
                    );
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    choose(mentionIndex % participants.length);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setBody(body + " ");
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            {query !== null && participants.length > 0 && (
              <div
                className="sc-participants"
                role="listbox"
                aria-label={t("chat.mention")}
              >
                {participants.map((p, i) => (
                  <button
                    role="option"
                    aria-selected={i === mentionIndex}
                    key={p.id}
                    onClick={() => choose(i)}
                  >
                    <span className="sc-avatar" data-person-token={p.token}>
                      {initialOf(p.name)}
                    </span>
                    <strong>{p.name}</strong>
                    <span>{p.file}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="sc-actions">
              <input
                ref={picker}
                type="file"
                hidden
                multiple
                onChange={(e) => {
                  void attach([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
              <button
                disabled={busy}
                aria-label={t("chat.attach")}
                title={t("chat.attach")}
                onClick={() => picker.current?.click()}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="m8 13 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7l9-9"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <button
                aria-label={t("chat.mention")}
                onClick={() => {
                  setBody(body + "@");
                  input.current?.focus();
                }}
              >
                @
              </button>
              <button
                aria-label={t("chat.reference")}
                onClick={() => {
                  const s = getState();
                  if (s.activeFile)
                    setReference({ file: s.activeFile, line: s.cursorLine });
                }}
              >
                ‹›
              </button>
              <button
                className="sc-send"
                disabled={busy || (!body.trim() && !files.length)}
                onClick={send}
              >
                {busy ? t("chat.preparing") : t("chat.send")} ↵
              </button>
            </div>
          </div>
        </>
      )}
      {drop && (
        <div className="sc-drop">
          <strong>{t("chat.drop")}</strong>
          <p>{t("chat.limits")}</p>
          <small>{t("chat.noImport")}</small>
        </div>
      )}
    </section>
  );
}
export function ChatMentionToast() {
  const session = useChatSession(),
    { t } = useT();
  useEffect(() => {
    if (!session?.notification) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") session.dismiss();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [session, session?.notification]);
  if (!session?.notification) return null;
  const m = session.model.list().find((m) => m.id === session.notification);
  if (!m) return null;
  return (
    <div className="sc-toast" role="status">
      <strong>{t("chat.mentioned", { name: m.author.name })}</strong>
      <p>{m.body.slice(0, 150)}</p>
      <button onClick={openSessionChat}>{t("chat.open")} ↵</button>
      <button onClick={() => session.dismiss()} aria-label={t("chat.dismiss")}>
        ×
      </button>
    </div>
  );
}
