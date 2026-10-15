# Local error help

Preserves typed error detail from AgentSession through panelBridge/core/chat. Local panel adds fixed help for unreachable Ollama, missing exact model and unsupported tools. No matching on raw provider prose. Unclassified/unreconciled errors retain existing handling, never receive a misleading missing-model suggestion. Task inventory preflight distinguishes unavailable inventory from verified missing model and classifies before displaying.

Existing manual Retry remains manual only; no new auto-retry/download/cloud fallback. Help directs the user to start Ollama or inspect exact installed model in Settings > AI > Local Models.37 unit tests pass across help/chat/errors/verified provider/native mode.1 actual panel browser test covers network/model in Light/Dark, four screenshots inspected. Synthetic fixture failures, not actual daemon outage. Depends6123a9bf6 prior UI history; latest patch only. No new deps/runtime permissions.
