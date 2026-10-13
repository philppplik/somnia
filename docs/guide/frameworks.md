# Frameworks

Status depends on the framework. Check the release notes of your version.

| Item | Status |
| --- | --- |
| Editing HTML, CSS, JS, JSX, TS and TSX as source in Code Studio | **Stable** |
| Live view of project-relative files and relative ES modules in a web page | **Pre-release** (12.2 line). ES module cycles are not supported. |
| New project templates: React, Vue, Svelte, Solid (TypeScript or JavaScript) with managed install and preview | **Pre-release** |
| Next.js, Astro, Nuxt, SvelteKit | **In development** |
| Tailwind and Bootstrap | Editable as source. No dedicated compiler or visual support is claimed. |

## Framework projects

**Project > New project** creates a project from an offline template with pinned dependency versions. Framework projects open in Code Studio with preview controls, not in the HTML visual editor.

- **Run preview** starts a development server managed by Somnia.
- **Open preview** shows it in a separate window with no editor access. Closing that window stops the server.
- Alt-click an element in the preview to jump to its source.

The first run asks to download a Node runtime into Somnia's private app data. It is pinned and checked by SHA-256. You can remove it later. Code editing works without it. Install runs with scripts disabled. Project `package.json` scripts do not choose what runs.

Limits: two project processes in total, one per project. Install times out after 10 minutes, build after 5.

More: [React projects](../frameworks/react-projects.md), [Vue, Svelte and Solid](../frameworks/vue-svelte-solid-projects.md), [Framework runner](../framework-runner.md), [Live preview](../live-preview-architecture.md), [Live view navigation](../live-preview-navigation.md).

## Components

The Components panel stores reusable HTML blocks and variants per app profile. They are not framework packages. Thumbnails render in a restricted preview, so an unstyled thumbnail does not mean your page is broken. See [Component system](../features/component-system.md).
