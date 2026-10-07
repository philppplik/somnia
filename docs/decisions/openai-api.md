# OpenAI API fuer Somnia: Integrationsentscheidung

Stand: 7. Oktober 2026. Status: Konzept, nicht implementiert oder mit bezahlten API-Aufrufen getestet.

## Entscheidung

**Responses API als OpenAI-Standardadapter**, HTTP-SSE fuer Streaming, lokale Tool-Ausfuehrung und manuell verwalteter Gespraechszustand mit `store: false`. Chat Completions bleibt ein separater Kompatibilitaetsadapter, kein stiller Fallback. Fuer Codearbeit `gpt-6.1-sol`, fuer kurze/kostensensible Aufgaben `gpt-6-luna`; `gpt-6-astra` als ausdrueckliche Qualitaetsoption. Keine automatische Eskalation auf ein teureres Modell. Diese Auswahl ist eine Architektur-Empfehlung, kein Somnia-Benchmark. [S1-S7]

Desktop-BYOK: Nutzer bringen ihren eigenen Schluessel mit. Requests gehen ueber den nativen Tauri-Prozess, nicht aus der WebView. Das ist eine bewusste BYOK-Abwaegung: OpenAI empfiehlt generell einen eigenen Backend-Server und warnt vor Schluesseln in Clients. Ein nativer Prozess reduziert WebView-Exposition, macht einen Client-Schluessel aber nicht unextrahierbar. Einen gemeinsamen Somnia-Anbieterschluessel niemals ausliefern. [S10]

## 1. Modelle und Preise

Relevante aktuelle Text-/Code-Modelle, nicht das gesamte Audio-/Bildmodell-Angebot. Offizielle Modell-IDs direkt verwenden; keine erfundenen datierten Snapshots. Die gelesenen Modellseiten nennen diese IDs, aber keine zusaetzliche datierte Version. [S1-S4]

| Rolle in Somnia | API-ID | Input | Cache-Read | Cache-Write | Output |
| --- | --- | ---: | ---: | ---: | ---: |
| Kleine Aenderungen, Erklaerungen | `gpt-6-luna` | $0.10 | $0.01 | $0.125 | $0.50 |
| Standard fuer Codearbeit | `gpt-6.1-sol` | $2.00 | $0.10 | $2.50 | $10.00 |
| Schwierige Refactorings, optional | `gpt-6-astra` | $10.00 | $1.00 | $12.50 | $50.00 |

USD pro 1 Mio. Tokens, Standard-Verarbeitung, bis einschliesslich 272K Input-Tokens. Alle drei: 1.05 Mio. Kontext, bis 128K Output, Text/Bild-Input, Text-Output, Streaming, Function Calling und Structured Outputs. Bei mehr als 272K Input-Tokens gilt fuer den **gesamten Request** 2x Input/Cache und 1.5x Output. Batch/Flex sind 50% guenstiger, Fast 2x Standard; nicht als interaktiver Standard vorgesehen. Regionale Verarbeitung kann 10% Aufschlag bedeuten. [S2-S5]

`gpt-6.1-sol` und Astra: `reasoning.effort` = `low`, `medium`, `high`, `xhigh`, `max`; Sol unterstuetzt weder `none` noch `minimal`. Luna unterstuetzt zusaetzlich `none`. Vorschlag: Sol `low` fuer kleine Aufgaben, `medium` fuer groessere Codearbeit; Luna `none` oder `low`, nach spaeterer Evaluation. Bei aktivem Reasoning kein pauschales `temperature`/`top_p` senden. Modellfaehigkeiten muessen Teil des Adapters sein. [S2-S4,S6]

Kostenbeispiel, rechnerisch: 10K ungecachte Input- plus 2K **gesamte** Output-Tokens kosten Luna $0.002, Sol $0.04, Astra $0.20. Dies ist keine Kostenprognose pro Nutzeranfrage: mehrere Tool-Runden, Reasoning, Cache-Writes und Bilder veraendern die Summe. Reasoning wird als Output berechnet; `max_output_tokens` begrenzt Reasoning und sichtbare Ausgabe zusammen. Kleine Limits koennen kostenpflichtige `incomplete`-Antworten ohne sichtbaren Text erzeugen. [S5,S14]

