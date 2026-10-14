# Settings

Open Settings from the app menu. Use the search box at the top. Search clears when you change section. Settings you changed are listed in the "changed" view.

Keyboard shortcuts: **Help > Keyboard shortcuts** opens Settings on Shortcuts. See [Settings deep links](../SETTINGS-DEEP-LINKS.md).

## Sections

The sidebar groups sections as follows (from `phase1/src/components/Settings.tsx`).

| Group | Sections |
| --- | --- |
| App | General, Appearance, Window (desktop only) |
| Editor | Canvas, Editing, Typography, Code editor |
| Workflow | Projects, Export & Publish, Collaboration, Preview, Shortcuts |
| Power-Ups | AI, Extensions, Frameworks |
| System | Updates, Advanced |
| Other | Modified (what you changed, with import and sync folder), About |

## Where things live

| You want to | Go to | More |
| --- | --- | --- |
| Change theme, glass, opacity, corner radius | Appearance | [Glass](../GLASS.md), [Window background](../WINDOW-BACKGROUND.md) |
| Rebind or reset shortcuts | Shortcuts | [Settings deep links](../SETTINGS-DEEP-LINKS.md) |
| Connect an AI provider or MCP tools | AI | [Agent](../agent/README.md), [OpenRouter and Ollama](../agent/using-openrouter-and-ollama.md), [Privacy](../agent/PRIVACY.md), [MCP client](../agent/MCP-CLIENT.md) |
| Manage extensions | Extensions | [Extensions](extensions.md) |
| Node runtime for framework projects | Frameworks | [Frameworks](frameworks.md) |
| Publish settings | Export & Publish | [Deploy](deploy.md) |
| Sync settings between machines | Modified | [Sync folder](../SYNC-FOLDER.md) |
| Live collaboration | Collaboration | [Collaboration](../collaboration.md) |

The app is translated into en, de, es, fr and pt-BR.

## AI

Use your own key or a local model. Keys are kept in the app's Rust host, not in project files. Cloud providers receive what you send them: read [Privacy](../agent/PRIVACY.md) first. Sign-in with an account instead of a key: [Auth](../auth/README.md).

The sync folder syncs project settings and profile or shortcuts, newer wins, and never API keys.

## Settings transfer and performance (Pre-release, beta.4)

- **Export and import setup**: a versioned export, classified by kind. Import offers Merge or Replace with a review step, makes a restore point first and can roll back. Secrets and permissions are never exported.
- **Settings > Advanced > Performance**: studios are kept warm, suspended or evicted to save memory. Session checkpoints let a suspended studio come back where you left it. Layout is restored per studio across restarts.
- **Updates**: on alpha and beta channels the update pill installs signed pre-release builds in the app.
