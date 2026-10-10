// Fake task-engine sidecar speaking somnia.task-engine/1 (test fixture only).
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
const rl = readline.createInterface({ input: process.stdin });
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
rl.once("line", async (line) => {
  const { task } = JSON.parse(line);
  const p = task.prompt;
  out({ event: "plan", text: "write notes" });
  out({ event: "progress", text: "working" });
  if (p.includes("slow")) { await new Promise((r) => setTimeout(r, 30000)); }
  if (p.includes("fail")) return out({ event: "failed", message: "engine exploded" });
  if (p.includes("ask")) return out({ event: "needs-input", reason: "which page?" });
  if (p.includes("noop")) return out({ event: "done", summary: "nothing to do", tokens: 1, cost: 0 });
  fs.mkdirSync(path.join(task.cwd, "site"), { recursive: true });
  fs.writeFileSync(path.join(task.cwd, "site", "index.html"), "<h1>hi</h1>\n");
  if (p.includes("outside")) fs.writeFileSync(path.join(task.cwd, "stray.txt"), "x\n");
  out({ event: "done", summary: "added index", tokens: 1234, cost: 0.02, verification: { commands: ["noop"], outcome: "pass" } });
});
