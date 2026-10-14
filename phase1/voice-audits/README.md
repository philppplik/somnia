# Reviewed helper audit inputs

No target audits are approved in this checkout. A manual helper-asset CI run fails closed until the reviewed target file exists. Do not add placeholder reviewed=true records to make CI green.

Initial filenames: linux-x86_64.json and windows-x86_64.json. Required build-script schema: schemaVersion 1, reviewed true, exact targetOS/targetArch, engineRevision pinned by the build script, nonempty components array. Each component needs name, allowlisted SPDX license and full notice. The inventory must cover actual static and dynamic linkage on that target, not only upstream labels. Review provenance and linkage evidence belong alongside each eventual record. Non-allowlisted licenses need a separate decision. macOS is deferred to beta/stable.

The review artifact has no download URL or signature until real hosted assets/signing exist. No artifact is bundled into the app. Build output stays in dist-voice/helper. Isolation and orphan-cleanup gates remain false until device CI proves them.
