# Local AI help, Phase Y

AI settings expose a localized FAQ dialog and the real command palette's
`help.localAI` command selects AI / local and opens the same dialog. This is
UI state only, not inference, saved configuration, a model download or consent.
Four answers cover local stores, removing models, the offline switch and the
default-off optional voice helper. All questions, answers and actions support
en/de/es/fr/pt-BR; the complete source guide is explicitly English.

Guide buttons open bundled literal text from docs/ai/LOCAL-AI-IN-SOMNIA.md,
with topic sections and a full-guide view. No external URL or remote fetch is
needed. A test compares the bundle exactly with the source so future guide
changes must update the bundle. No markdown HTML is executed. Dialog scroll,
wrapped actions, Escape close, return focus and guide focus use existing DS
primitives. No dependency or release gate changed.

Evidence: 12 focused Node tests, 416 agent/provider Node tests, 3 isolated browser
tests using the real FAQ and command palette; all passed locally. Browser fixture
covers five locales, topic/full guide, no external requests while opening help,
close/focus and German 1120/390 layouts. Pixel inspection caught a long section
action clipping at 390; wrapping was fixed and inspected again. DS, generated
commands, UI inventory and layers checks pass; layers retains the existing TS
compiler warning/ignored baseline. Full tsc remains red on inherited Studio3D /
missing three modules and other pre-existing errors; no changed-path diagnostic.
Native/full application CI and real desktop settings navigation remain unrun.

Roadmap-Delta: Translate the complete guide; replace the duplicate bundle with a
build-time loader if tooling permits; add native full-settings/palette E2E after
the existing app/CI gates are green. No new background checks or telemetry.
