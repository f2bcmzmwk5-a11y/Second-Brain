# Second Brain – Notiz-App fürs iPhone

Persönliche Second-Brain-App als **PWA (Progressive Web App)**.
Läuft auf dem iPhone wie eine echte App (über „Zum Home-Bildschirm“), funktioniert offline
und speichert alle Daten **lokal auf dem Gerät**.

**➜ https://f2bcmzmwk5-a11y.github.io/Second-Brain/**

- **Entwicklung:** Windows-PC mit Claude Code
- **Hosting:** GitHub Pages (dort liegt nur der Code, keine Notizen)
- **Sprache der Oberfläche:** Deutsch

---

## Arbeitsweise für Claude Code

1. **Erst planen, dann bauen.** Vor jeder Phase: Plan vorlegen, Rückfragen stellen
   (max. 5), auf Freigabe mit **„Los“** warten.
2. Keine Dateien anlegen oder ändern, bevor der Plan freigegeben ist.
3. Erklärungen kurz und ohne Fachjargon – die App wird von einem
   Nicht-Entwickler gepflegt.
4. Nach jeder Phase: kurz zusammenfassen, was gebaut wurde, und wie es getestet wird.
5. Dieses README aktuell halten (Abschnitt „Status“ abhaken).
6. Bei Änderungen an der Datenstruktur immer an die Migration bestehender Daten denken –
   **vorhandene Notizen dürfen bei Updates nie verloren gehen.**

---

## Grundprinzipien

- **Lokal:** Daten in IndexedDB, kein Login, kein Tracking, keine Cloud-Pflicht.
- Beim ersten Start `navigator.storage.persist()` anfragen.
- **Kein Build-Schritt:** Vanilla HTML/CSS/JavaScript. Kleine Libraries per CDN erlaubt
  (z. B. `marked`, `idb`, `JSZip`).
- **Offline:** Service Worker cached alle App-Dateien.
- **iPhone-optimiert:** `manifest.json`, `apple-touch-icon`, Safe-Area-Abstände
  (Notch/Home-Balken), große Touch-Flächen, Dark Mode nach Systemeinstellung.

---

## Struktur der Notizen

- **Bereiche (Tab-Bar unten):** Inbox · Projekte · Wissen · Archiv · Suche
- Jede Notiz hat zusätzlich ein Feld **Lebensbereich**: Arbeit, Fachwirt, Privat, Ideen
  (als Filter in jeder Ansicht).
- Neue Notizen landen in der **Inbox**, Verschieben mit einem Tipp.
- Verknüpfung über `[[Notizname]]` und `#tags`.

---

## Funktionen

### Phase 1 – MVP
- [x] Notizen in Markdown erstellen, bearbeiten, löschen (Bearbeiten-/Vorschau-Umschalter)
- [x] Links mit `[[Notizname]]` – fehlende Notizen werden beim Antippen angelegt
- [x] Backlinks unter jeder Notiz
- [x] Tags (`#tag`) und Volltextsuche
- [x] Tägliche Notiz (Titel = Datum `TT.MM.JJJJ`)
- [x] Großer Plus-Button für Schnellerfassung
- [x] Button „Aus Zwischenablage einfügen“ (iOS-PWAs erscheinen nicht im Teilen-Menü);
      URLs als klickbare Links speichern
- [x] Backup: Export als JSON + ZIP mit Markdown-Dateien, Import aus JSON (mit Rückfrage)
- [x] Hinweis, wenn das letzte Backup älter als 14 Tage ist

Zusätzlich gebaut: Lebensbereich-Filter in jeder Ansicht, Verschieben zwischen
den Bereichen, Speicheranzeige, Hinweis auf neue App-Version.

### Phase 2 – Ausbau

**Phase 2a – Alltag**
- [x] Vorlagen: Projekt, Gesprächsnotiz, Lernkarte (`{{date}}`, `{{time}}`, `{{title}}`);
      Plus-Button lange drücken öffnet die Auswahl, zusätzlich im ⋯-Menü
- [x] Wiedervorlage mit Fälligkeitsdatum (**nur Datum, keine Uhrzeit**),
      Startseite zeigt die fälligen Notizen, Zähler am Inbox-Tab
- [x] Erinnerungen: Button „Im Kalender erinnern“ erzeugt `.ics`-Datei mit Alarm
      um **9:00 Uhr** (Titel = Notiztitel, Link zur Notiz in der Beschreibung)

**Phase 2b – Lernen und Medien**
- [x] Lernkarten: **mehrere Karten pro Notiz, Trennzeichen `::`**
      (`Deckungsbeitrag :: Umsatz minus variable Kosten`).
      Antwort erst nach Tippen, Bewertung Nochmal / Schwer / Gut / Leicht,
      vereinfachtes SM-2, Anzeige „X Karten heute fällig“
