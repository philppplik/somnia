# Lokale KI in Somnia

[English guide](LOCAL-AI-IN-SOMNIA.md)

Nutze Ollama für lokale Agent-Anfragen und unterstützte lokale Vibe-Läufe. Somnia installiert keinen Dienst und lädt kein Modell ohne ausdrückliche Aktion herunter. Ein vom Dienst aufgelistetes Modell garantiert weder Qualität noch verfügbaren Speicher oder tatsächliche Ausführung auf diesem Gerät.

Dieser Leitfaden beschreibt den Entwicklungsstand A-V. Für das ausgelieferte Desktop-Paket und Tests auf echten Geräten fehlen weiterhin Abnahmenachweise. Siehe [Abnahme-Checkliste](LOCAL-AI-ACCEPTANCE.md). Manche Steuerelemente sind experimentell oder in Builds mit ausgeschalteten Flags nicht verfügbar.

## Ollama einrichten

1. Öffne Einstellungen > Power-Ups > KI > Lokal. In manchen Ansichten heißt der Weg kürzer Einstellungen > KI > Lokal.
2. Prüfe oder aktualisiere den Laufzeitstatus. Ist die Laufzeit nicht erreichbar, installiere Ollama selbst anhand der Ersteinrichtung. Somnia führt kein Installationsprogramm oder Installations-Shellskript aus.
3. Starte die installierte Ollama-App unter Windows/macOS mit der angebotenen Aktion. Unter Linux befolgst du die angezeigten Dienstanweisungen selbst. Ein Start beweist nicht, dass der Dienst bereit ist. Aktualisiere erneut.
4. Wähle eine genaue Modellvariante. Prüfe Quelle, Lizenzinformationen, geschätzte Größe und Netzwerkdownload vor der Bestätigung. Unbekannte Angaben bleiben unbekannt.
5. Wähle und prüfe das Laufwerk für die Download-Prüfung. Gemessen wird die Kapazität dieses Ordners, nicht nachgewiesen, dass Ollama seine Modelle dort speichert. Der Platzbedarf beliebiger Tags kann unbekannt sein. Eine bestandene Prüfung reserviert keinen Platz und garantiert nicht, dass das Modell passt.
6. Warte nach dem Download auf den erfolgreichen Bestandsabgleich. Wähle das installierte Modell unter Anbieter und Modelle und speichere die KI-Einstellungen. Ein Download wählt das Modell nicht für dich aus.

Die Bereitschaftsprüfung liest nur Metadaten. Modellgewichte benötigen beim Download Internet, auch wenn die Inferenz später lokal ist. Weder das Öffnen noch Aktualisieren oder ein Hardware-Hinweis lädt ein Modell herunter.

## Modelle auswählen und verwalten

Installierte Tags, Quantisierung und Größen stammen aus Ollamas Bestand. Ladestatus und Modell-VRAM sind Angaben des Dienstes. Die Hardware-Eignung ist eine Schätzung, keine Garantie für Tempo, Speicherzuteilung oder Aufgabenqualität. Gemeinsamer Arbeitsspeicher ist kein zusätzlicher unabhängiger GPU-Speicher. Unbekannte Kapazität bleibt unbekannt.

Die Anzeige der letzten Nutzung meint einen erfolgreichen Agent-Abschluss, den Somnia auf diesem Gerät an diesem Endpunkt beobachtet hat. Andere Anwendungen und native Vibe-Nutzung zählen nicht dazu. Änderungs- oder Downloadzeit des Modells ist nicht die letzte Nutzung.

Aktualisieren lädt die genau geprüfte Variante erneut. Fortschritt gilt je Schicht, nicht als erfundener Gesamtprozentsatz. Abbrechen beendet Somnias eigene Verbindung; der gemeinsam genutzte Dienst kann weiterlaufen. Aktualisiere vor einem erneuten Versuch. Fortsetzen/erneut versuchen öffnet eine neue Prüfung samt Speicherprüfung für dasselbe Modell. Ollama kann Teilschichten wiederverwenden, aber eine Fortsetzung ab einer bestimmten Byteposition ist nicht garantiert.

