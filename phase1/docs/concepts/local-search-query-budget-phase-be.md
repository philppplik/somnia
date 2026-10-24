# Query UTF-8 preflight (BE)

Shared pure query validation in session and panel: 4096 UTF-8 bytes, nonempty,
existing control/invalid-Unicode guard. Five-locale bytes/limit/invalid feedback,
aria-invalid, Enter and button disabled before query inference. maxLength remains
4096 UTF-16 units but isn't represented as the UTF-8 budget. Correction clears old
query error/results without discarding unchanged ready vectors. No truncation,
normalization, provider/model/source changes or new dependencies.

Two unit cases (ASCII/BMP/supplementary boundary/control/empty) and 522 Agent/provider
suite pass; two added browser cases (oversized multibyte no embed, correction ready,
five locales) and three existing BB pass. Light/dark390px limit-state pixels
inspected. No native/full desktop E2E or actual embedding traffic. Unfiltered tsc
only inherited generated Slides missing; DS/commands/inventory/layers pass with
inherited compiler/ignored/stale warnings. Budget is request acceptance only, not
an embedding-context fit/token or relevance guarantee.

Roadmap-Delta: actionable byte validation before search rather than generic failure;
search-only memory scope unchanged, no new inference/download/default side effect.
