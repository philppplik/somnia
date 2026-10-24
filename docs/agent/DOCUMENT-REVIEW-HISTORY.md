# Document decision history

Collapsed Earlier decisions list scoped to current project generation and document path. Session-local memory only: at most20 documents,12 decisions each. Survives New chat within current session, not application reload. Records only target label, file, id, final accepted/rejected/undone state and decision time after successful host action. No prompt, before/after text, engine token/receipt, callback or cloud storage. Repeated undo updates the decision instead of creating a second apply history.

Pure display with no action controls and no insertion into model conversation. Previous reviews cannot be re-applied from this list. This is an audit summary, not restorable document version/history. Same-path reopen in a project shares the path summary; it does not imply same native owner or permit undo.

11 unit tests pass with existing chat suite and one actual panel Light/Dark browser test covers accept/undo, New chat retention, reject, and zero history action buttons. Final screenshots inspected. Browser core synthetic, native semantics covered by earlier port slices. Depends1a5276787 chips plus prior UI slices; latest patch only. No dependencies/cloud/automatic effects.
