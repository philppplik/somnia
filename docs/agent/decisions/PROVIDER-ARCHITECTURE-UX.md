# Entscheidungsvorlage: Provider-Architektur und KI-Panel

7. Oktober 2026. Status: Konzept, keine implementierte Funktion.
Basis: `somnia-agent`, Commit `467071380187a133eb90eb94e37963b0501ad480`, `somniaRelease: 11.1.1-beta.1`.

## Kurzentscheidung

Den bestehenden `AgentProvider.stream()`-Vertrag und den kontrollierten Tool-Loop behalten. Davor eine kleine Provider-Registry, benannte Verbindungsprofile, Modellkataloge und eine native Credential-/Transportschicht setzen. Settings, Secrets und Laufzeitfreigaben bleiben getrennt. Wechsel startet eine neue Sitzung; alte Unterhaltung wird nicht still an ein neues Datenziel gesendet. Failover ist standardmaessig aus. Custom Prompts bleiben providerneutral und werden als unveraenderlicher Snapshot in jede Runde eingebunden.

Zuerst Ollama/OpenRouter verallgemeinern und migrieren. Direkte APIs danach einzeln. Subscription-Login und externe Agent-Runtimes sind andere Integrationsarten, keine austauschbaren Modellnamen.

## 1. Verifizierter Ist-Stand

| Bereich | Gelesene Dateien unter phase1 | Befund |
| --- | --- | --- |
| Kernvertrag | `src/lib/agent/types.ts` | Modell, Nachrichten, Tools, Output-Limit, AbortSignal; normalisierte Text-/Tool-/Usage-/Finish-Events. Keine gemeinsame Discovery-/Capability-Schnittstelle. |
| Konstruktion | `src/lib/agent/panelBridge.ts` | Union ollama/openrouter, gemeinsames Modell-/Key-Feld, feste Fallunterscheidung. Ollama ohne gespeicherte Endpoint-Option konstruiert. |
| Modelllisten | `src/lib/agent/providers/ollama.ts` | health(), listModels() via /api/tags, verifyLocalModel() via /api/show existieren; Panel verwendet Discovery nicht. OpenRouter-Adapter hat keinen Discovery-Pfad. |
| Preferences | `src/lib/agent/settings.ts`, `src-tauri/src/agent_settings.rs` | Provider, Modell und Prompts ausserhalb des Projekts; Browser persistiert nur Nicht-Geheimnisse. allowActiveFile wird beim Laden false. |
| Secrets | `src-tauri/src/desktop.rs` | Ein OS-Keyring-Eintrag fuer OpenRouter. Load gibt Key via IPC an React zurueck, JS-Transport verwendet ihn. OS-Speicherung vorhanden, host-only Secret-Grenze noch nicht. |
| Prompts | settings.ts, panelBridge.ts | Max. 20, je 8000 und insgesamt 16000 UTF-8-Bytes. Aktivierte Texte nach Basis-Systemnachricht pro Runde. Keine Zugriffs-/Cloud-Freigabe dadurch. |
| Panel | `src/components/agent/AgentPanel.tsx` | Provider-Select, freie Modell-ID, Password-Feld und Prompteditor im Chatfluss. Speichern setzt Konfiguration und sichtbaren Chat zurueck. |
| Privacy | `src/lib/agent/privacy.ts`, openRouter.ts | Globales versioniertes Cloud-Consent; verifizierter lokaler Ollama-Pfad als Ausnahme. OpenRouter: ZDR default true, allow_fallbacks false, require_parameters true. |
| Retry | openRouter.ts, session.ts | Bis drei HTTP-Retries vor Body-Konsum; erneute Inferenz mit verdoppeltem Output-Limit bei leerer Length-Antwort. Kein Text bedeutet nicht keine Kosten. |

`docs/agent/PROVIDERS.md` beschreibt OpenRouter-Keys noch als session-only. Fuer Desktop ist das ueberholt. Dokument korrigieren, nicht OS-Speicherung entfernen.

