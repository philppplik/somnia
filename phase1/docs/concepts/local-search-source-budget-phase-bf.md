# Selected source preflight (BF)

Pure raw and NFC/LF normalized chunk review before model metadata/inference. Uses
existing exact chunk validator, not a new lenient path. Shows aggregate raw UTF-8
bytes and validated normalized chunks; invalid scope has zero accepted chunks,
not a partial index. Byte/source overflows stop before expensive chunking; result
memoized by selected-content signature, so query typing doesn't rechunk documents.
Build disabled and guarded when invalid/empty; five-locale safe selection hint.
No truncation, hash/network/filesystem reads or source-scope expansion. Still uses
session's independent validation and fresh capture before ready commit.

Two unit cases (exact/overflow UTF-8, empty, duplicate/invalid/count, NFC/LF) and
524 Agent/provider tests pass. Two added browser cases cover oversized selection
zero metadata/embed, corrected source explicit build, all five locales; three
existing AZ tests retained/pass. Light/dark390px feedback pixels inspected.
Counters aren't token/model fit or secret classification. Native/full desktop E2E
and actual embedding not run. tsc inherited Slides missing; DS/Commands/Inventory/
Layers pass with inherited compiler/87ignored/4stale warnings. No new deps/spend.

Roadmap-Delta: invalid source selection actionable before any model-build I/O;
unchanged open-text/search-only/memory-only scope and independent runtime gates.