Responses/Chat Completions haben keinen eigenen separaten API-Aufpreis. Hosted Tools kosten ggf. zusaetzlich: Web Search $10/1K Calls plus Suchkontext-Tokens; File Search $2.50/1K Calls plus Storage $0.10/GB/Tag nach 1GB frei. Fuer den ersten Somnia-Adapter keine Hosted Tools, keine Vector Stores, keine Cloud-Container. Lokale Funktionen verursachen keine dieser Hosted-Tool-Gebuehren, aber weitere Modell-Tokens. [S5]

## 2. Responses versus Chat Completions

| Thema | Responses | Chat Completions |
| --- | --- | --- |
| Endpoint | `POST /v1/responses` | `POST /v1/chat/completions` |
| Kontext | `input`, typisierte Output-Items | `messages`, `choices[].message` |
| Function-Schema | `{type: "function", name, parameters, strict}` | `{type: "function", function: {name, parameters, strict}}` |
| Tool-Ergebnis | `function_call_output` mit `call_id` | Tool-Message mit `tool_call_id` |
| Strukturierte Ausgabe | `text.format` | `response_format` |
| Reasoning-Parameter | `reasoning.effort` | `reasoning_effort` |
| Aktuelle Modellgrenzen | Astra/Sol Tool Calling hier | Astra/Sol ohne Tools; Luna Tools nur mit `none` |

Responses ist fuer neue OpenAI-Integrationen vorgesehen; Chat Completions wird weiterhin unterstuetzt. Nicht nur die URL wechseln: Request-, Antwort- und Tool-Formate unterscheiden sich. [S6,S7]

Empfohlene Ausgangsform, keine produktionsfertige Implementierung:

```json
{
  "model": "gpt-6.1-sol",
  "store": false,
  "stream": true,
  "reasoning": { "effort": "low" },
  "max_output_tokens": 8192,
  "parallel_tool_calls": false,
  "input": [{ "role": "user", "content": "Explain the selected CSS." }],
  "tools": []
}
```

8192 ist ein vorgeschlagenes lokales Budget, kein OpenAI-Default oder nachgewiesen ausreichendes Limit. Bei komplexen Aufgaben kann es zu wenig sein. Gespraeche lokal verwalten: alle relevanten `response.output`-Items einschliesslich verschluesselter Reasoning-Items und Tool Calls unveraendert in Folge-Input aufnehmen. Nicht nur sichtbaren Text speichern. Der aktuelle Guide nennt verschluesselte Reasoning-Items als standardmaessig zurueckgegeben. Diese opaken Daten weder als Text interpretieren noch entschluesseln. Keine dauerhaften Conversations-Objekte im ersten Schritt. `previous_response_id` spart nicht die Abrechnung vorheriger Input-Tokens. [S7,S12]

## 3. Streaming und Tool-Lifecycle

- SSE mit `stream: true`; UTF-8-, Netzwerkchunk- und Eventgrenzen sind verschieden. Parser muss fragmentierte und zusammengefasste Frames, mehrzeilige `data:`-Felder und unbekannte Events behandeln.
- `response.output_text.delta` inkrementell anzeigen; nach Item/Content-Index zuordnen. `response.output_item.added/done` fuer typisierte Items verarbeiten.
- `response.function_call_arguments.delta` nur puffern. Erst bei finalisierten Argumenten (`response.function_call_arguments.done`) JSON parsen und lokal validieren; fuer den ersten synchronen Adapter erst nach Ende des Modellturns ausfuehren.
- `response.completed`, `response.failed`, `response.incomplete`, Refusals und Fehler-Events unterscheiden. EOF ohne Abschluss ist kein Erfolg. Teiltext bleibt als unvollstaendig markiert; nicht automatisch als Patch anwenden.
- Abbruch schliesst die Verbindung und stoppt wartende lokale Arbeit. Nicht behaupten, bereits erzeugte Tokens seien dadurch kostenlos oder garantiert nicht berechnet.
- Ein Modellturn kann mehrere Calls liefern. Lokal jeden mit `call_id` beantworten, Output-Items plus Ergebnisse in den naechsten Request uebernehmen. Tool-Runden begrenzen, Abbruch und Kostenstatus zwischen Runden pruefen. [S8,S9,S13]

