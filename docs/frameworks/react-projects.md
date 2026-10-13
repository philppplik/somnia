# React projects

Project > New project creates an interactive React app. TypeScript is the default; JavaScript is also available. Choose a name, then a parent folder. Somnia writes the bundled template into a new folder and refuses to replace existing files. Save or close an existing dirty project first.

Templates are offline data. Each includes exact dependency versions, an npm lockfile, `somnia.template.json`, an accessible starter, and `somnia-preview.mjs`. Package installation and execution use the native managed runtime. They never run arbitrary `package.json` scripts. The native runner asks for helper installation when needed.

Framework projects open as code with preview controls, not the HTML visual editor. Run preview starts the managed development server. Open preview uses a separate native window with no editor capability. Closing that window stops the development server. The existing static HTML preview keeps its isolated iframe mode.

## Preview security

The Vite plugin binds to `127.0.0.1`, uses the runner-selected strict port, and requires the ephemeral preview token. The initial token query establishes an HttpOnly, SameSite=Strict cookie. HTTP and WebSocket requests cannot widen the origin or port. CSP blocks outbound requests, nested frames, forms and inline scripts. Vite's React Refresh inline preamble is served as a same-origin module instead of relaxing script policy.

Alt-clicking a native HTML element queues a source location. POST requires the preview cookie, exact loopback Origin and JSON content type. GET requires the Bearer preview token and returns at most 64 locations, not source contents. The native runner validates the location against the project root and emits a source event to the editor. The editor checks the current project id and an already-loaded source path before jumping. No IPC capability is given to the previewed app.

The plugin is development-only. Production builds contain neither the source markers nor the click handler. Existing third-party React projects can be detected without executing code; their preview security depends on their config and the native runner's template validation. Detection does not authorize execution.

## Local checks

From `phase1/`:

```
./node_modules/.bin/tsx --test src/lib/frameworks/frameworks.test.ts src/components/NewProjectDialog.test.tsx
node --test src/lib/frameworks/plugin.test.mjs
node scripts/verify-framework-templates.mjs
```

The template verification script uses temporary directories, installs the pinned lockfiles with lifecycle scripts disabled, builds both templates, and verifies the static artifact. No SSH host or GitHub Actions job is used.

Native folder picking, runtime consent, separate-window navigation restrictions and Windows behavior need a desktop acceptance test. The browser checks cover the template build, CSP, authentication, React interaction, source queue, gallery layout and theme contrast.