Entfernen erfordert Bestätigung, eine aktuelle Identitätsprüfung und ein entladenes Modell. Ersetze oder lösche zuerst gespeicherte Agent-, Aufgaben- und Studio-Zuweisungen und speichere dann. Das Entfernen geteilter Modellblobs garantiert nicht, dass die gemeldete Größe als freier Speicher zurückkehrt. Andere Clients können zwischen Somnias Prüfungen eingreifen.

### Kontext und Modellvorgaben

Erweiterte lokale Einstellungen fordern Kontext- und Keep-alive-Werte an. Ein leeres Feld lässt den Dienststandard offen. Der Dienst kann den Kontext begrenzen. Keep-alive ist ein Aufbewahrungshinweis, kein Besitzanspruch; null fordert Entladen nach der Anfrage an. Diese Einstellungen schreiben Ollamas globale Konfiguration nicht um.

Aufgabenvorgaben sind ausdrücklich: Chat, Vibe, Code und Zusammenfassen. Eine Auswahl ändert einen Entwurf; Speichern hält ihn fest. Die Agent-Aufgabe wird ausdrücklich gewählt, nicht aus Prompt-Wörtern abgeleitet. Eine Aufgabenvorgabe hat Vorrang vor gespeicherter Studio-Vorgabe und globalem Modell. Sie darf nicht still auf die Cloud ausweichen. Ein fehlendes genaues Modell ist ein Fehler, kein Anlass für einen Ersatz. Eine Studio-Vorgabe gilt nur im unterstützten Panel-Bereich, nicht für jeden Worker oder CLI-Aufruf.

Ein neues Studio kann die gespeicherte Vibe-Vorgabe ausdrücklich übernehmen. Bestehende Studios behalten ihr festgelegtes Modell. Bereitschaftskarten helfen bei der Einrichtung, erlauben aber keine Inferenz. Natives Vibe prüft das genaue Ollama-Modell vor jeder Anfrage erneut.

### Andere Laufzeiten

Die Erkennung von llama.cpp und LM Studio liest nur Metadaten. Auch `somnia models` listet Modelle auf; es ermöglicht keine gleichwertige Inferenz, verwaltet keinen GGUF-Server und zertifiziert weder Tools noch Bilder oder Sprache.

LM Studio bleibt im Nur-lokal-Modus ungeprüft. Eine localhost-Adresse, ein geladenes Modell oder eine OpenAI-kompatible API beweist keine Ausführung auf diesem Rechner. Somnia wertet diesen Bestand nicht als Nachweis geprüfter lokaler Ausführung. Richte diese Server selbst ein; geschützter oder unlesbarer Bestand bleibt unbekannt.

## Offline-Modus und Cloud-Routing

Speichere die Offline-KI-Einstellung, um Somnias unterstützte Cloud-Anbieterpfade einschließlich konfiguriertem Fallback zu blockieren. Die Einstellung ist unabhängig von der Routenreihenfolge: Einschalten erhält Routen, statt sie still zu löschen. Die Checkbox allein ändert nur einen Entwurf.

Dies ist keine System-Firewall. Die Einstellung schaltet kein Netzwerk ab, verhindert keinen ausdrücklichen Gewichte-/Helper-Download, prüft keinen selbst verwalteten Dienst und umfasst keinen sonstigen Update-/OAuth-/MCP-Verkehr. Lokale Metadaten können falsch sein; gemeldete lokale Gewichte sind kein kryptografischer Beweis. Abbrechen kann bereits gesendete Bytes nicht zurückholen.

