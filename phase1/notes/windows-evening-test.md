# Windows test guide (v10.3.0): two computers

Purpose: check what CI cannot. CI only tests two browser windows on one Linux machine. Nothing here has been run on real Windows by us.
Installers are not code-signed, so SmartScreen shows a warning ("More info", then "Run anyway").

Report results as: step number, pass or fail, and what you saw (screenshot if it failed).

## 0. Install (both PCs)
1. Download `Somnia-v10.3.0-x64-setup.exe` from https://github.com/philppplik/somnia/releases/tag/v10.3.0 and check it against `SHA256SUMS.txt` (`certutil -hashfile <file> SHA256`).
2. Install, start. The window opens, menus and window buttons work, no crash.
3. Settings: switch language to Deutsch, Espanol, Francais, Portugues (Brasil), back to English. Menus and tooltips change.

## 1. Single PC basics
4. Open a folder with a few HTML files. Edit, save, reload from disk.
5. Drop one PNG and one PDF from Explorer onto the window: read-only preview tabs open.
6. Drop an HTML file plus a PNG together: both are added.
7. Open a folder that contains images and PDFs: previews load.
8. Open a folder with 500 or more small files: it opens, the file list scrolls, saving the last file works.

## 2. LAN collaboration (needs both PCs on the same network)
9. PC A: open a project, open Share, choose "Share my project", tick "Allow people on my local network", pick an invite lifetime, "Start sharing".
10. Windows Firewall asks for permission: allow on Private networks. Note whether the prompt appeared.
11. Copy the LAN link. Send it to PC B (chat or USB, any way).
12. PC B: Share, "Join a project", paste link, name, Join. B receives the project.
13. Type on both sides at the same time: text merges, cursors and names are visible, the status pill shows "LAN".
14. A creates a new file and renames and deletes another: B follows.
15. A adds a PNG and a PDF to the project: B receives them (pill tooltip shows media status).
16. B closes its window, reopens, joins again: works until the invite expires.
17. A clicks "End session": B is disconnected and cannot rejoin.
18. Start a session with the shortest lifetime and wait: after expiry B is refused.

## 3. Relay (optional, needs Docker or Rust on one machine)
19. On any PC run the relay: `docker build -t somnia-relay relay/` then `docker run --rm -p 8787:8787 somnia-relay`, or `cargo run --release --bin somnia-relay`. See `relay/README.md`.
20. In Share choose the relay mode, enter `ws://<relay-pc-ip>:8787`, start, join from the other PC. Same checks as 13 and 15.
21. The app shows a warning for `ws://` (no TLS). Content is still end-to-end encrypted when the link has a key.
App and relay must both be v10.3.0.

## 4. Known limits (not bugs)
- Viewer links cannot be enforced against a malicious guest. The UI says so.
- The Windows updater and the Microsoft Store build are separate paths. The Store build has the GitHub updater off.
- Translations are machine translated.
