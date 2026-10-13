# Deploy (Publish)

Status: **In development.** Publishing is not part of the latest stable release. Check the release notes of the pre-release you run before you rely on it. A mock-server test or a passing build is not proof that a real server works.

Publish uploads the built files of a web project to a server you own and lets you roll back. It is desktop only. The web build does not offer it.

## Targets

| Target | What it does | Technical doc |
| --- | --- | --- |
| SSH / SFTP, static site | Uploads a release, switches to it, health-checks it | [Deploy core](../deploy/core.md), [Publish panel](../publish-panel.md) |
| SSH, Node app | Deploys a prebuilt Node bundle and its runtime | [Node runtime](../deploy/runtime.md) |
| FTP / FTPS shared hosting | Uploads files to a plain hosting plan | [FTP](../deploy/ftp.md) |

## How a publish works

1. Open **Publish** (header button, **Project > Publish...**, command `deploy.open`, or **Ctrl+Shift+U**).
2. Add a server. The form saves only metadata. No password is stored.
3. First time only: the setup wizard creates an ed25519 key in the OS credential store, shows the host key for you to trust, and shows a bootstrap script. You can run the script yourself in your provider console, or let Somnia run it once with a temporary admin login. Details: [First-time setup](../deploy-setup.md).
4. Check DNS. A mismatch stays visibly unverified. You can still publish.
5. Somnia shows the list of files to be uploaded. You confirm every publish and every rollback.
6. Progress shows connect, check, upload, switch, health.
7. **Rollback** lists earlier releases.

Commands and their rules: [Deploy commands](../deploy-commands.md).

## Safety rules

- A changed host key is never trusted automatically.
- Passwords are used once and not saved, logged or sent anywhere but the server.
- Files such as `.git`, `.ssh`, `.env*` and private keys are rejected from uploads.
- The server user is an unprivileged `somnia` user after setup.

## Cost

A server or hosting plan can cost money. Somnia's MIT license does not make hosting free.

## Without Publish

Export the project (ZIP, folder or single HTML) and upload it with your own tools. Check local links and asset paths in the export first.
