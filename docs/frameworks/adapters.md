# Framework adapters

Somnia classifies an existing project folder into a **plan**: what to install, how to build, where the output is, how a server app starts and which environment it gets. The code is `phase1/src/lib/frameworks/adapters.ts` (`planProject`). It is pure: it reads file names and a few small config files, never runs project code and never reads a secret value.

A plan is a proposal. Install, build, start and publish are still `execute` level commands that the user confirms. Detection alone never installs or runs anything.

## Matrix

| Project | Adapter | Output | Install | Build | Artifact | Start on the host | Needs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Folder with `index.html`, no `package.json` | `static-html` | static | none | none | the folder | none | any web server |
| Vite + React, Vue, Svelte, Solid, Preact or vanilla | `vite-spa` | static | `npm ci --ignore-scripts` | `npm run build` | `dist` (or the literal `build.outDir`) | none | SPA fallback rule (`index.html`) |
| Astro, no adapter | `astro-static` | static | as above | `npm run build` | `dist` (or `outDir`) | none | any web server |
| Astro + `@astrojs/node` (standalone) | `astro-node` | node | as above | `npm run build` | `dist` | `node dist/server/entry.mjs` | Node on the host, `PORT` |
| Next.js with `output: 'export'` | `next-export` | static | as above | `npm run build` | `out` | none | any web server, no image optimiser, no rewrites |
| Next.js with `output: 'standalone'` | `next-standalone` | node | as above | `npm run build`, then copy `.next/static` and `public` into the bundle | `.next/standalone` | `node server.js` in the bundle | Node on the host, `PORT` |
| SvelteKit + `adapter-static` | `sveltekit-static` | static | as above | `npm run build` | `build` | none | prerendered routes or a `fallback` |
| SvelteKit + `adapter-node` | `sveltekit-node` | node | as above | `npm run build` | `build` | `node build/index.js` | Node, `PORT`, `ORIGIN` (the site's own URL) |
| Nuxt with `nuxt generate`, `preset: 'static'` or `ssr: false` | `nuxt-generate` | static | as above | `npm run build` | `.output/public` | none | any web server |
| Nuxt default (Nitro node server) | `nuxt-node` | node | as above | `npm run build` | `.output` | `node .output/server/index.mjs` | Node, `PORT` |
| Express, Fastify, Koa, Hono, Nest or any package with a simple `start` | `node-server` | node | as above (on the host: `npm ci --omit=dev`) | `npm run build` if the script exists | project folder without `node_modules` | the `node <file>` from `scripts.start` or `main` | Node, `package-lock.json`, `PORT` |

Meta-frameworks are matched before Vite, because a Next, Astro, SvelteKit or Nuxt project also depends on React, Vue or Svelte.

### What blocks a plan

A blocker stops Build and Publish and shows one sentence. Warnings never block.

| Code (`frameworks.plan.*`) | When | What the user does |
| --- | --- | --- |
| `unsafeOutDir` | the configured output folder is absolute, outside the project or contains shell characters | change the config |
| `viteSsr` | Vite config enables SSR | not supported, use a meta-framework |
| `nextNeedsOutput` | Next without `output: 'export'` or `'standalone'` | add one of the two |
| `adapterNotNode` | Astro with a Vercel, Netlify, Cloudflare or Deno adapter | switch to `@astrojs/node` or static |
| `astroNoAdapter` | Astro `output: 'server'` without an adapter | add `@astrojs/node` |
| `astroMiddlewareMode` | `@astrojs/node` in middleware mode | use standalone mode |
| `svelteAdapterAuto` | SvelteKit with `adapter-auto` or no adapter | pick `adapter-static` or `adapter-node` |
| `nuxtPreset` | Nitro preset other than the node server | remove the preset or use `generate` |
| `noStart`, `startNotPlain` | node app has no start, or the start script is a shell pipeline, an env prefix, `npx` or a flag that loads code | use a plain `node file.js` script |
| `lockMissing` | node app has no `package-lock.json` (the host installs with `npm ci`) | run `npm install` once |
| `noBuildScript` | a build is needed but `scripts.build` is missing | add it |

### Warnings

`viteBase`, `nextImageOptimizer`, `nextExportNoRouting`, `nextDistDir`, `svelteStaticPrerender`, `hardcodedPort` (the server listens on a literal port and never reads `PORT`), `listensOnAllInterfaces`, `entryIsSource`, `noLockfile`, `noNodeRange` (no `engines.node`), `packageIgnored`, `customBuildScript`, `secretInPublicEnv`, plus the artifact check warnings `excludedFiles`, `sourceMaps`, `serverCodeInStatic`, `copyPending`.

## Scripts and trust

- **Managed projects** (created from a Somnia template, `somnia.template.json` matches the detected framework) run exactly `dev` and `build` from fixed argument lists.
- **Other projects** run `npm run build`, which executes whatever the project's `build` script says. A script that is not one of the known framework commands (`vite build`, `tsc -b && vite build`, `astro check && astro build`, `next build`, `nuxt build|generate`, `svelte-kit sync && vite build`) sets `scriptReviewed: false` and the warning `customBuildScript`. The build dialog then names the script and asks once more.
- Install always uses `--ignore-scripts`. `npm ci` when a lockfile exists, `npm install` with a warning when not.
- The server start is never a shell string. `parseNodeStart` accepts only `node [plain flags] <relative .js/.cjs/.mjs file> [plain args]`. It rejects `&&`, `;`, `$()`, env prefixes, `-e`, `-r`, `--require`, `--import`, `--loader`, `--env-file`, parent directories and absolute paths. The start argument vector is stored as an array.

## Environment

| Step | Rule |
| --- | --- |
| Names | Declared names come from `.env.example`, `.env.sample` or `.env.template`. Values are never read. The real `.env*` files are never read at all. |
| Build | `buildEnvFor` starts from `NODE_ENV=production`, `CI=1` and the framework's telemetry opt-out. It accepts only names with the framework's public prefix (`VITE_`, `NEXT_PUBLIC_`, `PUBLIC_`, `NUXT_PUBLIC_`), because the bundler writes those into the output anyway. Server secrets never enter a build. |
| Reserved | `PATH`, `HOME`, `NODE_ENV`, `NODE_OPTIONS`, `PORT`, `HOST`, `ORIGIN`, `SOMNIA_*`, `SSH_*`, `NPM_CONFIG_*`, proxy, `GIT_*`, `GITHUB_*`, `AWS_*` and similar are dropped from project input in both steps. The result lists the rejected names, never their values. |
| Runtime | `runtimeEnvFor` takes the project's values (from the user's keychain item for this project) for any non-reserved name. Somnia's own `NODE_ENV=production` and `HOST=127.0.0.1` always win. `PORT`, and `ORIGIN` for SvelteKit, are derived by the deploy step from the target and reported as `missing` until it supplies them. |
| Client exposure | A public prefixed name that also contains `SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE`, `CREDENTIAL` or `API_KEY` sets `secretInPublicEnv`: it would end up in the browser bundle. |
| Upload | `isUploadExcluded` removes `.env`, `.env.*` (not the `.example` variants), `.git`, `.ssh`, private keys and certificates, `.npmrc`, `.htpasswd` and `somnia.template.json` from every artifact. |

