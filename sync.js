/* ==========================================================================
   sync.js – Abgleich zwischen zwei Geraeten

   Stufe 1: ueber eine Datei (ZIP oder JSON), die du selbst hin und her
   traegst. Die Regeln hier gelten spaeter genauso, wenn der Abgleich
   automatisch laeuft - darum stecken sie in einer eigenen Datei.

   Grundregel: Bei derselben Notiz gewinnt die neuere Fassung.
   ABER: Wurde sie auf BEIDEN Geraeten seit der letzten Uebertragung
   geaendert, bleibt die unterlegene Fassung als Kopie erhalten.
   Es geht also nie etwas verloren.
   ========================================================================== */

window.Sync = (function () {
  'use strict';

  /* ---------- Geraetename ---------- */

  function guessDevice() {
    var ua = navigator.userAgent || '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/Mac/.test(ua)) return 'Mac';
    return 'PC';
  }

  function deviceName() {
    return DB.getMeta('deviceName', null).then(function (name) {
      if (name) return name;
      var geraten = guessDevice();
      return DB.setMeta('deviceName', geraten).then(function () { return geraten; });
    });
  }

  function setDeviceName(name) {
    return DB.setMeta('deviceName', String(name || '').trim() || guessDevice());
  }

  /* ---------- Zeitpunkt der letzten Uebertragung ---------- */

  function lastSync() { return DB.getMeta('lastSync', 0); }
  function markSynced() { return DB.setMeta('lastSync', Date.now()); }

  /* ---------- Vergleich ---------- */

  // Zaehlt nur, was der Nutzer sieht - "updated" allein reicht nicht,
  // weil schon ein Oeffnen den Zeitstempel verschieben kann.
  function sameContent(a, b) {
    return a.title === b.title &&
           a.body === b.body &&
           a.section === b.section &&
           (a.area || '') === (b.area || '') &&
           (a.due || 0) === (b.due || 0);
  }

  function conflictTitle(note, fremdesGeraet) {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    var basis = note.title.trim() || '(ohne Titel)';
    return basis + ' (Konflikt vom ' + fremdesGeraet + ', ' +
           p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.)';
  }

  /**
   * Fuehrt eingelesene Notizen mit den vorhandenen zusammen.
   * @param parsed  Ergebnis von Backup.inspect()
   * @returns Bericht { added, updated, unchanged, conflicts: [Titel] }
   */
  function merge(parsed) {
    var fremdesGeraet = parsed.device || 'anderen Gerät';

    return Promise.all([lastSync(), deviceName()]).then(function (r) {
      var seit = r[0];
      var eigenesGeraet = r[1];
      var bericht = { added: 0, updated: 0, unchanged: 0, conflicts: [] };

      return parsed.notes.reduce(function (kette, eingehend) {
        return kette.then(function () {
          return DB.get(eingehend.id).then(function (vorhanden) {

            // Ganz neue Notiz
            if (!vorhanden) {
              bericht.added++;
              return DB.save(eingehend);
            }

            // Inhaltlich gleich - nichts zu tun
            if (sameContent(vorhanden, eingehend)) {
              bericht.unchanged++;
              return;
            }

            var hierGeaendert = (vorhanden.updated || 0) > seit;
            var dortGeaendert = (eingehend.updated || 0) > seit;

            // Beide Seiten geaendert: die unterlegene Fassung retten
            if (hierGeaendert && dortGeaendert) {
              var neuer = (eingehend.updated || 0) >= (vorhanden.updated || 0)
                            ? eingehend : vorhanden;
              var unterlegen = neuer === eingehend ? vorhanden : eingehend;

              var kopie = {
                id: DB.uid(),
                title: conflictTitle(unterlegen,
                         unterlegen === eingehend ? fremdesGeraet : eigenesGeraet),
                body: unterlegen.body,
                section: unterlegen.section,
                area: unterlegen.area || '',
                created: unterlegen.created || Date.now(),
                updated: Date.now()
              };
              if (unterlegen.due) kopie.due = unterlegen.due;

              bericht.conflicts.push(kopie.title);
              bericht.updated++;

              return DB.save(kopie).then(function () {
                neuer.id = vorhanden.id;
                return DB.save(neuer);
              });
            }

            // Nur eine Seite geaendert: die neuere gewinnt still
            if ((eingehend.updated || 0) > (vorhanden.updated || 0)) {
              bericht.updated++;
              return DB.save(eingehend);
            }

            bericht.unchanged++;
          });
        });
      }, Promise.resolve()).then(function () {
        return bericht;
      });
    });
  }

  return {
    deviceName: deviceName,
    setDeviceName: setDeviceName,
    guessDevice: guessDevice,
    lastSync: lastSync,
    markSynced: markSynced,
    merge: merge,
    sameContent: sameContent
  };
})();
