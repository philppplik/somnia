# Builder-Handover: OpenAI-Konzept

- Datei: `docs/decisions/openai-api.md`, 131 Zeilen, deutscher Entscheidungsentwurf mit 17 Quellenkennungen.
- Ziel: auf `somnia-agent` integrieren. Keine Branches, Commits, Pushes oder PRs erstellt; nur Builder integriert.
- Verifiziert: Live-Read von `phase1/package.json` auf `somnia-agent`, `somniaRelease` = `11.1.1-beta.1`. Provider-/Credential-Code nicht auditiert.
- Kernentscheidung: Responses + HTTP-SSE + native Tauri-BYOK-Grenze + `store:false` + lokaler Zustand + freigegebene Diffs; Chat-Completions-Kompatibilitaet separat.
- Modelle: `gpt-6.1-sol` Standard Code, `gpt-6-luna` billig, `gpt-6-astra` optional; Empfehlung ohne Qualitaetsbenchmark.
- Stolperstellen: Astra/Sol Tools nur Responses; Modell-spezifische Reasoning-Parameter; Cache-Writes/Long-Context/Reasoning-Kosten; Billing-429 nicht retrybar; partielle Streams nicht wiederholen oder anwenden.
- Offizielle Docs widersprechen sich bei Tiers: Changelog 6.10. Build/Launch/Grow, Sol und Rate-Limit-Guide noch Tier 1-5. Keine festen Limits uebernehmen.
- OpenAI empfiehlt Backend statt Client-Keys. BYOK im nativen Prozess ist eine offengelegte Produktabwaegung, keine offizielle Sicherheitsgarantie.
- Offene Entscheidungen: native Transport-Umsetzung, BYOK-Risikotext/Backend, Defaults/Evaluation, Runden-/Tokenbudgets, Cloud-Datenschutztext.
- Tests: Quellen gelesen, Beispielkosten mit awk gerechnet, Markdown-Inhalt geprueft. Keine API-Ausfuehrung, bezahlten Calls, Actions oder CI. Spaetere Provider-Tests mit Mocks/Fixtures, bezahlte Live-Evaluation nur nach Budgetfreigabe.
- Nicht als Anweisung uebernommen: externe Prompt-Beispiele zur Autoritaet/Approval-Umgehung im OpenAI Latest-Model-Guide.