- [x] Anhänge: Fotos (Kamera/Mediathek) und PDFs; Bilder auf 1600 px verkleinert
- [x] Sprachmemos als Anhang (MediaRecorder); Diktat als Text über iPhone-Tastatur
- [x] **ZIP ist das Vollbackup:** Notizen, Lernstand und Anhänge,
      Import auch aus ZIP. JSON bleibt, enthält aber keine Anhang-Dateien
- [x] Speicherverbrauch in den Einstellungen anzeigen *(schon in Phase 1 erledigt)*

**So entstehen Lernkarten:** Jede Zeile mit `::` in einer Notiz wird eine Karte.
Der Lernstand hängt an der **Vorderseite** – die Rückseite ändern ist gefahrlos,
die Karte behält ihren Rhythmus. Wird die Vorderseite geändert, zählt sie als
neue Karte.

**Technisch:** Datenbank-Version 2 brachte das Feld `due` (Wiedervorlage),
Version 3 die Speicher `cards` und `attachments` – jeweils rein ergänzend,
bestehende Notizen werden nicht umgeschrieben.

**Grenze der Kalender-Erinnerung:** Die `.ics` erzeugt einen einmaligen
Kalendereintrag. Wird die Wiedervorlage später in der App geändert, ändert sich
der Kalendertermin **nicht** mit. Echte Push-Benachrichtigungen wären die
saubere Lösung – siehe „Optional später“.

### Phase 3 – Synchronisation mit dem Windows-PC

**Drei Grenzen, die alles entscheiden:**
1. Eine iOS-PWA darf **nicht in Ordner schreiben** – nur Datei auswählen
   (Import) und Teilen-Menü (Export). Direkter Zugriff auf iCloud Drive
   ist nicht möglich.
2. Eine HTTPS-Seite darf **keine HTTP-Adresse** ansprechen. Die App auf
   GitHub Pages kann einen PC im Heimnetz (`http://192.168.x.x`) also
   nicht erreichen – Safari blockiert das.
3. **Kein Hintergrund-Abgleich** in Safari. Synchronisiert wird nur,
   solange die App offen ist.

**Verglichen wurde:**

| | Aufwand | Kosten | Datenschutz | Zuverlässigkeit | Überall |
|---|---|---|---|---|---|
| A Manuell per Datei | gering | 0 € | sehr hoch | hängt am Nutzer | ja |
| B Server im Heimnetz | hoch | 0 € | sehr hoch | gering | **nein** |
| C Cloud, Ende-zu-Ende | hoch | 0 € | hoch | gut | ja |
| D Umstieg auf Obsidian | – | 0 € | mittel | mittel | ja |

- **B verworfen:** scheitert an Grenze 2 (Zertifikat nötig), PC muss laufen,
  funktioniert nur zu Hause.
- **D nicht nötig:** Der ZIP-Export erzeugt bereits Obsidian-taugliche
  Markdown-Dateien. Die Tür steht also offen, ohne jetzt zu wechseln.
  (Obsidian ist seit Februar 2025 auch für die Arbeit kostenlos.)
- **C vorgemerkt:** Cloudflare R2 bietet 10 GB kostenlos – für eine Person
  weit ausreichend. Verschlüsselung im Browser, Anbieter sieht nur
  Kauderwelsch. Offen: Passwort darf nie vergessen werden.

**Entschieden:** in zwei Stufen. Stufe 1 (Datei) zuerst, Stufe 2 (Cloud)
nur, wenn sich Stufe 1 als zu umständlich erweist.

**Stufe 1 – Übertragen per Datei**
- [x] Eigener Bildschirm „Übertragen" statt vergraben in den Einstellungen
- [x] Gerätename (iPhone / PC), erscheint in Konflikt-Kopien
- [x] **Konflikt-Sicherung:** Wurde dieselbe Notiz auf beiden Geräten seit
      der letzten Übertragung geändert, gewinnt die neuere – die
      unterlegene bleibt als Kopie „Titel (Konflikt vom PC, 11.10.)".
      Es geht nie etwas verloren.
- [x] Bericht nach dem Einlesen: neu / aktualisiert / unverändert / Konflikte
- [x] „Zuletzt übertragen" sichtbar

**Stufe 2 – Cloud, Ende-zu-Ende-verschlüsselt** (geplant, noch nicht gebaut)
- [ ] Eigener Plan vor dem Bau: Verschlüsselung, Konfliktregeln, Passwort-Handhabung
- [ ] Die Regeln aus `sync.js` werden wiederverwendet

### Optional später
- [ ] Echte Push-Benachrichtigungen über einen kostenlosen Cloudflare Worker
      (dort nur Uhrzeit + Erinnerungstext speichern, **keine Notizinhalte**) – eigene Phase mit Plan

---

## Vorlagen (Inhalt)

