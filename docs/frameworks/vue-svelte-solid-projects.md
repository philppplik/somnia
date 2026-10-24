# Vue, Svelte and Solid projects

Project > New project offers React, Vue, Svelte and Solid. Each has a TypeScript and a JavaScript template. The flow, safety rules and preview are the same as for [React projects](react-projects.md). This page lists what differs.

## Templates

| Template | Entry file | Vite plugin | Notes |
| --- | --- | --- | --- |
| `vue-ts`, `vue-js` | `src/App.vue` | `@vitejs/plugin-vue` | `<script setup>`, `ref`. TS adds `src/env.d.ts` for `.vue` imports. |
| `svelte-ts`, `svelte-js` | `src/App.svelte` | `@sveltejs/vite-plugin-svelte` | Svelte 5 runes (`$state`), `mount()` entry, `vitePreprocess`. |
| `solid-ts`, `solid-js` | `src/App.tsx` or `src/App.jsx` | `vite-plugin-solid` | Signals, `render()` from `solid-js/web`. |

Every template is offline data: exact dependency versions, an npm lockfile that only points at registry.npmjs.org with integrity hashes, `somnia.template.json` (`output: static`, `artifactPath: dist`), `somnia-preview.mjs`, an accessible starter and a shared stylesheet with light and dark colours. The native runner already accepts these frameworks, so no new command or permission was added.

## Click-to-source

Alt-click in the preview opens the source of an element. React and Solid use the JSX parser. Vue markers come from the Vue SFC parser, Svelte markers from the Svelte compiler parser. Only plain HTML elements get a `data-somnia-src` marker, never components, slots or script and style text. If a file does not parse, the plugin leaves it alone and the framework compiler reports the error. The plugin is development-only: production builds contain no marker and no click handler (checked by `verify-framework-templates.mjs`).

The plugin file is one source (`templates/somnia-vite-plugin.mjs`) copied into every template. A test fails if a copy drifts. The Vue and Svelte parsers are loaded lazily from the project's own `node_modules`, so React projects do not need them.

## Checks

From `phase1/`:

```
./node_modules/.bin/tsx --test src/lib/frameworks/*.test.ts src/lib/frameworks/*.test.mjs src/components/NewProjectDialogFrameworks.test.tsx
node scripts/verify-framework-templates.mjs
node scripts/test-framework-preview.mjs vue-ts   # also: svelte-js, solid-ts, react-js, ...
```

`verify-framework-templates.mjs` installs and builds all eight templates in temporary directories. `test-framework-preview.mjs <template>` starts the dev server on loopback and checks authentication, CSP, a click interaction, hot reload after a file edit, click-to-source and blocked outbound requests. Set `SOMNIA_SHOT_DIR` to also save light and dark screenshots. No remote host and no CI job is used. `vue` and `svelte` are dev dependencies of `phase1` only so these parser tests can run.

Native folder picking and the separate preview window still need a desktop test on Windows.
