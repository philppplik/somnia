# File permission base pin

File read/write and registry context propose now capture the selected file text (or absence) before async authorization and compare a fresh host read after authorization/permission callbacks. Changed text, created/deleted file, mutable host map or replaced host map fail closed. No late content is disclosed and no stale proposal is staged. Unchanged authorized reads/writes remain available.

Regression reproduced before fix:2/3 tests failed. After fix43 tests pass across new boundary/session/security/editor/MCP/command suites. No new tool, automatic write, UI, dependency, cloud or spending. Text equality is not an editor revision/identity receipt and cannot detect equal-text ABA; actual reviewed apply must retain its own editor identity/revision checks.
