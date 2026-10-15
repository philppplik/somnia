# Empty-panel studio draft starters

Two small draft chips in the existing empty state, matched to the actual document studio (including specialized media visible in Code). Clicking fills the composer and focuses it only. Explicit Send remains required, with existing Ollama/local-native gates and exact review before edits. Chips disappear after conversation starts. No new toolbar, menus or automatic model/tool invocation.

Seven unit tests pass (bounded studio draft copy plus context integration) and one browser test passes Light/Dark actual panel: chip populates paragraph draft, no proposal exists until Send, chips disappear after Send. Final screenshots inspected for readability and wrapping. No new dependencies/cloud/permission changes. Depends on visible contextaf8a0868c and selected-text UI prerequisites; patch only includes this slice.
