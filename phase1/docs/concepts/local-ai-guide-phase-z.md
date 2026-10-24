# Local AI guide generation and German translation, Phase Z

The English and German Markdown files in docs/ai are the only authored guide
sources. The prior checked-in JSON copy is removed. A deterministic, fail-closed
Node generator emits an ignored TypeScript module with both exact texts. App
Vite config and isolated DS Vite startup generate it, as do build/dev/typecheck
and core-test lifecycle scripts. Direct Node tests must run generate:local-guide
first, or use test:local-guide. No generated guide is committed.

German help selects the German complete guide and section headings. Other locales
keep the explicit English fallback. The full German translation preserves setup,
model management, locality/routing, context, tools, comparison, privacy, voice and
troubleshooting boundaries. The guides link to each other. UI keeps literal text,
not executable Markdown/HTML or network links.

Drift checks assert the exact ordered English/German heading pair list at every
heading depth, so new/removed/reordered/renamed sections require review. This is
structural drift detection, not a semantic translation check for changed prose.
Separate tests compare both generated runtime texts with the sources and exercise
deterministic regeneration into a temporary directory. A narrow production Vite
library build is compared byte-for-byte with both current source files; it does
not imply that the full application builds.

Local evidence: five generator/guide tests pass, four isolated real-component
browser tests pass, German 390px full-guide pixels inspected for wrapping/scroll.
Deleted generated output before Vite startup and narrow production build to check
fresh generation. DS, command manifest/UI inventory and layers pass, with existing
layers compiler/baseline warnings. Existing pinned three and @types/three installed
locally without dependency/lock changes. Unfiltered npm run typecheck has one
remaining diagnostic: missing generated slides-engine/pkg/somnia_slides.js.
Full npm run build stops at missing craft/pkg/somnia_craft.js. No bridge stubs,
WASM/cargo or native/full desktop E2E execution; those remain CI work.

Roadmap-Delta: structural drift checks cannot certify prose translation freshness;
review German text when English paragraphs change. Translate remaining full-guide
locales and run native/package acceptance when generated bridge artifacts exist.
