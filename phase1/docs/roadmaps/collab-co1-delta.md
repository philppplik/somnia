# CO1 delta to concept v3.2

Outcome: Collab Office Step 1 (infrastructure) is DONE per concept v3.2 §6 - all six items
implemented, unit-tested and E2E-covered (158/158). Deviations from the concept text:

| Item | Concept | Delivered | Delta |
|---|---|---|---|
| Blob protocol | chunking for >1 MiB files | `MSG_SYNC_CHUNK=8`, 1 MiB parts, reassembly guards (16 parts / 8 batches / 60 s stale), envelope E2E | none |
| Large PPTX | PPTX as blob type | `pptx` added to the blob whitelist | none |
| Shared key mask | mask link after share | already shipped (CA2); doc note only | docs-only |
| Heartbeat | ping/pong with dead-peer detection | `MSG_PING/PONG=6/7`, 15 s ping, 45 s dead, close 4005 then reconnect; test-unref'd timer | none |
| Build handshake | compare `app` version in awareness | `APP_BUILD` from `__APP_RELEASE__`, awareness field `app`, `buildMismatches()` | gate UI follows in CO2 |
| Windows testing | test plan | `docs/collab-windows-test-plan.md` | none |

Deferred to CO2 (tracked there): build-mismatch gate UI, presence ranges, per-person undo,
format/style sync, editSheet structural sync.
