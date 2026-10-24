# Video output review

Export video opens the existing controls for the whole timeline, never just selected clips/playhead. Format choices follow encoder probes. Audible output without AAC/Opus requires an explicit silent-output check; timeline/format changes invalidate it. Final submit dispatches existing `video.export.start`. Missing sources, empty/loading/error timelines or unavailable encoders block output. Duplicate starts are rejected in the session. Progress uses existing cancel/report state. Closing does not cancel, and timeline switches invalidate the reviewed target. Browser completion says Download started and shows actual codecs, never a native save path.

Roadmap-Delta: whole-timeline header review/progress; range export, presets and native destination picking remain separate.