Tests gelesen, nicht ausgefuehrt. Keine Inferenz, Keychain-Unlock oder native Plattformpruefung fuer dieses Konzept. Keine CI ausgeloest.

## 2. Alternativen

| Rang | Option | Urteil |
| --- | --- | --- |
| 1 | Kleine eigene Registry ueber vorhandenem Kern | Empfohlen: klare Privacy-Grenze, wenig Umbau, adapternahe Tests. Discovery/Mapping selbst pflegen. |
| 2 | Alle Dienste OpenAI-kompatibel behandeln | Nur fuer explizite compatible Endpoints. Nicht alle System-/Tool-/Finish-/Reasoning-Semantiken sind identisch. |
| 3 | Neuer Orchestrierungs-SDK | Jetzt kein konkreter Nutzen fuer einen zweiten Tool-Loop. Spaeter anhand Anforderungen pruefen. |

Provider schreiben niemals selbst Dateien. AgentSession, Dateifreigaben, proposal-only Tools und AgentReview bleiben verantwortlich.

## 3. Vier getrennte Objekte

- **ProviderDefinition:** versionierter Adapter, erlaubte Auth-Verfahren, Discovery, Feldschema und Policy-Unterstuetzung. Nicht aus Projekten ladbar.
- **ConnectionProfile:** Provider-ID, Profilname, Ziel, native Credential-Referenz, letzte Modellwahl, Limits. Mehrere Profile desselben Providers moeglich.
- **ModelDescriptor:** Katalogeintrag mit Capabilities, Limits, Herkunft, Zeitstempel und optional datierten Preisen. Kein Entitlement-Beweis.
- **RunSnapshot:** unveraenderlicher Turn-Snapshot mit Profil/Modell/Ziel/Policy/Promptrevision/Limits und Attempt-IDs, ohne Secrets.

```ts
interface ProviderAdapter {
  readonly providerId: string;
  discover(profile: ConnectionProfile, signal: AbortSignal): Promise<ModelCatalog>;
  inspectTarget(profile: ConnectionProfile, modelId: string,
                signal: AbortSignal): Promise<VerifiedTarget>;
  stream(request: AgentProviderRequest,
         run: RunSnapshot): AsyncIterable<AgentProviderEvent>;
}
```

Entwurf, kein existierender Typ. Gebundener Wrapper kann den bisherigen AgentProvider-Vertrag weiter erfuellen. inspectTarget liefert local-verified/cloud/unknown; unknown ist keine lokale Ausnahme. URL allein beweist Locality nicht. Ein unehrlicher lokaler Proxy bleibt eine offen benannte Vertrauensgrenze.

### Modellobjekt und Consent

ModelDescriptor: providerId, profileId, id, displayName, fetchedAt, source, capabilityEvidence sowie optional input/output limits und datierte price metadata. CapabilityEvidence traegt true/false/unknown plus Quelle; capabilities nicht aus dem Modellnamen ableiten. ModelCatalog traegt stale/error und Paginationsergebnis getrennt von den Eintraegen.

Die heutige globale Cloud-Einwilligung darf nicht automatisch jede neue Route autorisieren. Vorschlag: versioniertes Consent-Scope fuer Providerprofil/Ziel und Datenkategorien; neue Ziel- oder Routingpolitik erneut bewusst bestaetigen. Freigabe wird vor jeder Runde einschliesslich Tool-Ergebnissen im Host geprueft und bleibt widerrufbar. UI-Vorschau ist keine technische Autorisierung.

### Native Grenze

Renderer bekommt hasCredential statt gespeicherten Key. Setzen/Ersetzen/Loeschen sind getrennte IPC-Aktionen. Host liest Key direkt vor Discovery/Inferenz und liefert nur normalisierte Events und bereinigte Fehler zurueck. CredentialRef nach Profil-ID; nie automatische Wiederverwendung fuer anderen Provider/Endpoint.