**Projekt:** Ziel · Nächste Schritte (Checkboxen) · Beteiligte · Notizen & Entscheidungen · Links
**Gesprächsnotiz:** Datum/Uhrzeit · Mit · Firma · Anlass · Besprochen · Vereinbart (Wer/Was/Bis wann) · Offene Fragen · Nächster Kontakt
**Lernkarte:** Fach · Thema · Fragen mit verdeckter Antwort · Merksatz · Praxisbeispiel

---

## Lokal testen (Windows)

Auf dem PC ist weder Python noch Node installiert, darum liegt ein kleiner
Testserver als PowerShell-Skript im Ordner:

1. Rechtsklick auf **`serve.ps1`** → **„Mit PowerShell ausführen“**
   (oder im Terminal: `powershell -ExecutionPolicy Bypass -File serve.ps1`)
2. Im Browser öffnen: **http://localhost:8080**
3. Beenden mit **Strg + C**

Anderer Port, falls 8080 belegt ist: `.\serve.ps1 -Port 8081`

(Service Worker funktionieren nur über `http://localhost` oder `https://`, nicht per Doppelklick auf `index.html`.)

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Grundgerüst, Tab-Leiste, lädt alles andere |
| `style.css` | Aussehen, Hell/Dunkel, iPhone-Abstände |
| `db.js` | Speicherung in IndexedDB **(Migrationen hier!)** |
| `markdown.js` | Markdown, `[[Links]]`, `#tags` |
| `share.js` | Datei ans Teilen-Menü bzw. in den Download geben |
| `sync.js` | Abgleich zweier Geräte **(Konfliktregeln hier)** |
| `flashcards.js` | Karten aus `::`-Zeilen, Wiederholungsabstände (SM-2) |
| `attachments.js` | Fotos verkleinern, PDFs, Sprachmemo-Aufnahme |
| `backup.js` | Export JSON/ZIP, Import |
| `templates.js` | Vorlagen **(neue Vorlage hier ergänzen)** |
| `reminders.js` | Kalender-Erinnerung als `.ics` |
| `learn.js` | Lernmodus |
| `app.js` | Oberfläche, Navigation, Editor |
| `sw.js` | Offline-Betrieb **(Version hochzählen!)** |
| `serve.ps1` | Testserver für Windows |

## Veröffentlichen & installieren

Repository und GitHub Pages sind eingerichtet. Neue Änderungen hochladen:

```
git add -A
git commit -m "Was geändert wurde"
git push
```

Nach ein bis zwei Minuten ist die neue Fassung unter
https://f2bcmzmwk5-a11y.github.io/Second-Brain/ live.

Auf dem iPhone installieren:
1. Adresse in **Safari** öffnen (nicht Chrome – dort fehlt „Zum Home-Bildschirm“)
2. Teilen-Symbol → **„Zum Home-Bildschirm“**
3. Ab jetzt nur noch über das Home-Bildschirm-Symbol öffnen
   (Safari und installierte App haben **getrennte** Speicher!)

## Updates einspielen

- Bei jeder Änderung die Version im Service Worker hochzählen.
- Datenbank-Änderungen nur mit Migration – bestehende Notizen bleiben erhalten.
- Vor größeren Updates: **Backup exportieren.**

---

## ⚠️ Wichtig zu den Daten

- Die Notizen liegen **nur** auf dem iPhone (in der installierten App).
- **App vom Home-Bildschirm löschen = Daten weg.** Vorher immer exportieren.
- Regelmäßig Backup (ZIP) exportieren und auf PC oder USB-Stick sichern.
- **Für die Sicherung immer ZIP nehmen.** Nur das ZIP enthält Fotos,
  PDFs und Sprachmemos. JSON hat Notizen und Lernstand, aber keine Anhänge.

---

## Status

- [x] Phase 1 geplant
- [x] Phase 1 umgesetzt und auf dem PC getestet (10.10.2026)
- [x] Veröffentlicht auf GitHub Pages (11.10.2026)
- [x] Phase 1 auf dem iPhone installiert und getestet (11.10.2026)
- [x] Phase 2 geplant und entschieden (siehe Phase 2a / 2b oben)
- [x] Phase 2a umgesetzt und auf dem PC getestet (11.10.2026)
- [x] Phase 2b umgesetzt und auf dem PC getestet (11.10.2026)
- [ ] Phase 2 auf dem iPhone getestet (Kalender, Kamera, Mikrofon!)
- [x] Phase 3: Sync-Lösung entschieden (11.10.2026) – zweistufig
- [x] Phase 3 Stufe 1 umgesetzt und auf dem PC getestet (11.10.2026)
- [ ] Phase 3 Stufe 1 im Alltag erprobt – dann entscheiden, ob Stufe 2 nötig ist

**Aktuelle Service-Worker-Version:** `v1.3.0`
**Aktuelle Datenbank-Version:** `3` (unverändert – Stufe 1 brauchte keine Migration)