Allgemeiner reiner Chat darf eine ausdrücklich gespeicherte Lokal-zuerst-Route nutzen. Cloud-Ziele benötigen weiterhin ihre übliche Einwilligung und Anmeldung. Routing verschiebt keine Dokument-, Bild-, Tool- oder Studio-Arbeit zu einem anderen Anbieter. Nach einem Anbieterereignis gibt es kein Fallback. Aufgabenbezogene lokale Läufe bleiben festgelegt. Wiederholte Anfragen und Cloud-Fallback können auch ohne sichtbare Antwort Kosten verursachen.

In Vibe blockiert der begrenzte Board-Modus Cloud- und unbekannt-lokale Routen. Seine lokale Stoppschwelle verwendet gemeldete Nutzung, keine strikte Token- oder Geldreservierung. Nutzung kann erst nach einer Anfrage eintreffen; gleichzeitige lokale Arbeit kann die Schwelle überschreiten. Fehlende Nutzung ist nicht null. Prüfe aufgezeichneten Anbieter, Modell und Nutzung; Modellvorschläge schalten nichts automatisch um.

## Steuern, was eine lokale Anfrage erhält

Die lokale Agent-Checkliste schließt aktives Dokument/Medien samt Tools, Auswahl, Studio-Kontext, eigene Anweisungen und bisherigen Chat ein oder aus. Verlauf ist für diesen lokalen Kontextmodus standardmäßig aus. Eine ausgeschlossene Quelle fehlt im unterstützten Anfragepfad, nicht nur in der sichtbaren Schätzung.

Die Größenschätzung ist unvollständig: UTF-8-Bytes geteilt durch vier sind keine Modell-Tokenisierung. Nicht alle System-/Tool-Schemata, Verlauf, Medien oder spätere Tool-Ergebnisse sind enthalten. Die Dokumentgrenze weist zu große Inhalte zurück, statt eine abgeschnittene Datei still als vollständig zu behandeln. Senke bei Bedarf die Grenze oder schließe Quellen aus.

Vorlagen werden lokal gespeichert. Als Entwurf verwenden ersetzt bearbeitbaren Prompt-Text; es sendet nichts, wählt kein Modell, erlaubt keine Tools und ändert kein Projekt.

## Bilder, Tools und Vorschläge

Bild beschreiben erfordert eine von dir gewählte Datei, dateispezifische Einwilligung und eine gespeicherte Kontexteinstellung. Vorbereitete PNG-/JPEG-Inhalte werden skaliert und neu kodiert, nicht automatisch von der Zeichenfläche aufgenommen. Ergebnisse sind Text zur Prüfung. Dieses Steuerelement speichert keinen Bildbeschreibungsverlauf.

Gemeldete Bild-/Tool-Fähigkeiten sind Metadaten, keine nachgewiesene Qualität. Ausdrückliche synthetische Proben prüfen kleine Testfälle ohne echte Host-Tools. Eine bestandene Probe erlaubt keine Tool-Ausführung und beweist keine zuverlässige OCR. Gespeicherte Proben gelten nur für Sitzung und Modellidentität.

Komplexe Tool-Schemata können entfallen, statt umgeschrieben zu werden. Bestehende Host-Berechtigungen und Prüfungen gelten weiter. Fehlt ein nötiges Tool, vereinfache die Aufgabe oder wähle ausdrücklich ein anderes unterstütztes Modell.

Unterstützte Bildbeschreibungen und Interface-/Animations-/3D-Vorschläge zeigen ein bestimmtes Ziel und eine Vorher-/Nachher-Prüfung. Anwenden ist ausdrücklich und durch Revision/Auswahl abgesichert. Lehne einen falschen Vorschlag ab oder schließe ihn. Rückgängig überschreibt keine neuere Arbeit. Eine 3D-Vorschlagsnotiz ist Sitzungskontext, keine exportierte Geometrie. Vorläufiger oder abgebrochener Vibe-Text darf nicht auf das Projekt angewendet werden. Ein neuer Versuch mit Feedback erstellt frische Arbeit vom aktuellen Stand, statt teilweise Tool-Effekte oder Berechtigungen abzuspielen.