Endpoint nur aus trusted Settings, nie aus Projekt, Prompt, Modellantwort oder Extensionmanifest. HTTPS remote; HTTP nur bewusst bestaetigte lokale/LAN-Verbindung. Loopback default, Redirects aus, keine URL-Userinfo, Host validiert. Secrets nicht in URL/Logs/Cache/Export. Browser bleibt sichtbar eingeschraenkte session-only Preview, ohne OS-Credential-Versprechen oder heimlichen CORS-Proxy.

## 4. Config v2 und Migration

Illustratives Nicht-Secret-Schema:

```json
{
  "schemaVersion": 2,
  "revision": 1,
  "activeProfileId": "local-default",
  "profiles": [{
    "id": "local-default",
    "providerId": "ollama",
    "label": "On this computer",
    "endpoint": "http://127.0.0.1:11434",
    "auth": {"kind": "none"},
    "selectedModelId": "",
    "enabled": true,
    "policy": {"allowCloud": false, "failover": {"mode": "off"}},
    "limits": {"maxSteps": 16, "maxToolCalls": 48,
               "maxOutputTokens": 8192, "timeoutMs": 180000,
               "maxContextBytes": 1048576,
               "maxInferenceRetries": 0}
  }],
  "customPrompts": [],
  "promptOrder": [],
  "catalogCachePolicy": {"ttlMinutes": 1440}
}
```

Key-Profil: auth = api-key plus opaque credentialRef, kein Key. OAuth spaeter eigener Typ/Lifecycle. Provideroptionen typisiert, kein beliebiges Request-JSON. OpenRouter requireZdr bleibt true. allowCloud ist eine Beschraenkung, keine Einwilligung. Steps/Calls/Tokens/Timeout stammen aus Kerndefaults; maxInferenceRetries=0 ist neuer Vorschlag und gilt fuer Wiederholungen derselben Runde, nicht fuer regulaere Tool-Runden. Attempt-ID fuer jede Inferenz.

Migration:

1. Ohne schemaVersion strikt v1 lesen; unbekannte neuere Version nicht ueberschreiben.
2. Ollama-/OpenRouter-Profile anlegen; v1 Modell nur dem bisher aktiven Provider zuordnen. Andere Modellwahl unbekannt lassen.
3. Prompt-ID, Name, Text, enabled und Reihenfolge exakt uebernehmen. Keine stille Optimierung/Uebersetzung.
4. Legacy-Keyring lazy lesen, wenn OpenRouter verbunden werden soll. Gesperrter Store darf lokales Ollama nicht blockieren. Legacy-Eintrag behalten, bis neue Referenz und Config erfolgreich geschrieben und erneut gelesen wurden.
5. Neue Config neben alter schreiben, validieren, ersetzen. Windows-/Crash-Recovery testen; Backup nur Nicht-Secrets. Credential- und Config-Save sind keine gemeinsame OS-Transaktion: Teilfehler sichtbar behandeln, profilbezogene Locks.
6. Browser v1-Nicht-Secrets migrieren. Keine Keys in localStorage speichern oder dort suchen.
7. Consent, allowActiveFile, Dateigrants, Chat, Proposals und laufende Requests nicht in globale Preferences migrieren. Consent separat versionieren.

Aktueller Save aendert Key vor Config-Schreiben. Recovery-Tests noetig. Abbrechen oder leerer unveraenderter Eingabewert darf kuenftig keinen Key loeschen; Remove ist explizite Aktion.

## 5. Modelllisten und Defaults

