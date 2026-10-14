# Somnia user guide

The user guide explains how to use Somnia. It is the front door for people who use the app. Technical design, architecture and decision records stay in the rest of [`docs/`](../README.md) and are linked from here.

## Status labels

Every page states what is shipped and what is not. We use three labels and nothing else.

| Label | Meaning |
| --- | --- |
| **Stable** | In the latest stable release on [GitHub Releases](https://github.com/philppplik/somnia/releases). |
| **Pre-release** | In an alpha or beta of the current line. Can change or break. Not in the latest stable. |
| **In development** | Concept or branch only. Do not rely on it. |

A passing test, a merged branch or a mock-server run does not move a feature to Stable. Only a published release does.

## Pages

| Start here | Page |
| --- | --- |
| Install, open a project, first save | [Quickstart](quickstart.md) |
| What each studio does and where its docs are | [Studios](studios.md) |
| The primary button next to Account | [Header hero actions](hero-actions.md) |
| Publish a site over SSH or FTP | [Deploy](deploy.md) |
| React, Vue, Svelte, Next, Astro and more | [Frameworks](frameworks.md) |
| `somnia run`, background runs, exit codes | [Command line](cli.md) |
| Add commands, panels and themes | [Extensions](extensions.md) |
| Where options live | [Settings](settings.md) |
| Run AI on your own machine | [Local AI](local-ai.md) |
| Something broke | [Troubleshooting](troubleshooting.md) |
| Quick answers | [FAQ](faq.md) |
| What exists in the editor | [Features](features.md) |
| AI and collaboration | [AI and collaboration](ai-and-collaboration.md) |
| Versions and roadmap | [Releases](releases.md) |

## Rules for writing docs

See [DOCS-STYLE.md](../DOCS-STYLE.md). The short version: English, one home per topic, link instead of copy, state the status, no real keys, hosts or personal data in examples.
