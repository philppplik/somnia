# DP: search state and citation flow audit

Status: **In development**. Search-only scope unchanged, no new native/model execution.

Audit found that Cancel/clear returned to the same generic empty message as an untouched session. The panel now separately announces explicit clearing in all five locales: owned work cancelled, memory index discarded, shared daemon may continue, review sources/consent before rebuilding. Clear's existing abort/discard/consent behavior is unchanged. The announcement resets on source/owner change or a new build/clear, not persisted. Build progress count is an atomic polite status, alongside existing aria-busy and progressbar semantics.

Five browser tests each run390px light and dark: empty eligible scope/no transport/disabled build; explicit consent and held production adapter build; busy/progress value; keyboard Enter Cancel; unbusy localized clear status and consent reset; fresh ready then deleted-model query refusal with localized polite error and zero query embedding; explicit rebuild and literal citation reader focus; accepted exact raw span request closes the global dialog and targets the source in app state. The last step proves app-state jump request, not actual packaged editor focus/selection.

Existing DH full setup/build/subset/citation/close light/dark and locale key/placeholder parity pass. Static timing audit remains sleep/force/skip-free. New spec is included by the consolidated DM wildcard automatically; total discovery becomes55, but full55-test budget was not rerun in this slice.

Ten narrow screenshots were inspected in a labelled contact sheet: cleared status, source consent and query controls remain readable in all five locales/light/dark without horizontal clipping. Earlier authoring syntax error was fixed before final validation; no failed run is claimed as passing. Actual native screen-reader speech, WCAG audit, editor selection, model quality/CSP/real cancellation remain open acceptance gates. No dependency/budget changes, generated answers, cloud or persistence.