| Provider | Discovery | Auswahl / Grenzen |
| --- | --- | --- |
| Ollama | /api/tags, /api/show | Installierte Modelle, Capabilities und erneute Locality-Pruefung. Letzte gueltige Auswahl; sonst Benutzer waehlt. Kein Download/Cloud-Fallback. |
| OpenRouter | /api/v1/models | supported_parameters, Kontext, datierte Preise; nicht automatisch account-/policy-verfuegbar. Nur geeignete Text-/Tool-Kandidaten im Editiermodus. |
| OpenAI direkt (geplant) | /models | Basisdaten, keine komplette Capability-Matrix. Gepflegte API-/Modellmatrix zusaetzlich. Responses-Adapter; Subscription-Auth getrennt. |
| Anthropic direkt (geplant) | /v1/models, paginiert | Vorhandene Limits/Capabilities normalisieren, fehlende unbekannt lassen. Eigener Messages-Mapper. |
| Gemini direkt (geplant) | models.list, paginiert | supportedGenerationMethods und Tokenlimits; kein Embedding-Modell fuer Chat. Eigener generateContent-Mapper. |
| OpenAI-compatible (spaeter) | deploymentabhaengig | Manueller ID-Pfad bei fehlender Discovery, mit Capability-Warnung. Kein garantiert kompatibler Universaladapter. |

Cache getrennt von Config, gebunden an Profil/Ziel/Auth-Generation/Policy. Zeit und Quelle pro Eintrag, TTL 24h als Vorschlag. Refresh bei Connect/Benutzeraktion. Keywechsel invalidiert accountbezogenen Cache. Abgebrochene/spaete Antworten duerfen aktuelle Profilauswahl nicht ueberschreiben.

Offline: Cache als veraltet markieren, Modellwahl behalten. Modell fehlt: Send blockieren, kein erstes alphabetisches Modell einsetzen. Discoveryfehler != Inferenzfehler. Leerer Katalog, auth-failed, unreachable und policy-blocked getrennt.

Capabilities true/false/unknown mit Quelle: text, tools, stream, structuredOutput, vision, reasoning, context/output bounds. Katalogsignal != getestete Agentqualitaet. Unknown tools darf text-only erlauben, keine Projekt-Tools. Aktueller Nachrichtenvertrag ist text-only: Visionmetadaten aktivieren keine Bildfunktion.

Keine festen Modellnamen/Preise als Produktversprechen. Keine universelle temperature; nur unterstuetzte Parameter senden. Prompttexte zaehlen zum Kontextbudget: aktueller Wrapper fuegt sie nach dem Core-Bytecheck hinzu, daher Endpayload nochmals im Host pruefen. Modelllimits pruefen, Tokenzaehlung nur soweit belegt, sonst konservative Schaetzung. Nie still Custom Prompts abschneiden.

## 6. Retry und Failover

Request-Retry, Somnia-Profil-/Modell-Failover und internes Anbieter-Routing getrennt halten. Default Failover off, automatische erneute Inferenz off. Health/Discovery darf Backoff nutzen; Connect fuehrt keinen Test-Chat aus. Access-/Katalogerfolg beweist keine Inferenzberechtigung.

| Ereignis | Verhalten |
| --- | --- |
| 401/403 oder Key fehlt | Verbindung reparieren, nicht anderen Account verwenden. |
| 402 / Credits | Stop, keine Ersatzkosten. |
| 429/408/5xx | Retry anbieten, Retry-After beachten. Versandter Request koennte Kosten erzeugt haben. |
| Policy/ZDR/Tools fehlen | Stop; keine Lockerung. Alternative nur mit gleich strenger Policy und passenden Capabilities. |
| Teiltext/Toolfragmente/leere Inferenz | Keine transparente Wiederholung. Unvollstaendiger Turn, keine reviewbaren Diffs. |
| Stop/Consent-Revoke | Abbruch, keine Wiederholung. Remote-Abrechnung kann weiter bestehen. |
| Ollama unavailable | Lokale Reparatur/Alternative anbieten, niemals automatisch Cloud. |

Nur eindeutig vor Versand gescheiterte lokale Fehler sind fuer sicheren Auto-Retry geeignet. Bereits gemeldete Usage bleibt erhalten; unknown != zero. Auch automatische Tokenverdopplung ist erneute Inferenz und braucht bewusste Policy. Lokale Step-/Tokenlimits garantieren keinen centgenauen Gesamtpreis.

