# Panel visible context status

Display-only status now leads with active visible document, then Local Ollama/provider and Selected model. If run target is empty, it may show current native studio name only when that document remains in media catalog. Does not silently change run target or grant context disclosure. Selected configuration is not a claim of successful inference.

Ollama /ps is read through existing local runtime transport on provider/model/settings/activity transitions. Status labels it `Ollama loaded (last check)`, never falsely claims these weights are actively generating or verified local. Unavailable/malformed result is Unknown, confirmed empty list None. No polling, buttons, installs or execution changes. Native Slides state subscription does not open/load the session.

17 unit tests pass across projection/local runtime/local choice.1 actual panel browser test passes Light/Dark: review.docx, Selected local-demo:7b, loaded Unknown, no combobox/new controls. Screenshot pixels inspected for both themes and wrapped status. Synthetic selected model, no real local daemon connected in fixture. Depends b6f1a4bcc selected text UI; latest patch only.
