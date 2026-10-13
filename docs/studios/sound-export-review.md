# Sound output review

Export audio opens a read-only review of processed WAV duration, sample rate, channels and committed region edits. Selection alone changes no range. Original audition is distinguished and can switch to edited audio. Final submit uses existing `sound.export`. Queued or processing output is blocked in the UI and save service. Clip switches invalidate the review. Desktop retains native picker/atomic write; browser says Download started, not Saved. Cancellation/failure retain edits. Keyboard close restores opener focus.

Roadmap-Delta: reviewed WAV export promoted to header; recording, resampling and additional codecs remain separate.
