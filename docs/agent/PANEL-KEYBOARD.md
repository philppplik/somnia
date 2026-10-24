# Panel keyboard access

Native DOM tab order retained: New chat, configuration, collapse, review/draft controls, composer/send. No positive tabindex or unsolicited focus jump when proposals arrive. Visible focus rings for panel buttons and summary elements. Polite status announces proposal readiness and final decision; fixed classified errors retain assertive status and are also announced in existing polite status. Local help is a note.

Escape within idle panel with exactly one pending proposal asks browser-native confirmation naming its file. Dismiss leaves proposal intact; confirm calls normal reject and restores composer focus. Does not select one of multiple pending proposals, dismiss file access approval, stop busy work or auto-apply. Browser-native confirmation has standard keyboard/modal behavior.

Two browser tests pass: Light/Dark proposal announcements, focused accept, dismiss/confirm Escape and focus return; ordinary header Tab order and assertive error announcement. Screenshots inspected for both themes, focus ring visible. Synthetic core fixtures, not native inference proof. Dependscc48a6863 local error UI and prior slices. No new deps/permissions/cloud/auto-retry.