## Modelle vergleichen und bewerten

Der lokale Vergleich führt gewählte installierte Modelle nacheinander mit einem bearbeitbaren Prompt aus. Die Aufgabenbewertung bietet je Aufgabe einen kleinen bearbeitbaren deutschen Prompt und ein oder zwei Modelle. Starte ausdrücklich. Verlauf öffnen, Aufgabe ändern oder Aktualisieren führt keine Tests aus.

Ergebnisse enthalten Modell-Tag/Prüfsumme, wörtliche Ausgabe und Latenz. Die Zeit umfasst Prüfungen und Inferenz, nicht nur die Modellgeschwindigkeit. Tokens/Rate erscheinen nur, wenn gemeldet. Diese Steuerelemente sind weder Benchmarks noch automatische Qualitätsnoten oder ein Beweis für korrekten generierten Code. Sie führen keinen Code aus, verwenden keine Dokument-Tools und weichen nicht auf die Cloud aus.

Speichere Ergebnisse ausdrücklich. Vergleich und Bewertung teilen einen begrenzten lokalen Verlauf; lösche Einträge, wenn er voll ist. Vergleichs-JSON-Import erfordert Prüfung, erzeugt neue IDs und markiert importierte Ergebnisse weiter als ungeprüft. Import führt nichts aus. Exportierte Prompts/Ergebnisse können privat sein. Der Datenschutz-Inventarexport ist ein eigenes Prüfformat, kein automatisches Wiederherstellungs-/Importformat.

## Was auf diesem Gerät bleibt

Die lokale Datenschutzansicht listet Vorlagen, Vergleichsverlauf, Bewertungsergebnisse, gespeichertes Offline-Flag und Helper-Status/-Dateien. Prüfe ausdrücklich. JSON-Größen sind logische Nutzdatengrößen, keine Speicherbelegung; die beiden Verlaufskategorien teilen ihren Speicher. Natives Helper-Inventar zählt echte Helper-Dateien. Unbekannt heißt nicht verfügbar, nicht leer.

Jede Kategorie hat einen lokalen Export und separat bestätigtes Löschen/Zurücksetzen. Helper-Export enthält nur Status, nie Audio, ausführbare Dateien oder Sprachgewichte. Löschen einer Verlaufskategorie erhält die andere. Zurücksetzen des Offline-Flags entfernt erzwungenen Nur-lokal-Modus, gewährt aber keine neue Cloud-Einwilligung. Helper-Entfernung erhält das Sprachmodell und verweigert aktive Arbeit oder die Sperre eines anderen Besitzers.

Diese Funktion ergänzt keine automatische Synchronisierung. Das Inventar umfasst nicht jeden App-Speicher: Letzte-Nutzung-Metadaten, Vibe-Datenbanken/Journale, normaler Chat, andere Einstellungen und Projektwiederherstellung haben eigenes Verhalten. OS-/Browser-Backup oder -Synchronisierung, frühere Exporte und Ergebnisse im Arbeitsspeicher werden nicht gelöscht. Aktualisiere andere Panels nach dem Löschen. Dies ist kein sicheres Überschreiben. Anbieter-Zugangsdaten bleiben von diesen Exporten getrennt.

## Sprache: experimentell, standardmäßig nicht verfügbar

Der whisper.cpp-Helper ist ein optionaler separater Download, kein mitgelieferter Release. Das Release-Inventar ist derzeit leer und beide Vorschau-Gates bleiben standardmäßig aus. Keine geprüfte Helper-Quelle/Prüfsumme steht zur Installation bereit. Ersetze sie nicht durch eine beliebige ausführbare Datei und halte einen Fake-Prozesstest nicht für eine funktionierende Engine.

