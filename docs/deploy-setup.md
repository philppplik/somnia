# First-time publish setup

The Publish form saves metadata only. A new target then enters the setup wizard:

1. Create an ed25519 key in the OS credential store.
2. Probe the host key and show the existing human trust dialog. No login password is sent until a pin exists.
3. Display the full D2 bootstrap script. Copy it into the provider console, or review it and run from Somnia with a temporary SSH login and sudo password. The login is separate from the final unprivileged `somnia` deploy user. Somnia first checks the same staged script with `--dry-run` using the selected root/sudo mode. This elevated check performs reads only and must pass before apply; unknown socket ownership or an unrelated web server stops setup. After a successful run the saved deploy user becomes `somnia`.
4. Show A/AAAA guidance and DNS results. A mismatch, missing www, stale AAAA or failed resolver stays visibly unverified. Publishing anyway still opens the normal file-list confirmation dialog.

Automatic setup supports password SSH authentication on the privileged login. Hosts that disable password authentication use the displayed script in their provider console. Somnia never falls back to trusting a changed host key.

Passwords are uncontrolled form inputs, cleared on submit and unmount, passed straight to typed IPC, wrapped in `Zeroizing` on Rust entry, and never passed through CommandSpecs, activity logs, target metadata or diagnostic messages. The D2 transport redacts both passwords from server output. Only parsed bootstrap markers return to the renderer.

`deploy_bootstrap_script`, `deploy_bootstrap_run`, and `deploy_dns_check` are trusted-main-window commands with manifest and ACL entries. `deploy.setup.open`, `deploy.key.public`, and `deploy.cancel` are human-only UI CommandSpecs. The last two use the D7 `deploy_key_public` and `deploy_cancel` adapters. `deploy_live_release` supplies the current-symlink marker; failures leave the badge unset rather than guessing.

DNS uses the saved server address resolved through the system resolver as the expected IP set, and queries apex and www through both the system and Cloudflare DoH. This does not discover extra server public interfaces, verify NAT routing, or probe firewall reachability. Port 80 and 443 instructions are deliberately instructions only.

Development preview: run Vite in `phase1/`, open `/d5-preview.html`. This is a mocked component preview, not a deploy route, and does not contact any server. `npx playwright test -c d5-playwright.config.ts` covers its light/dark setup and DNS screens. No real-host testing, bootstrap, or GitHub Actions is used.