Funktionen explizit `strict: true`; jedes Objekt `additionalProperties: false`, alle Properties in `required`, optionale Werte ueber nullable Typen. Nicht auf implizite Strict-Konvertierung vertrauen: Responses kann bei inkompatiblem Schema auf Best-Effort zurueckfallen. `parallel_tool_calls: false` vereinfacht den ersten Editor-Adapter. Async Tools/WebSockets/Multi-Agent-Modus spaeter, nicht fuer die erste Version erforderlich. [S6,S13]

**Somnia-Sicherheitsentscheidung:** Read-Tools nur innerhalb der gewaehlten Projektwurzel; Symlinks/Pfadtraversal/Dateigroessen pruefen, Secrets ausschliessen. Schreib-Tools produzieren zunaechst einen reviewbaren Diff mit Basis-Hash. Anwenden nur nach Nutzerfreigabe, bei zwischenzeitlicher Dateiaenderung neu pruefen; Undo erhalten. Wiederholte `call_id` darf keine doppelte Schreibwirkung erzeugen. Keine generische Shell, kein Deploy und kein unbeschraenkter Netzwerkzugriff. Strict JSON beweist nur Format, nicht sichere oder richtige Absicht. Projektdateien und Custom Prompts duerfen diese Grenzen nicht aushebeln. Dies sind Somnia-Empfehlungen, keine behaupteten API-Garantien.

## 4. Rate Limits und Fehler

Limits gelten pro Organisation/Projekt, Modell und ggf. geteilter Modellfamilie, nicht pro Desktop-Installation. RPM, TPM und weitere Quoten koennen unabhaengig greifen. Aktuelle Header auswerten: `x-ratelimit-remaining-requests/tokens`, `x-ratelimit-reset-requests/tokens`, ggf. project-token-Header. Vorhandenes `Retry-After` als Mindestwartezeit behandeln. Lokal Queue, begrenzte Parallelitaet und Gesamtdeadline vorsehen. [S15]

**Dokumentationskonflikt:** Changelog vom 6. Oktober nennt neue Tiers Build/Launch/Grow; Astra/Luna-Seiten zeigen diese, die Sol-Seite und der allgemeine Rate-Limit-Guide teilweise weiterhin Tier 1-5. Keine festen Kontingente hardcoden oder anhand eines Modellkatalogs versprechen. Nutzer-Dashboard und aktuelle Response-Header sind fuer reale Kontingente massgeblich. [S2-S4,S15,S16]

