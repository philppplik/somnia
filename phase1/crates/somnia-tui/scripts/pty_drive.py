#!/usr/bin/env python3
"""Drive the TUI in a real pty (demo mode), approve all hunks, quit, and save the raw capture."""
import os, pty, sys, time, select, struct, fcntl, termios
exe, out = sys.argv[1], sys.argv[2]
pid, fd = pty.fork()
if pid == 0:
    os.environ.update(TERM="xterm-256color", COLORTERM="truecolor")
    os.execv(exe, [exe, "--demo"])
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 28, 100, 0, 0))
buf = b""
def pump(t):
    global buf
    end = time.time() + t
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            try: buf += os.read(fd, 65536)
            except OSError: return
pump(7)
os.write(fd, b"A"); pump(0.5); os.write(fd, b"\r"); pump(3)
os.write(fd, b"q"); pump(1)
_, status = os.waitpid(pid, 0)
open(out, "wb").write(buf)
print("exit code", os.WEXITSTATUS(status), "bytes", len(buf))