## Artifact check

`verifyArtifactListing(plan, paths)` takes the file listing of a finished build and checks it against the plan before a manifest is made: static output needs its `index.html`, node output needs its entry file, unsafe paths fail, excluded files are dropped and reported, and the Next standalone copies are checked. It reuses the error codes of the native collector (`distMissing`, `noIndex`, `noEntry`, `noPackage`, `unsafePath`) so the UI text is shared.

## Dev preview flags

Every dev server is told to bind to loopback only with the port Somnia chose: Vite and SvelteKit `--host 127.0.0.1 --port N --strictPort`, Astro and Nuxt `--host 127.0.0.1 --port N`, Next `-H 127.0.0.1 -p N`. A plain node server has no dev preview in this version.

## Tests

`phase1/src/lib/frameworks/adapters.test.ts` with 24 fixture folders in `phase1/src/lib/frameworks/fixtures/adapters/` (one per row of the matrix plus the blocker and hostile cases). Run with `npx tsx --test src/lib/frameworks/adapters.test.ts`, or through `npm run test:core`.

## Status and limits

- Pure TypeScript layer. The native collector (`deploy_node_build_collect`) and the Rust runner still decide at run time; the plan mirrors their rules and is not yet consumed by them.
- Nothing here was run against a real framework build. The rules come from the frameworks' documented output layouts and need a real-build pass with the template matrix script before release.
- Monorepos and workspaces (project root not at the folder root), Yarn, pnpm and Bun lockfiles, Deno, Bun runtime, Remix, Angular, Qwik and Vite SSR are not classified.
