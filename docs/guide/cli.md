# Command line

Status: **Pre-release** (12.2 line). Windows and Linux binaries. The CLI is not in the latest stable.

`somnia` runs an agent task against a project from a terminal or a script. It works on a local task branch, can make one local commit, and never uses the network on its own and never pushes.

```
somnia run "<task>" [options]     run a task
somnia attach <task-id>           follow a background run
somnia status <task-id>           print a run's summary
somnia cancel <task-id>           ask a background run to stop
```

Common options: `--yes` (commit locally), `--json` (machine output), `--detach` (background), `--allow-root DIR` (limit scope), `--max-tokens` and `--max-cost` (budgets).

Exit codes: `0` done, `1` failed, `2` needs you (a question, a review, or a guard blocked the commit).

Example:

```
somnia run "add a pricing section to index.html" --yes --json
```

A run starts only on a clean git working tree with at least one commit. Your starting commit is kept at `refs/somnia/safety/<task-id>`.

The agent engine needs a provider and model (`SOMNIA_ENGINE_PROVIDER`, `SOMNIA_ENGINE_MODEL`) and, for cloud providers, an API key in the environment plus `SOMNIA_ENGINE_CLOUD_CONSENT=1`. Use placeholders in scripts and keep real keys out of the repository.

Full reference: [usage](../cli/usage.md), [troubleshooting](../cli/troubleshooting.md), [security](../cli/security.md), [protocol](../cli/protocol.md), [TUI protocol](../cli/TUI-PROTOCOL.md), [release notes](../cli/RELEASE-NOTES.md). Related: [Vibe Space CLI ownership](../vibespace/cli-ownership.md).
