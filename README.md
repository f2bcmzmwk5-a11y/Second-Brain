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
- [ ] Vorlagen: Projekt, Gesprächsnotiz, Lernkarte (`{{date}}`, `{{title}}` ersetzen);
      Plus-Button lange drücken öffnet die Auswahl
- [ ] Wiedervorlage mit Fälligkeitsdatum (**nur Datum, keine Uhrzeit**),
      Startseite zeigt „Heute fällig“
- [ ] Erinnerungen: Button „Im Kalender erinnern“ erzeugt `.ics`-Datei mit Alarm
      um **9:00 Uhr** (Titel = Notiztitel, Link zur Notiz in der Beschreibung)
      – nur in der installierten App testbar

**Phase 2b – Lernen und Medien**
- [ ] Lernkarten: **mehrere Karten pro Notiz, Trennzeichen `::`**
      (`Deckungsbeitrag :: Umsatz minus variable Kosten`).
      Antwort erst nach Tippen, Bewertung Nochmal / Schwer / Gut / Leicht,
      vereinfachtes SM-2, Anzeige „X Karten heute fällig“
- [ ] Anhänge: Fotos (Kamera/Mediathek) und PDFs; Bilder vor dem Speichern verkleinern
- [ ] Sprachmemos als Anhang (MediaRecorder); Diktat als Text über iPhone-Tastatur
      → Eingabefelder groß gestalten
- [ ] **ZIP wird Vollbackup:** Anhänge mitsichern **und Import auch aus ZIP.**
      JSON bleibt, warnt aber, dass Anhänge fehlen
- [x] Speicherverbrauch in den Einstellungen anzeigen *(schon in Phase 1 erledigt)*

**Technisch:** Datenbank auf Version 2 (neue Speicher `anhaenge` und `karten`,
Feld `due`) – rein ergänzend, bestehende Notizen werden nicht umgeschrieben.

**Grenze der Kalender-Erinnerung:** Die `.ics` erzeugt einen einmaligen
Kalendereintrag. Wird die Wiedervorlage später in der App geändert, ändert sich
der Kalendertermin **nicht** mit. Echte Push-Benachrichtigungen wären die
saubere Lösung – siehe „Optional später“.

### Phase 3 – Synchronisation mit dem Windows-PC
Vor der Umsetzung eigenen Plan erstellen und ehrlich vergleichen
(Aufwand, Kosten, Datenschutz, Zuverlässigkeit, Konfliktlösung):
- Manueller Abgleich per Export/Import
- Eigener kleiner Sync-Server auf dem PC im Heimnetz
- Ende-zu-Ende-verschlüsselter Sync über einen Cloud-Dienst
- Umstieg auf Obsidian-kompatible Markdown-Dateien (iCloud-Vault)

→ Empfehlung abgeben, **erst nach Freigabe bauen.**

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
| `backup.js` | Export JSON/ZIP, Import |
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

---

## Status

- [x] Phase 1 geplant
- [x] Phase 1 umgesetzt und auf dem PC getestet (10.10.2026)
- [ ] Phase 1 auf dem iPhone getestet
- [ ] Phase 2 geplant
- [ ] Phase 2 umgesetzt
- [ ] Phase 3: Sync-Lösung entschieden

**Aktuelle Service-Worker-Version:** `v1.0.1`
