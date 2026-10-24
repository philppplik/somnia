# Metadata pending validation (BP)

Test-only BO follow-up, no production changes/deps/inference. Dedicated fixture
pending exact-tag metadata held until release; screenshot opens each theme before
starting pending inspect, rather than changing theme on an active screenshot.
Both light/dark390px show disabled Checking model metadata in actual exact9 row.

Regression: pending inspect -> explicit Refresh -> fresh snapshot -> release old
metadata. Old embedding capability not published; current Inspect enabled. One
browser test passes both themes. Existing BO test not altered/weakened. Pixels
inspected, no new source/model/quality claim or full native/shell E2E. No production
validation rerun needed for test/docs-only slice. Parent owns integration CI.

Roadmap-Delta: BO dark visual gap and stale-refresh completion regression closed
at fixture level, real daemon/packaged acceptance still open.