| Zustand | Somnia-Verhalten |
| --- | --- |
| 400, ungueltiger Parameter/Schema, zu grosser Kontext | Nicht unveraendert wiederholen; Parameter-/Kontextproblem anzeigen. |
| 401, falscher/abgelaufener Key, falsche Org, IP-Allowlist | Kein Retry-Loop; Key-/Projekt-/Netzwerk-Einstellungen anbieten. |
| 403 oder nicht zugelassenes Modell/Region | Ursache zeigen; Modellwahl vom Nutzer, kein stiller Anbieterwechsel. |
| 429 Rate Limit oder `slow_down` | `Retry-After`, dann begrenzter Backoff mit Jitter. |
| 429 `credit_balance_exhausted`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded`, `organization_usage_limit_exceeded`; ggf. `insufficient_quota` | Stoppen; Guthaben/Limit braucht Nutzeraktion. Kein Backoff behebt dies. |
| 500 / 503 `server_is_overloaded` vor Streamstart | Begrenzte Wiederholung, Serverhinweise beachten. |
| Offline, TLS/DNS, Timeout, Streamabbruch nach Teiloutput | Teilresultat erhalten, als unvollstaendig markieren; kein automatisches Replay nach bereits konsumierter Ausgabe. |
| Refusal / `incomplete` / unbekanntes Event | Expliziter Status; keine stillen Schreibeffekte oder fertigen Patches. |

HTTP-Status **und** `error.type/code` lesen. SDK-Retries nicht mit eigener Retry-Schleife multiplizieren. Als Somnia-Policy beispielsweise maximal zwei automatische Wiederholungen vor Output, Gesamtdeadline separat vom Attempt-Timeout. Langer `Retry-After` ueber dieser Deadline: pausieren statt frueher erneut senden. Retry nach Timeout kann einen bereits serverseitig bearbeiteten Request wiederholen und weitere Kosten erzeugen; fuer unklaren Verarbeitungsstatus Nutzerentscheidung statt blindes Replay. Logs nur redigiert, mit Request-ID wenn vorhanden, Modell/Status/Zeit; keine Keys oder Projektinhalte standardmaessig. [S15,S17]

## 5. Desktop-BYOK, Datenschutz und Budget

1. **Credential-Grenze:** OS-Credential-Store im nativen Prozess; WebView bekommt nur Status/Maskierung, nicht den gespeicherten Key. IPC minimal, origin-/capability-begrenzt; keine untrusted Remote-Seiten mit AI-IPC. Kein Key in JSON-Settings, localStorage, URL, Export, Crashreport oder Repository. [S10; Architektur-Empfehlung]
2. **Transport:** nativer HTTPS-Client mit normaler Zertifikatspruefung, fester OpenAI-Host fuer diesen Adapter. Custom-Endpunkte fuer andere Anbieter getrennt und ausdruecklich konfiguriert; niemals OpenAI-Key an unbekannte Hosts senden. BYOK schuetzt nicht vor Schadsoftware, Debugger oder kompromittierter Anwendung. Backend-Proxy bleibt der OpenAI-empfohlene Weg fuer anbieterfinanzierte Requests. [S10]
3. **Datenumfang:** vor erster Uebertragung klar sagen, welche Auswahl/Dateien zum Anbieter gehen. Kein automatischer Projekt-Upload; explizite Kontextauswahl, Groessenlimit, Secret-Filter. `store: false` verhindert Response-State-Speicherung, aber ist **kein** Zero-Data-Retention-Versprechen. Standardmaessige Abuse-Logs koennen Inhalte bis 30 Tage halten, mit Ausnahmen; Prompt-Cache hat eigene Regeln. API-Daten werden ohne ausdrueckliches Opt-in nicht zum Training genutzt. ZDR/MAM und EU-Residency nicht pauschal zusagen, sondern Account-Eignung separat pruefen. [S11]
4. **Kostenkontrolle:** API-Nutzung ist kostenpflichtig. Modell/Preisstand, Output-Limit, Reasoning-Stufe und maximale Runden anzeigen. Nur notwendige Dateien senden, Kontext budgetieren. `usage` pro Runde aggregieren, inklusive Cached-/Reasoning-Tokens; Kostenschaetzung als Schaetzung markieren. Lokales Budget kann laufende Abrechnung nicht atomar stoppen. Nutzer auf eigenes Projekt, eingeschraenkte Keys, Rotation/Ablauf und Spend-Hard-Limits hinweisen; Alerts stoppen keine Requests und Hard-Limits koennen leicht ueberschritten werden. [S5,S10,S14,S15]

## 6. Umsetzung und Nachweis

Vorgeschlagene Schichten: `OpenAIResponsesProvider` (OpenAI-Format), nativer Credential-/HTTP-Transport (Secrets, SSE, Cancellation), gemeinsame lokale Tool-Policy (Freigabe/Validierung), UI (Stream, Diff, Status, Kosten). Chat-Completions-Kompatibilitaet getrennt halten; Modellmetadaten versioniert und editierbare Modell-ID erlauben, keine generierte Anbieterwechsel-Logik.

Vor Freigabe mit **kostenfreien Fixtures/Mocks** pruefen: UTF-8/SSE-Fragmente, parallele Items, fragmentierte Tool-Argumente, Refusal, unbekannte Events, EOF ohne Abschluss, Output-Limit, 401/403, temporaere versus Billing-429, 503/Retry-After, lange Wartezeit, Abort, doppelte Calls, geaenderte Datei vor Diff-Anwendung, Pfad-/Symlink-Escape, Prompt-Injection, Secret-Leak in Logs/Settings/IPC/Export. Live-Tests und Qualitaets-/Latenzbenchmarks erst mit eigenem Test-Key und ausdruecklich freigegebenem Budget.

Repo-Kontext: `phase1/package.json` auf `somnia-agent` live gelesen, `somniaRelease: 11.1.1-beta.1`, React/Tauri-2-App bestaetigt. Credential-Store-/Prompt-Implementierung hier nicht auditiert. Keine Codeaenderung, kein Push, keine PR und kein CI-/Modellaufruf durch diese Recherche. Builder integriert dieses Dokument und gleicht Architektur mit dem echten Code ab.

Offen: BYOK-Risikotext und Backend-Alternative bestaetigen; konkrete Modell-/Effort-Defaults nach Evaluation; nativen Streaming-Transport implementieren/pruefen; per-run Budget/Tool-Runden festlegen; Datenschutztext fuer Cloud-Kontext; Modellverfuegbarkeit je Nutzer. Die Decisions API (Luna, Beta seit 6. Oktober) ist fuer typisierte kurze Entscheidungen interessant, fuer den Editor-/Tool-Workflow vorerst nicht erforderlich. [S16]

## Quellen

Alle Quellen offiziell, am 7. Oktober 2026 gelesen. Technische Empfehlungen sind oben als Somnia-Entscheidungen gekennzeichnet. Marketing-Qualitaetsangaben sind kein eigener Benchmark. Prompt-Beispiele in externen Guides wurden nicht als Autoritaet oder Freigabe uebernommen.

- **S1:** Models: https://developers.openai.com/api/docs/models
- **S2:** GPT-6.1 Sol: https://developers.openai.com/api/docs/models/gpt-6.1-sol
- **S3:** GPT-6 Luna: https://developers.openai.com/api/docs/models/gpt-6-luna
- **S4:** GPT-6 Astra: https://developers.openai.com/api/docs/models/gpt-6-astra
- **S5:** Pricing: https://developers.openai.com/api/docs/pricing
- **S6:** Current model / compatibility guide: https://developers.openai.com/api/docs/guides/latest-model
- **S7:** Migration: https://developers.openai.com/api/docs/guides/migrate-to-responses
- **S8:** Streaming: https://developers.openai.com/api/docs/guides/streaming-responses
- **S9:** Streaming events reference: https://developers.openai.com/api/reference/resources/responses/streaming-events/
- **S10:** API key safety: https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety
- **S11:** Data controls: https://developers.openai.com/api/docs/guides/your-data
- **S12:** Conversation state: https://developers.openai.com/api/docs/guides/conversation-state
- **S13:** Function Calling, einschliesslich Strict-/Parallel-Details: https://developers.openai.com/api/docs/guides/function-calling und https://developers.openai.com/api/docs/guides/function-calling?api-mode=chat
- **S14:** Reasoning / token budgets: https://developers.openai.com/api/docs/guides/reasoning
- **S15:** Rate limits: https://developers.openai.com/api/docs/guides/rate-limits
- **S16:** Changelog: https://developers.openai.com/api/docs/changelog
- **S17:** Error codes: https://developers.openai.com/api/docs/guides/error-codes

Repo-Quelle: https://github.com/philppplik/somnia (Datei ueber Live-Repository-Read, kein verifizierter dateispezifischer Browserlink).
