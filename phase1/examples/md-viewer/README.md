# Markdown Viewer (example)

Minimal open-offer extension: offers validated `text` files in the Smart Open
choose-handler dialog (read-only preview, never default) and reads the picked
file through `project.readOfferFile(token)`. Used by the open-router package
end-to-end test (tests/fixtures/router-dialog.tsx, mode=package).

Scope boundary: despite the "Viewer" name and the `preview` capability label,
the handler only demonstrates the file handoff and read access (it counts
characters and headings and reports them). It does not render Markdown.
