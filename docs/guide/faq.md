# FAQ

## Is Somnia free and open source?

The repository is MIT licensed. Optional AI providers, hosting or third-party services can charge separately. A pricing mockup is not a working subscription or checkout.

## Do I need an account?

Not for local editing. AI providers, GitHub access and collaboration have separate optional setup. Do not assume that connecting an account authorizes sharing all project content.

## Which version should I install?

Use the stable release for the checked stable scope and an alpha only for testing newer work. On this wiki's 13 October 2026 baseline, those are v12.0.1 and v12.2.0-alpha.7. See [Quickstart](quickstart.md) and the actual release assets.

## The app starts with a black window. What now?

If you installed v12.0.0, update to the v12.0.1 hotfix. Its notes explain the CSP/schema startup failure. A different build may have a different cause; include the exact release and OS in a bug report rather than assuming the same fix.

## Why does Windows or macOS warn about the installer?

The documented direct installers are unsigned on Windows and ad-hoc signed/not notarized on macOS. Verify the release source and checksum. A warning does not prove malware, and a matching hash does not prove safety. Do not disable security globally.

## Why is there no macOS alpha.7 installer?

That release intentionally shipped Windows and Linux only. The macOS menu mirror has unit coverage, not a macOS desktop test. Do not use an unrelated older DMG as proof of alpha.7 support.

## Does the preview run Next.js, Nuxt or other app frameworks?

Opening JSX/TSX is source editing, not a framework compiler. The checked alpha live view loads local resources and relative ES module chains; integrated framework workflows are in development. See [Frameworks](frameworks.md).

## Why did a linked file not reload?

In the checked alpha, unopened text files changed on disk do not trigger automatic reload. Module import cycles are also unsupported. Check the resource banner and that paths stay inside the project root.

## Are media edits automatically saved into my project?

No blanket claim applies. Media studios commonly save/export a copy, and creating a blank tab is in-memory creation. Video export writes the rendered video, not a durable edit-list project. Inspect the output before closing.

## Are Store extensions verified and safe?

A catalog hash match is not publisher authentication or a security audit. Runtime, restricted-mode and permission support varies by SDK/build. See [Extensions](extensions.md).

## Can Vibespace control my computer?

No. The checked alpha includes computer-use policy/consent preparation, but no working OS screen/mouse/clipboard adapter.

## Can I share a project read-only?

The documented encrypted collaboration session does not enforce a read-only viewer security role. Everyone with the key can read/copy/edit shared text. Treat the invite link as a secret. See [Settings > AI](settings.md#ai).

## Can I deploy through SSH, Node or FTP/FTPS today?

This wiki marks those new integrated targets in development, not released in the checked stable/alpha baseline. Export and use your existing hosting tools until a release documents supported deployment.

## How do I report a problem?

Use the [repository Issues](https://github.com/philppplik/somnia/issues). Include release, OS, reproducible steps and a small non-private example. Never include credentials, API keys, private documents or collaboration invite keys. Public issues are not a private security-report channel.