Spaeteres Opt-in: geordnete Profile/Modelle, erlaubte Datenziele, maximale Wiederholungen. Vor jedem Attempt passende Ziel-Einwilligung, Locality/Capability/Kontext/Limits pruefen. Keine Kreise, parallelen Doppelrequests oder Wiederholung ausgefuehrter Tool-Sequenzen. Unknown cost nicht als harten USD-Cap verkaufen.

OpenRouter allow_fallbacks=false behalten. Downstream-Routing ist nicht gleich Somnia-Profilwechsel. Datenpolitik im Request durchsetzen; kein EU/ZDR/no-training-Versprechen allein aus UI-Label.

## 7. Custom Prompts

Globale Bibliothek bleibt, optionale Profilzuordnung spaeter explizit. Providerwechsel schreibt keine Texte um. Reihenfolge sichtbar und gespeichert. Basis-Sicherheit zuerst, Nutzerpraeferenzen danach, dann History; jeder Adapter mappt auf seinen System-/Instruction-Kanal. Keine Annahme, dass alle APIs mehrere Systemmessages akzeptieren.

Prompts geben keine Datei-/Cloud-/Kostenfreigabe. Technische Grenzen im Host, nicht nur im Prompt. Text-/enabled-Aenderung startet eine neue Sitzung; vorheriger Chat bleibt lesbar. Revision je Run, keine Prompttexte im Log. Kontextvorschau zeigt aktive Prompts und Tool-Ergebnisse vor Cloud-Versand. Nicht-Secret-Config ist unverschluesselt: Warnung gegen Secrets bleibt.

Bestehende 20/8000/16000-Byte-Limits beibehalten; UTF-8-Zaehler in UI. textarea maxLength allein reicht bei Emoji nicht. Empty/disabled wird nicht gesendet. Keine ausfuehrbaren Promptvariablen in dieser Runde.

## 8. UI-Entwurf

`PROVIDER-UX-CONCEPT.png` ist ein illustrativer Entwurf, kein App-Screenshot.

Normaler Chat: kompakte Verbindungszeile unter Header mit Profil, belegtem Local/Cloud/Unknown-Status und Modelltrigger. Zahnrad oeffnet Configuration; keine grossen Credential-/Promptformulare im Chatfluss. Status nur einmal.

Configuration als tabs `Connections | Instructions | Privacy`. Profilfelder und durchsuchbare Modellliste: Modellname, ID, Capabilities, Quellenzeit, Preise soweit bekannt. Endpoint/Rate-/Tokenlimits unter Advanced. Verbindungen und Instructions separat, kein Setting-Bloat im Hauptpanel.

Credentials: `Stored in OS credential store` mit Replace/Remove. Keinen gespeicherten Key in Passwordfeld laden. Connect testet Auth/Discovery; separater Inferenztest mit Kostenhinweis. Remove bestaetigen, Escape schliesst ohne Save.

Wechsel: idle -> Auswahl -> Validierung -> Zusammenfassung -> `Switch and start new chat`. Alte History nicht versenden. Offene Diffs erst bewusst anwenden/verwerfen, nicht still verlieren. Laufenden Turn zuerst stoppen. Cloudwechsel zeigt Ziel/Policy und braucht passende Einwilligung. Dateigrants neu, allowActiveFile nicht heimlich aktiv.

Andere-Provider-Fortsetzung spaeter separate Aktion mit sichtbarem History-/Dateikontext und bewusstem Versand. Kein Default des Dropdowns. Vorschlag umfasst lesbares lokales Chatarchiv; dauerhafte Speicherung ist noch Produktentscheidung.

Fehleraktionen konkret: Credential locked, model missing, unreachable, unsupported tools, policy blocked, unknown cost. Bereinigte Details im Problems-Panel. Bestehende Load-/Save-Catchs zeigen zu breit OS-Store-Fehler, auch bei anderem Fehlergrund.

A11y/i18n: Tastaturcombobox, Fokus sichtbar/return, keine Farbe als einziges Statussignal, aria-live fuer Aenderungen. Alle neuen Strings via locale keys; aktuelle hardcodierte Config-Texte mitnehmen. Kein erneutes Keytippen nach Desktop-Restart.

