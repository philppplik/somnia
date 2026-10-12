#!/usr/bin/env python3
# Fake ACP v1 agent for vibespace-acp tests. Behaviour is chosen by argv flags and by the
# prompt text. Speaks newline-delimited JSON-RPC on stdio. Test fixture only.
import json, os, subprocess, sys, threading, time

flags = set(sys.argv[1:])
heartbeat = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--heartbeat=")), None)
lock = threading.Lock()
waiters = {}
next_id = 1000

def send(obj):
    with lock:
        sys.stdout.write(json.dumps(obj) + "\n")
        sys.stdout.flush()

def update(sid, text):
    send({"jsonrpc": "2.0", "method": "session/update",
          "params": {"sessionId": sid, "update": {"sessionUpdate": "agent_message_chunk",
                                                  "content": {"type": "text", "text": text}}}})

def ask(sid, kind, title, path=None):
    global next_id
    next_id += 1
    ev = threading.Event()
    waiters[next_id] = [ev, None]
    tc = {"toolCallId": "tc-%d" % next_id, "title": title, "kind": kind}
    if path:
        tc["locations"] = [{"path": path}]
    send({"jsonrpc": "2.0", "id": next_id, "method": "session/request_permission",
          "params": {"sessionId": sid, "toolCall": tc,
                     "options": [{"optionId": "ao", "name": "Allow once", "kind": "allow_once"},
                                 {"optionId": "aa", "name": "Allow always", "kind": "allow_always"},
                                 {"optionId": "ro", "name": "Reject", "kind": "reject_once"}]}})
    ev.wait(30)
    return waiters[next_id][1]

def handle_prompt(rid, p):
    sid = p["sessionId"]
    text = "".join(b.get("text", "") for b in p["prompt"])
    if text.startswith("ask:"):
        kind = text.split(":", 1)[1]
        r = ask(sid, kind, "do a " + kind, "/work/x.txt" if kind in ("edit", "read", "delete") else None)
        o = (r or {}).get("outcome", {})
        update(sid, "perm=%s:%s" % (o.get("outcome"), o.get("optionId")))
    elif text == "spawn":
        if heartbeat:
            code = "import time\nwhile True:\n open(%r,'a').write('x')\n time.sleep(0.05)\n" % heartbeat
            subprocess.Popen([sys.executable, "-c", code], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        update(sid, "spawned")
        time.sleep(3600)  # ignore cancel: only the kill can end this turn
    elif text == "slow":
        update(sid, "working")
        for _ in range(200):
            if cancelled.get(sid):
                send({"jsonrpc": "2.0", "id": rid, "result": {"stopReason": "cancelled"}})
                return
            time.sleep(0.05)
    else:
        update(sid, "echo:" + text)
    send({"jsonrpc": "2.0", "id": rid, "result": {"stopReason": "end_turn"}})

cancelled = {}
sessions = 0
for line in sys.stdin:
    try:
        m = json.loads(line)
    except Exception:
        continue
    meth, rid = m.get("method"), m.get("id")
    if meth == "initialize":
        ver = 2 if "--v2" in flags else 1
        send({"jsonrpc": "2.0", "id": rid, "result": {
            "protocolVersion": ver,
            "agentCapabilities": {"loadSession": "--no-load" not in flags},
            "authMethods": []}})
    elif meth == "session/new":
        sessions += 1
        send({"jsonrpc": "2.0", "id": rid, "result": {"sessionId": "sess-%d-%d" % (os.getpid() % 1000, sessions)}})
    elif meth == "session/load":
        sid = m["params"]["sessionId"]
        update(sid, "replay:" + sid)
        send({"jsonrpc": "2.0", "id": rid, "result": None})
    elif meth == "session/prompt":
        threading.Thread(target=handle_prompt, args=(rid, m["params"]), daemon=True).start()
    elif meth == "session/cancel":
        cancelled[m["params"]["sessionId"]] = True
    elif meth is None and rid in waiters:
        waiters[rid][1] = m.get("result")
        waiters[rid][0].set()
    elif rid is not None and meth:
        send({"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "nope"}})
