# Windows checklist (per release)

Installer and first run
- Install `x64-setup.exe` (expect a SmartScreen warning, it is unsigned). Also try the `.msi`.
- App starts, version in the status bar matches the release.
- Uninstall leaves no running process.

Files and projects
- Open a folder project, edit, save, reopen. Open a ZIP project.
- Open DOCX, XLSX, PPTX, PDF, an audio file and an image from the file dialog.
- Drag and drop a file onto the window.

Studios
- Switch Code, Documents, Slides, Sheets, Sound with the pills and Ctrl+1..5.
- Save a copy in each Studio and open the copy in another program.

Other
- WebView2 renders the UI and WASM workers load (no blank panels).
- High DPI and dark mode look right.
- Settings, GitHub login and the sync folder still work.

Report what was checked and what was not.
