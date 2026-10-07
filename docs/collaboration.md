# Live collaboration

Work on the same project at the same time. Somnia has no central server: the host's files stay on the host's computer, and people connect directly (local network) or through a relay you run yourself.

Applies to: Somnia 10.x with the collaboration features of the beta 6 line. Developer notes: [`phase1/notes/`](../phase1/notes/) (`collab-protocol.md`, `collab-security.md`, `session-chat-badges.md`). Relay setup: [`relay/README.md`](../relay/README.md).

## Start a session (host)

1. Open **Tools > Share project...**.
2. Pick a mode: **Relay** (your own relay address) or **LAN-Direct** (desktop app only, see [Connection modes](#connection-modes)).
3. Choose how long the session lasts.
4. Check **Your session identity** (see [Your name and picture](#your-name-and-picture)).
5. Press **Start sharing** and send the invite link to a person you trust.

Only the host saves to disk. Guests edit the shared copy.

**New link** replaces the link; **End session and invalidate link** closes every connection. Ending cannot erase copies other people already received. A new session gets a new room and a new key.

## Join a session

1. Open **Tools > Join shared project...**.
2. Paste the invite link.
3. Check your name, then press **Join**.

Joining replaces the project open in your window with the shared one. Your own files on disk are not touched.

If the link is not a Somnia invite link, the dialog says so next to the field. Other failures show a message in the dialog: link refused or session closed, host or relay not reachable, link expired, session full, or too many attempts. Your link and name stay in the form so you can retry.

## Your name and picture

Everyone in a session is shown with a name. Somnia fills it in for you.

- **Prefill.** The name field starts with the nickname from your local profile (Account > Profile). You can change it for this session. Changing it does not touch your profile.
- **Empty profile.** The field starts empty and you must enter a name. The name is saved to your local profile only after the join succeeded. If saving fails, you stay connected and see "Joined. Your name could not be saved on this device." with one **Retry save** button.
- **Host name.** The host appears under the profile nickname. Without a nickname the name is "Host".
- **Rules.** Names have at most 32 characters, one line, no control characters and no angle brackets (`<` `>`). Somnia never shortens or edits a name for you. A profile nickname that is too long for a session stays unchanged in your profile, and the dialog asks you to enter a shorter name for this session.
- **Fixed per session.** Your name is captured when you start or join. Changing your profile later applies to the next session. Reconnecting to the same session keeps your name.
- **Same names.** Two people can use the same name. Mentions use a person's internal ID, not the name, so the right person is always addressed. The mention list adds a short `#id` suffix when names collide. Names and pictures are not verified identities.

### Picture

If your local profile has a picture, Somnia derives a small 48 x 48 JPEG (at most 8 KiB as a data URL) and shares it with the session. It appears next to your messages and in the mention list. There is nothing to upload and no extra setting: change your picture in Account > Profile.

- Without a picture, or if the picture cannot be shared, others see your initials on your colour. Joining and chatting always work.
- If your picture cannot be shared you see "Your picture could not be shared. Others will see your initials."
- The thumbnail is kept only for the session: it is not added to the project, your profile or any file. Other participants can still keep a copy of it, for example with a screenshot.
- Each session accepts a limited number of thumbnails (16 people, 128 KiB in total). People beyond that limit are shown with initials.
- Older versions of Somnia ignore pictures and show initials.

The dialog tells you what others will see: "Your name and picture are visible to people in this session." (or "Your name is visible..." without a picture).

## Session chat

While you are in a session, the right panel has two tabs, **Agent** and **Chat**. Chat is only for the people in the session. Messages and attachments live in the session only and are not added to the project.

- **Open it.** Click the chat button in the right rail (above the Agent button), or use **Ctrl+Alt+C** (Windows, Linux) / **Cmd+Alt+C** (macOS). **Ctrl/Cmd+Shift+C** also opens it. The button exists only during a session.
- **Close it.** The rail button and the shortcut close the panel when the chat is showing. The next press opens the chat again. When the session ends, the panel switches to the Agent tab and stays open.
- **Unread badge.** The rail button shows the number of unread messages (`9+` above nine). It disappears while the chat is open. Screen readers get "Chat, 3 unread messages".
- **Mentions.** Type `@` in the message box to list the people in the session, filtered as you type. Use Up/Down to move, Enter or Tab to choose, Escape to close, or click a person. The `@` button next to the box inserts an `@`. The list shows picture or initials, name and the file that person has open. Mentioned people see the message highlighted and a notification with an **Open chat** button.
- **Messages.** Plain text, up to 8 KiB each. You can reply to a message (focus it and press `R`), link the code location you are in, and attach files. The first message of a run from one person shows their avatar and name. Your own messages are labelled "You".
- **Limits.** Up to 10 MB per file, 5 attachments per message, 50 MB per session. The visible history keeps the latest 500 messages or 512 KiB; a notice appears when older messages were removed. Attachments are shared with the session only. Images and PDFs are shown as cards; other files are download-only.
- **Name badges.** Settings > Collaboration controls the name badges next to remote cursors: **On activity**, **Always** or **Never**.

## Security and privacy

### End-to-end encryption

Invite links carry a key. When a link has a key, all session traffic, including chat and thumbnails, is encrypted end to end and the relay only forwards data it cannot read.

- The dialog shows "End-to-end encrypted. Key fingerprint: ...". Compare the fingerprint with the other person (for example by voice) to be sure you are in the same session.
- A link without a key shows "Not end-to-end encrypted: this link has no key." Do not use it for private work.
- A `ws://` relay or link is not TLS. Content stays encrypted with the key in the link, but who connects is visible on the way.
- LAN links are not TLS. Use them only on a network you trust.

### Viewers are not a security role

Everyone with the link can read, copy and edit the shared text files, and can see who is present. Viewers are not a security role: end-to-end encryption prevents the blind relay from enforcing read-only access. Do not share the link when read-only access is required.

Treat the invite link like a password. Send it only to people you trust, over a channel you trust.

### What is shared

Shared: text files (HTML, CSS, JS, JSON, SVG, TXT, MD) and newly created files. Not shared: renaming, deleting, images and PDFs in the project tree. Chat attachments are separate and stay in the session.

### Limits

- Everyone holding the key can write chat messages and can pretend to be someone else. "Shared with session" means the host accepted the message, not that everyone saw it.
- Ending a session or leaving it clears chat and thumbnails from Somnia. It cannot remove files people downloaded or screenshots they took.
- Name, picture and chat are not proof of who someone is.

## Connection modes

| Mode | Use it when | Notes |
| --- | --- | --- |
| Relay | People are on different networks | Needs your own relay, for example `wss://relay.example.com`. Setup: [`relay/README.md`](../relay/README.md). |
| LAN-Direct | People are on the same local network | Desktop app only. Windows Firewall may ask to allow Somnia; allow it only on private networks you trust. Guest Wi-Fi, VPNs or firewall rules can block it. Somnia does not change firewall rules. |

The status bar pill shows the state (**Sharing**, **Sharing with N**, **Joined**, **Connecting...**, **Reconnecting...**, **Not connected**). Click it to open the dialog.

## Keyboard shortcuts

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Toggle session chat | Ctrl+Alt+C | Cmd+Alt+C |
| Open session chat | Ctrl+Shift+C | Cmd+Shift+C |
| Send message | Enter | Enter |
| New line in message | Shift+Enter | Shift+Enter |
| Choose mention | Enter or Tab | Enter or Tab |
| Close mention list | Escape | Escape |
