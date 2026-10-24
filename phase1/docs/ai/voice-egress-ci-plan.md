# Native voice release confinement checks

Status: required, not yet proven. Default-off. This plan is not a passing CI receipt. Model/helper downloads are allowed only in explicit installation tests; inference tests run after provisioning with no network needed.

## Linux

Build audited pinned helper, provision verified model, launch actual desktop voice path in a separate network namespace with no interfaces except loopback and deny all egress including loopback in that namespace. Record attempted sockets via syscall tracing and assert no successful or attempted inference network calls. Run real DE/EN fixtures and a deliberately hostile socket-attempt helper only in an isolated CI harness. A marker file or successful exit is not proof of no network. Test both IPv4/IPv6, DNS, UDP and child-process attempts. The real runtime must apply a supported fail-closed sandbox before release-ready manifest is admitted; namespace CI alone does not enforce users' devices.

Kill parent abruptly during transcription (not orderly cancellation); verify helper PID exits and no descendants remain. PR_SET_PDEATHSIG protects the direct child on Linux, not arbitrary grandchildren. The pinned helper must not spawn unowned descendants; otherwise implement process-tree supervisor before clearing gate. Test thread exit and parent death between fork/pre_exec. Start the app again, acquire exclusive data lock and verify stale private jobs/staging are removed without killing persisted PIDs or touching model/installed helper. A second app instance must fail ownership before cleaning active files.

## Windows

Build audited pinned helper. Run inference under the intended deny-network OS sandbox/firewall test boundary and capture network attempts (including child processes, IPv4/IPv6 and DNS). A general machine firewall passing test does not demonstrate production helper confinement. Prove production policy creation, application and removal are scoped to the helper and fail closed; do not silently alter system-wide firewall settings.

Hard-kill the parent during transcription, verify kill-on-close Job Object terminates the helper; cover assignment failure and the spawn-to-assignment window before treating process cleanup as proven. Test child/grandchild behavior and handle inheritance. Current post-spawn assignment still needs CI validation and a suspended-start or supervisor solution if the window can leak work. Restart cleanup and file lock tests match Linux. macOS deferred to beta/stable.

## Artifact and install matrix

No approved release record exists yet. Installer tests inject a fixture manifest only in dedicated native test builds, never runtime URL input. Assert wrong target/revision/license/gates/size/hash/HTTP URL rejected; cancellation/disk-full/redirect escape do not publish; repair failure preserves old helper; restart recovers backup; lookup rehashes before use; remove during voice job fails. Verify notices hash and size separately. Actual CI output fills hashes; synthetic fixtures are not distributable release records. Signing remains conditional on a real signing path.

Required evidence per target: workflow run and source revision, actual bytes/hash, complete reviewed license inventory and linkage, real inference results, OS policy evidence, parent-crash and cleanup logs. Only after review may isolationProven/orphanCleanupProven/releaseReady be true.