## 9. Umsetzung und Abnahme

| Paket | Bereich | Abnahme |
| --- | --- | --- |
| A Settings v2 | settings.ts, agent_settings.rs, desktop.rs | v1 round-trip, UTF-8, Unknown-Version, locked-store lokal nutzbar, Save-/Crash-Recovery. |
| B Registry/Host | registry.ts, nativer Transport, panelBridge | Gleiche Events, Abort/Revocation, Secrets nicht in IPC-Load/Log, Ziel trusted-only. |
| C Discovery | adaptereigene Mapper/Cache | Pagination, stale/offline, Wechselrace, Modellverlust, unbekannte Capabilities, keine Testinferenz. |
| D UI | getrennte Configuration/ModelPicker/PromptEditor | Send ohne Modell blockiert, Replace/Remove getrennt, Wechsel mit Review, Tastatur, 5 Sprachen. |
| E Direkte APIs | einzeln nach Prioritaet | Fixture-Tests Rollen/Tools/Fragments/Usage/Finish/Abort. Katalog kein Kompatibilitaetsbeweis. |

Zuerst gemeinsame Typen, dann native Store/Transport, dann Discovery/UI. Echte Provider-Tests erst nach separatem Budget. In diesem Auftrag keine paid APIs oder CI.

Regressionen: Ollama-Wechsel behaelt OpenRouter-Key; gesperrter Store blockiert lokal nicht. Cancel/Save ohne Credential-Aktion loescht nichts. Alte Events und Proposals nach Wechsel sicher behandeln. Consent-Revoke stoppt Stream/Retry. Remote/unknown nie lokale Ausnahme. Keine Historymigration bei Wechsel; Prompts pro Runde inklusive Budgetcheck. Malformed/completion-loss erzeugt keine Diffs. Jede Inferenz mit Attempt-/Usage-Daten; unknown nie null Kosten. Secrets niemals in Project-ZIP/Logs/Cache/Backup.

## 10. Offene Produktentscheidungen

1. Welche direkten Provider nach Ollama/OpenRouter zuerst? Nicht alle gleichzeitig ohne Bedarf.
2. Dauerhaftes lokales Chatarchiv mit Loeschen/Privacy oder nur Sessionarchiv?
3. Bewusst aktivierbare Auto-Retries/Failover? Vorschlag aus, bestehendes Verhalten aendert sich.
4. Mehrere Keys/Endpoints desselben Providers schon in erster UI-Runde? Schema vorbereitet, UI kann klein starten.

Dokument abgeschlossen, Implementierung nicht damit erledigt oder freigegeben.

## Quellen

Repo live geklont: https://github.com/philppplik/somnia, Basis-Commit oben. Implementierungspfade in Abschnitt 1. Offizielle Seiten am 7. Oktober 2026 gelesen, keine Modell-/Preisgarantie. Fuer dieses technische Konzept sind Repo-Code und Primaerdokumentation massgeblich, keine Community-Benchmarks fuer Qualitaetsversprechen verwendet.

- https://docs.anthropic.com/en/api/models - paginierter Katalog und Metadaten.
- https://ai.google.dev/api/models - List/Generation-Methoden/Tokenlimits.
- https://openrouter.ai/docs/guides/overview/models.md - supported_parameters/Kontext/Preise.
- https://openrouter.ai/docs/guides/routing/provider-selection - Routing/Fallbacks.
- https://developers.openai.com/api/reference/resources/models/methods/list/ - Basismodellfelder.
- https://docs.ollama.com/api/tags - installierte Modelle.
- https://docs.ollama.com/api-reference/show-model-details - Details/Capabilities. Erste Dokumentations-URL /api/show war nicht abrufbar; API-Pfad ist weiter /api/show.

Subscription/OAuth/ACP sind bewusst paralleles Konzept-Thema; bestehendes PROVIDERS.md ist hier Kontext, keine frisch gepruefte Login-Freigabe.
