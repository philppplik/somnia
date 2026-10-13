#!/usr/bin/env python3
"""Real-pty end to end: somnia-tui (raw mode, alternate screen) over the real `somnia run --tui-stdio`
with the fake engine. Types an answer to a needs_input question, approves the resulting hunk, expects exit 0.
usage: pty_e2e.py TUI_EXE SOMNIA_EXE ENGINE_MJS REPO_DIR RUNTIME_DIR"""
import os, pty, re, select, struct, fcntl, termios, sys, time, json
tui, somnia, engine, repo, rt = sys.argv[1:6]
env = dict(os.environ, TERM="xterm-256color", COLORTERM="truecolor", XDG_RUNTIME_DIR=rt,
           SOMNIA_ENGINE_CMD=json.dumps(["node", engine]), GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_NOSYSTEM="1")
pid, fd = pty.fork()
if pid == 0:
    os.chdir(repo)
    os.execve(tui, [tui, "--", somnia, "run", "ask which page", "--tui-stdio"], env)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 30, 110, 0, 0))
buf = b""
ANSI = re.compile(rb"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[()][A-Z0-9]|\x1b[=>]")
def text(): return ANSI.sub(b"", buf).decode("utf8", "replace")
def wait_for(s, t=20):
    global buf
    end = time.time() + t
    while time.time() < end:
        if s in text(): return
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            try: buf += os.read(fd, 65536)
            except OSError: break
    sys.stderr.write("TIMEOUT waiting for %r; screen text:\n%s\n" % (s, text()[-1500:]))
    os.kill(pid, 9); sys.exit(3)
wait_for("Needs input: which page?")
# alt screen + raw mode really entered
assert b"\x1b[?1049h" in buf, "alternate screen not entered"
# ratatui redraws by cell diff, so typed text is not contiguous in the byte stream: type, then check effects.
os.write(fd, b"pricinx"); time.sleep(0.4); os.write(fd, b"\x7f"); time.sleep(0.2); os.write(fd, b"g"); time.sleep(0.4)
os.write(fd, b"\r")
wait_for("Review")
wait_for("answer.txt")
os.write(fd, b"A"); time.sleep(0.4); os.write(fd, b"\r")
time.sleep(2.0)  # core finishes; q before that would be a cancel (exit 2), which the exit code check would catch
os.write(fd, b"q")
end = time.time() + 5
while time.time() < end:
    r, _, _ = select.select([fd], [], [], 0.1)
    if r:
        try: buf += os.read(fd, 65536)
        except OSError: break
_, status = os.waitpid(pid, 0)
assert b"\x1b[?1049l" in buf, "alternate screen not left"
code = os.WEXITSTATUS(status)
ans = os.path.join(repo, "site", "answer.txt")
assert os.path.exists(ans) and "which page?=pricing\n" in open(ans).read(), "answer did not reach the engine"
print("pty e2e ok, exit", code)
sys.exit(0 if code == 0 else 1)