Vor der Freigabe benötigen echte Zielartefakte eine Lizenz-/Linkage-Prüfung, echte Prüfsummen/Hinweise und eine Abnahme von Isolation und Aufräumen verwaister Prozesse. Die Engine-Lizenz belegt nicht alle Artefaktlizenzen. Linux-Enkelprozess-Begrenzung und das Windows-Zeitfenster zwischen Start und Job-Zuweisung bleiben offene Release-Fragen. TTS ist separat und wird nicht durch Diktat bereitgestellt.

Sobald eine geprüfte Vorschau verfügbar ist, sind Mikrofoneinwilligung und OS-/Browser-Berechtigung ausdrücklich. Zum Aufnehmen gedrückt halten, zum lokalen Transkribieren loslassen. Deutsch und Englisch sind Sprachoptionen für ein mehrsprachiges Modell. Bearbeite das fertige Transkript und füge es ausdrücklich dem Prompt hinzu. Nichts wird automatisch gesendet. Späteres Senden dieses Prompts folgt weiter den normalen Offenlegungsregeln des gewählten Anbieters; lokale Transkription macht späteres Cloud-Senden nicht lokal.

## Fehlerbehebung

| Symptom | Nächster Schritt |
| --- | --- |
| Laufzeit nicht erreichbar | Starte den installierten Dienst und aktualisiere. Prüfe den konfigurierten Loopback-Endpunkt. Fehlgeschlagene Erkennung beweist nicht, dass die App fehlt. |
| Bestand oder Ladestatus unbekannt | Wiederhole die Metadatenprüfung. Nimm weder null installierte Modelle noch genug freien Speicher an. |
| Zugewiesenes Modell fehlt | Installiere die genaue Variante nach Prüfung oder ersetze/lösche die gespeicherte Zuweisung ausdrücklich. Kein stiller Ersatz. |
| Download unterbrochen | Aktualisiere, prüfe Fortsetzen/erneut versuchen für genau dieses Modell und wähle das Laufwerk erneut. Nimm nicht an, dass der gemeinsame Dienst angehalten hat. |
| Entfernen verweigert | Beende aktive Arbeit/Prüfung, ersetze gespeicherte Verweise und entlade das Modell. Aktualisiere die Identität vor erneuter Bestätigung. |
| Lokalität/Fähigkeit abgelehnt | Prüfe aktuelle Metadaten des genauen Modells. Name, Loopback-Ursprung oder Modellauflistung reichen nicht. Kein automatischer Cloud-Umweg. |
| Kontext zu groß | Schließe Quellen aus oder senke den Dokumentumfang; prüfe gespeicherten angeforderten Kontext. Die Schätzung ist kein hartes Gesamt-Tokenbudget. |
| Board-Grenze stoppt Arbeit | Prüfe gemeldete Nutzung und Richtlinie. Ändern des Ansichtsfilters setzt Summen nicht zurück. Begrenzter Modus blockiert Cloud statt Geld zu reservieren. |
| Speichern/Export nicht verfügbar | Prüfe gespeicherte Konfiguration/Speicherstatus. Voller, beschädigter oder unzugänglicher Speicher ist keine erfolgreiche Speicherung. Halte vorhandene Exporte privat. |
| Spracheinrichtung nicht verfügbar | Ohne geprüfte Helper-Artefakte und aktivierte Vorschau-Gates erwartet. Fake-UI-/Prozesstests sind keine Installationsanweisungen. |
| Abgebrochene/teilweise Antwort | Behandle sie als unvollständig. Wende sie nicht an. Ein ausdrücklicher frischer Versuch ist etwas anderes als das Abspielen des alten Laufs. |

Auch lokale Inferenz braucht Hardware, Strom und Zeit. Dieser Leitfaden garantiert weder Modellqualität, Tempo, Kapazität noch ausbleibenden Datenabfluss. Die Abnahme-Checkliste trennt Testfall-Nachweise von nativer, paketierter Arbeit und Tests auf echten Geräten.
