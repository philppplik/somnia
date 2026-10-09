# Using OpenRouter and Ollama in Somnia Agent

How to set up and use the two providers, and what the common errors mean. Internals are in [openrouter-provider.md](openrouter-provider.md) and [ollama-provider.md](ollama-provider.md).

Somnia Agent is alpha. The behaviour below is what the code does; real runs against a live OpenRouter account or a live Ollama daemon from the packaged app are not covered by automated tests.

## Which one to pick

| | Ollama | OpenRouter |
|---|---|---|
| Where the model runs | On your computer | OpenRouter and the model provider it routes to |
| Account / key | None | OpenRouter API key |
| Cloud consent needed | No | Yes |
| Cost | Your hardware | Per OpenRouter's pricing for the model |
| Needs tool support | Yes | Yes |

Both need a model that supports tool calls. The agent uses tools to read files and propose changes.

## Set up Ollama

1. Install and start Ollama and pull a model that supports tools (for example `ollama pull <model>`). Somnia does not install models.
2. In Somnia open Settings > AI > Providers. Choose **Ollama (local verification required)**.
3. Type the model name exactly as `ollama list` shows it, or press **Refresh models** and pick one from the suggestions. Refresh reads the list from your local daemon.
4. Press **Test local connection**. It checks that the daemon answers on this computer. It does not test the model.
5. Save the configuration. Saving starts a new AI session; your visible chat stays.

Ollama is only used at `http://127.0.0.1:11434`. There is no setting for another address or port. Remote Ollama servers are not selectable in the app. The Connections page also has an Ollama box that checks reachability.

Before every request Somnia asks the daemon about the model and refuses to run unless it is verified local. A model with a `-cloud` / `:cloud` tag, or one the daemon forwards to another host, is blocked with the message "Native studio mode requires a verified local Ollama model." No consent is asked in that case, the request is simply not sent. Ollama needs no cloud consent because verified-local models send nothing off your machine.

## Set up OpenRouter

1. Create an API key in your OpenRouter account.
2. Open Settings > AI > Providers and choose **OpenRouter (cloud)**.
3. Open the AI privacy settings and turn on **Allow cloud AI**. Without it, every OpenRouter request, including the key test and the model refresh, is refused. Withdrawing consent later cancels running requests.
4. Paste the key and press **Test and save key**. The key is checked against OpenRouter and saved only if the check passes. In the desktop app it goes to the operating system's credential store and is not shown again. The field then offers "Enter a replacement key" and **Delete key**. In a browser preview the key is kept only until you reload the page.
5. Enter a model ID in OpenRouter's `provider/model` form, or press **Refresh models** and pick one. A model in the list is not a promise that it supports tools, that your account can use it, or that you have credit.
6. Save the configuration.

The key test says "Key verified". It does not guarantee model access or credit.

## Use it

1. Open the Somnia Agent panel and type your request.
2. For OpenRouter, tick the disclosure checkbox in the panel for this run. It sends the active document and selection to the provider. Without it the run stops with "Confirm disclosure to the selected provider before sending document context." The checkbox is not shown for Ollama.
3. Unless "active file" access is on, approve the file read in the approval prompt. You can allow it once or for the session.
4. The agent answers and may propose a change. Review the diff. A change is applied to the editor only when you accept it, and it is not saved to disk until you save. You can undo an applied AI change.

The agent edits Code and Photo documents through this path. Each turn is bounded: 16 steps, 48 tool calls, 8192 output tokens, 180 seconds, 1 MiB of context (session defaults). Custom prompts from Settings > AI (up to 20, 16,000 bytes together) are added to every request for either provider.

If a turn fails, the panel keeps your prompt and any partial text, marks it incomplete, and applies nothing. Retry starts the request again from the beginning.

## What leaves your machine

- Ollama (verified local): nothing.
- OpenRouter: your prompt, chat context and the document content you disclosed go to OpenRouter and the model provider it routes to. Somnia asks OpenRouter to use only zero-data-retention endpoints, with no fallback to other providers, and only endpoints that support every request parameter. That is a routing request; Somnia cannot check a provider's actual practices. Processing may be outside the EU. Read OpenRouter's privacy page and its data-collection guide (linked in the privacy settings).
- Withdrawing consent: "Withdraw cloud consent" stops new requests and cancels active ones. It cannot delete what was already sent.

## Common errors

| Message (shortened) | Cause | What to do |
|---|---|---|
| Cloud AI consent is missing or was withdrawn | Consent is off | Turn on Allow cloud AI in AI privacy settings |
| Confirm disclosure to the selected provider... | Panel checkbox not ticked (OpenRouter) | Tick it for this run |
| The API key is missing or was rejected (HTTP 401/403) | No key, wrong key, or revoked | Test a new key in Providers |
| Could not access the OS credential store | Keystore locked | Unlock it and retry. No key is written to a plain file. |
| No credit or quota for this key (HTTP 402), or quota exhausted | OpenRouter balance or spending limit | Add credit, check limits, or use a free model. Quota errors are not retried. |
| Provider is rate-limiting this model (HTTP 429) | Common with free models | Wait, then retry or pick another model. Somnia already retried up to 3 times and respects Retry-After; waits over 60 s are shown instead of retried. |
| Provider has no available endpoint for this model under the current privacy settings | Model not found, or it has no zero-data-retention endpoint that supports tools | Check the ID. Try another model. Somnia has no setting to relax the ZDR restriction. |
| Model or provider does not support tool calls | Model cannot do function calling | Pick a model with tool support |
| Model ran out of output budget | Reasoning models spend tokens on thinking | Retry with a smaller change or a non-reasoning model |
| Provider had a server error / Could not reach the provider | Provider outage or no connection | Retry; check your network |
| Cannot reach Ollama. Check that the daemon is running | Daemon is not running on 127.0.0.1:11434 | Start Ollama, then Test local connection |
| Ollama model is not installed | Wrong name or model not pulled | Compare with `ollama list`; pull it |
| Native studio mode requires a verified local Ollama model | Cloud-tagged or forwarded model, or the daemon gave no local model info | Use a plain local model, or use OpenRouter with consent |
| Ollama returned remote output without cloud consent | The stream carried remote-host markers mid-turn | The turn is cut off. Do not treat that model as local. |
| Ollama returned an invalid or incomplete response | Stream ended early or malformed | Retry |

If a long project gets cut or answers look truncated on Ollama, the daemon's default context window may be too small. Somnia's adapter can send a context size, but the panel does not expose it, so the daemon default applies.

## Known limits

- No custom OpenRouter or Ollama address in the app; no setting for ZDR or fallbacks.
- The model name is free text; the refresh list is a suggestion list, not a validated or capability-tested catalog.
- Ollama over the packaged app's webview relies on the daemon accepting the app's origin. Not verified on a real Windows or macOS run. If the connection test fails while `ollama list` works, Ollama's allowed-origins setting is the first thing to check (`OLLAMA_ORIGINS` in Ollama's documentation).
- OpenRouter cost comes from the provider's `usage.cost` when present; if absent it is unknown, not zero. The Ollama adapter reports token counts only, never a cost.
