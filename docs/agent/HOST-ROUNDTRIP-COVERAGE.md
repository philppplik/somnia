# Native host roundtrip coverage

Fetched179bad675 contains Docs/Slides/Sheets live wiring. New nativeHostRoundtrip suite exercises Docs actual selectedTextPanelPort -> TextReviewTransactions -> real JS D45 session with synthetic engine, and Sheets actual SheetsEngine protocol -> native snapshot -> SheetsReviewedTransactions with synthetic worker. Both prove Proposal -> Accept -> Undo and that proposal alone does not mutate.

26 tests pass,1 skipped across roundtrip, selected hosts, one-use transaction lifecycles and existing Docs/Slides acceptance tests. Slides full-native E2E explicitly skipped CI-only; Docs and Sheets full-native variants are equally CI-only. No full native/desktop inference or render proof claimed. Existing synthetic Slides receipt tests still run and were not weakened. No new dependencies or local native build.
