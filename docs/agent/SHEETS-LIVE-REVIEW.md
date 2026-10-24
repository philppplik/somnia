# Sheets local sidepanel reviewed cell wiring

Installs createSheetsCellPort for the pinned active Sheets session, advertises only inspect/propose in the studio manifest. Active media/run must use Ollama; no cloud fallback. Host rejects range selections, active cell editing, moved/replaced sessions and shared workbooks. MCP Sheets source is explicitly unavailable in this slice because external review/undo lifecycle is not yet connected.

Proposal callback captures a private one-use capability. Public chat preview contains only file/address/before/after, never token or raw owner state. Accept consumes capability before native entry, uses reviewed token/old cell and validates one undoable receipt. Undo consumes owned receipt and passes exact owner token; newer edits/reopen refuse. Permission-denied undo preserves receipt; unknown outcomes never replay. Clear during apply cannot resurrect undo capability. Pending reviews block new turns and are revoked on stop/error/reset. Native worker/UI mutation notifications refresh displayed cell/history; dirty state is shared with canvas so save-copy stays available. No autosave/disk write.

64 focused JS tests pass (selected-cell/native state, one-use transactions, native run/document core/context/chat, Sheets session/live read/receipts). Actual AgentPanel browser fixture passes Light/Dark preview/accept/undo, pixels inspected. Fixture uses synthetic core and no worker/model/network, not full live workbook proof. Rust/WASM/desktop remain CI-only.

Known pre-existing check failures retained: AgentSettings test still expects old embedded consent/select controls despite panel declutter. Targeted TS command fails across existing modules; touched panelBridge import was corrected to coreTypes, remaining panelBridge AgentContext mismatch originates in existing types/coreTypes duplication. No full typecheck success claimed. No tests deleted or weakened; successful owner apply fixture now includes reviewed token.

Depends on Sheets native-state snapshot5d7543029. Patch only includes this follow-up, not its prerequisite.
