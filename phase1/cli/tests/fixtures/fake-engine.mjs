// Fake task-engine sidecar speaking somnia.task-engine/1 (test fixture only).
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
const rl = readline.createInterface({ input: process.stdin });
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
// Graceful cancel: record that the host asked, then exit (tests assert the marker).
rl.on("line", (l) => { try { if (JSON.parse(l).op === "cancel") { fs.writeFileSync(path.join(process.env.FAKE_ENGINE_MARKER || "/tmp", "cancel-seen"), "1"); process.exit(0); } } catch {} });
rl.once("line", async (line) => {
  const { task } = JSON.parse(line);
  const p = task.prompt;
  if (p.includes("authfail")) return out({ event: "failed", message: "key rejected", code: "auth", retryable: false });
  out({ event: "plan", text: "write notes" });
  if (p.includes("tooly")) {
    out({ event: "model", provider: "fake", model: "fake-1" });
    out({ event: "tool-call", id: "c1", name: "read_file", summary: "README.md" });
    out({ event: "tool-result", id: "c1", status: "ok", summary: "README.md 1 lines" });
    out({ event: "usage", tokens: 100, cost: null });
    out({ event: "tool-call", id: "c2", name: "write_file", summary: "site/index.html" });
    out({ event: "tool-result", id: "c2", status: "weird", summary: "denied" });
    out({ event: "future-event", whatever: 1 });
    out({ event: "usage", tokens: 250, cost: 0.01 });
  }
  out({ event: "progress", text: "working" });
  if (p.includes("slow")) { await new Promise((r) => setTimeout(r, 30000)); }
  if (p.includes("fail")) return out({ event: "failed", message: "engine exploded" });
  if (p.includes("ask")) return out({ event: "needs-input", reason: "which page?" });
  if (p.includes("noop")) return out({ event: "done", summary: "nothing to do", tokens: 1, cost: 0 });
  if (p.includes("multihunk")) {
    const f = path.join(task.cwd, "site", "big.txt");
    const l = fs.readFileSync(f, "utf8").split("\n");
    l[1] = "line 2 EDITED"; l[39] = "line 40 EDITED";
    fs.writeFileSync(f, l.join("\n"));
    return out({ event: "done", summary: "edited", tokens: 1, cost: 0 });
  }
  fs.mkdirSync(path.join(task.cwd, "site"), { recursive: true });
  fs.writeFileSync(path.join(task.cwd, "site", "index.html"), "<h1>hi</h1>\n");
  if (p.includes("outside")) fs.writeFileSync(path.join(task.cwd, "stray.txt"), "x\n");
  out({ event: "done", summary: "added index", tokens: 1234, cost: 0.02, verification: { commands: ["noop"], outcome: "pass" } });
});
