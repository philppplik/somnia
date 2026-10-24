# Collab: two-machine Windows test plan

Core fix 9.3: the collab stack has never run between two real Windows machines. This is
the manual plan for that first pass. Run it before office collab (CO2) ships as alpha.

## Setup

- Two Windows 11 machines (A = host, B = guest), same LAN for LAN-Direct; plus one
  self-hosted relay (`relay/`) on a third machine or a free tunnel for the relay pass.
- Build A and B from the same commit. `somniaRelease` must match on both (CO1e announces
  it; a mismatch must later block office sync).
- A project on A with: a few text files, one image, one PDF, one `.pptx`, and a text file
  padded over 2 MiB (`big.txt`).

## Matrix (run each on LAN-Direct and on the relay)

| # | Scenario | Pass when |
|---|---|---|
| 1 | A hosts, B joins with the link | B sees the project, both see 2 participants, fingerprint comparison matches |
| 2 | Both edit the same text file at once | Both converge, no lost characters, per-person undo only undoes own edits |
| 3 | B pastes a >2 MiB text into `big.txt` | Arrives at A; nobody is kicked (1009 must not appear) |
| 4 | Image, PDF and `.pptx` on A | B receives all three byte-exact and the app opens them |
| 5 | B pulls the network cable for 60 s | B notices (heartbeat), reconnects on its own, edits made offline merge |
| 6 | A's machine sleeps for 5 min | B's client reports unreachable or reconnects after wake; no phantom "connected" |
| 7 | A revokes B | B is out with the honest message, rejoin with the old link fails |
| 8 | Session expires | Both ends show "expired", no retries after 4004 |
| 9 | Windows Firewall prompt on first LAN-Direct host | Documented: allow on private networks only; guest Wi-Fi case noted in docs |
| 10 | Chat incl. one attachment each way | Arrives; masked link never shows `#key=` in the share dialog |

## Notes

- Watch the relay log for 1008 (send budget) during scenario 3: a >2 MiB sync now arrives
  as 1 MiB chunks; if the budget trips, that is the known pacing gap, not a chunking bug.
- Record timings for join and for scenario 3; they become the baseline for office sync.
- File every failure as a GitHub issue with the build string both machines announced.
