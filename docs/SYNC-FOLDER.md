# Sync folder

Desktop only. Settings > Modified > Sync folder lets you pick a folder (Dropbox, iCloud Drive, Syncthing, a network share). Somnia keeps one file in it, `somnia-sync.json`, with your user settings and keyboard shortcuts.

- **What is synced:** user settings that differ from the default, and shortcut overrides. Project settings (`.somnia/settings.json`) already live inside each project folder and travel with it. API keys, tokens and accounts are never synced. Profiles do not exist yet.
- **Conflict rule:** the newer version wins. If only one side changed since the last sync, that side wins. If both changed, the later change wins and Somnia says so. On first link, a machine with default settings takes the folder's content instead of overwriting it.
- **Security:** the folder is chosen in the native dialog and stored only by the host. The renderer can read and write just `somnia-sync.json` (max 256 KB), nothing else in the folder. Contents are validated like a manual settings import; unknown or invalid entries are skipped.
- **When it runs:** on choosing the folder and on "Sync now". Stop syncing leaves the folder and file untouched.
