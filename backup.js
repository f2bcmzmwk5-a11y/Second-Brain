/* ==========================================================================
   backup.js – Sichern und Wiederherstellen

   JSON  = vollstaendige Sicherung, kann wieder importiert werden.
   ZIP   = eine .md-Datei pro Notiz (zum Lesen auf dem PC / in Obsidian)
           plus die JSON-Sicherung darin.

   Die Uebergabe der fertigen Datei (Teilen-Menue bzw. Download) steckt
   in share.js und wird auch von der Kalender-Erinnerung benutzt.
   ========================================================================== */

window.Backup = (function () {
  'use strict';

  // Format 2 enthaelt zusaetzlich Lernkarten und Anhang-Angaben.
  // Dateien aus Format 1 lassen sich weiterhin einlesen.
  var FORMAT = 2;
  var JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';

  var deliver = ShareFile.deliver;
  var stamp = ShareFile.stamp;

  /* ---------- JSON-Export ---------- */

  /**
   * Baut den Inhalt der Sicherung.
   * Anhaenge kommen nur mit ihren Angaben hinein (Name, Groesse, Typ) -
   * die eigentlichen Dateien liegen im ZIP daneben.
   */
  function buildJson() {
    return Promise.all([
      DB.listAll(), DB.allMeta(), DB.allCards(), DB.allAttachments(), Sync.deviceName()
    ]).then(function (res) {
      var notes = res[0];
      var meta = res[1];
      var cards = res[2];
      var device = res[4];
      var attachments = res[3].map(function (a) {
        return {
          id: a.id,
          noteId: a.noteId,
          name: a.name,
          type: a.type,
          size: a.size,
          created: a.created,
          file: 'anhaenge/' + a.id + '.' + Attachments.extensionFor(a)
        };
      });

      return {
        app: 'second-brain',
        format: FORMAT,
        exportedAt: new Date().toISOString(),
        device: device,
        noteCount: notes.length,
        meta: meta,
        notes: notes,
        cards: cards,
        attachments: attachments
      };
    });
  }

  function exportJson() {
    return buildJson().then(function (data) {
      var blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      });
      return deliver('second-brain_' + stamp() + '.json', blob)
        .then(function (how) {
          return markBackedUp().then(function () {
            return { how: how, count: data.noteCount };
          });
        });
    });
  }

  /* ---------- ZIP-Export ---------- */

  function loadJsZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = JSZIP_URL;
      s.crossOrigin = 'anonymous';
      s.onload = function () {
        window.JSZip ? resolve(window.JSZip)
                     : reject(new Error('JSZip konnte nicht geladen werden.'));
      };
      s.onerror = function () {
        reject(new Error('JSZip ist nicht verfuegbar (keine Verbindung?). ' +
                         'Der JSON-Export funktioniert trotzdem.'));
      };
      document.head.appendChild(s);
    });
  }

  function safeName(title, id) {
    return ShareFile.safeName(title, 'ohne-titel') +
           ' (' + String(id).slice(0, 6) + ').md';
  }

  function toMarkdownFile(note) {
    var fm = [
      '---',
      'titel: ' + JSON.stringify(note.title || ''),
      'bereich: ' + (note.section || 'inbox'),
      'lebensbereich: ' + (note.area || ''),
      'tags: [' + (note.tags || []).join(', ') + ']',
      'wiedervorlage: ' + (note.due ? new Date(note.due).toISOString().slice(0, 10) : ''),
      'erstellt: ' + new Date(note.created || Date.now()).toISOString(),
      'geaendert: ' + new Date(note.updated || Date.now()).toISOString(),
      'id: ' + note.id,
      '---',
      ''
    ].join('\n');
    return fm + '# ' + (note.title || '') + '\n\n' + (note.body || '') + '\n';
  }

  // Vollstaendige Sicherung: Notizen, Lernstand UND die Anhang-Dateien.
  function exportZip() {
    return Promise.all([loadJsZip(), buildJson(), DB.allAttachments()])
      .then(function (res) {
        var JSZipLib = res[0];
        var data = res[1];
        var dateien = res[2];
        var zip = new JSZipLib();

        zip.file('second-brain.json', JSON.stringify(data, null, 2));

        var folder = zip.folder('notizen');
        var used = {};
        data.notes.forEach(function (note) {
          var name = safeName(note.title, note.id);
          while (used[name]) name = name.replace(/\.md$/, '') + '_.md';
          used[name] = 1;
          folder.folder(note.section || 'inbox').file(name, toMarkdownFile(note));
        });

        // Anhaenge unter ihrer Kennung ablegen, damit der Import sie
        // wieder der richtigen Notiz zuordnen kann.
        dateien.forEach(function (a) {
          zip.file('anhaenge/' + a.id + '.' + Attachments.extensionFor(a), a.blob);
        });

        zip.file('LIESMICH.txt',
          'Vollstaendige Sicherung der App "Second Brain"\n' +
          'Erstellt: ' + new Date().toLocaleString('de-DE') + '\n' +
          'Notizen: ' + data.noteCount + '\n' +
          'Lernkarten: ' + data.cards.length + '\n' +
          'Anhaenge: ' + dateien.length + '\n\n' +
          'Ordner "notizen": je Notiz eine Markdown-Datei - nur zum Lesen.\n' +
          'Ordner "anhaenge": Fotos, PDFs und Sprachmemos.\n' +
          'Datei "second-brain.json": der eigentliche Datenbestand.\n\n' +
          'Zum Wiederherstellen das GANZE ZIP in der App unter\n' +
          'Menue > Einstellungen > Import einlesen - dann kommen auch\n' +
          'Lernstand und Anhaenge zurueck.\n');

        return zip.generateAsync({ type: 'blob' }).then(function (blob) {
          return deliver('second-brain_' + stamp() + '.zip', blob)
            .then(function (how) {
              return markBackedUp().then(function () {
                return {
                  how: how,
                  count: data.noteCount,
                  attachments: dateien.length
                };
              });
            });
        });
      });
  }

  /* ---------- Import ---------- */

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(new Error('Datei konnte nicht gelesen werden.')); };
      r.readAsText(file);
    });
  }

  // Nur bekannte Felder uebernehmen, Fehlendes ergaenzen.
  function cleanNote(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = typeof raw.id === 'string' && raw.id ? raw.id : null;
    if (!id) return null;

    var title = typeof raw.title === 'string' ? raw.title : '';
    var body = typeof raw.body === 'string' ? raw.body : '';
    var created = Number(raw.created) || Date.now();
    var updated = Number(raw.updated) || created;

    var note = {
      id: id,
      title: title,
      titleKey: DB.titleKey(title),
      body: body,
      section: DB.SECTIONS.indexOf(raw.section) !== -1 ? raw.section : 'inbox',
      area: DB.AREAS.indexOf(raw.area) !== -1 ? raw.area : '',
      tags: MD.tags(body),
      links: MD.links(body).map(DB.titleKey),
      created: created,
      updated: updated
    };

    // Wiedervorlage nur uebernehmen, wenn sie ein gueltiges Datum ist
    if (typeof raw.due === 'number' && isFinite(raw.due)) {
      note.due = DB.startOfDay(raw.due);
    }

    return note;
  }

  function cleanCard(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.id !== 'string' || !raw.id) return null;
    if (typeof raw.noteId !== 'string' || !raw.noteId) return null;
    if (typeof raw.front !== 'string' || !raw.front) return null;

    return {
      id: raw.id,
      noteId: raw.noteId,
      key: String(raw.key || raw.front).trim().toLowerCase().replace(/\s+/g, ' '),
      front: raw.front,
      back: typeof raw.back === 'string' ? raw.back : '',
      order: Number(raw.order) || 0,
      ease: Number(raw.ease) || 2.5,
      interval: Number(raw.interval) || 0,
      reps: Number(raw.reps) || 0,
      lapses: Number(raw.lapses) || 0,
      due: Number(raw.due) || DB.startOfDay(Date.now()),
      created: Number(raw.created) || Date.now(),
      updated: Number(raw.updated) || Date.now()
    };
  }

  function parsePayload(data) {
    if (!data || !Array.isArray(data.notes)) {
      throw new Error('In der Datei sind keine Notizen enthalten.');
    }
    if (data.app && data.app !== 'second-brain') {
      throw new Error('Die Datei gehoert zu einer anderen App.');
    }

    var notes = data.notes.map(cleanNote).filter(Boolean);
    if (!notes.length) throw new Error('Keine lesbaren Notizen gefunden.');

    var ids = {};
    notes.forEach(function (n) { ids[n.id] = true; });

    // Karten und Anhaenge nur, wenn ihre Notiz auch dabei ist
    var cards = (Array.isArray(data.cards) ? data.cards : [])
      .map(cleanCard).filter(function (c) { return c && ids[c.noteId]; });

    var attachments = (Array.isArray(data.attachments) ? data.attachments : [])
      .filter(function (a) {
        return a && typeof a.id === 'string' && ids[a.noteId];
      });

    return {
      notes: notes,
      cards: cards,
      attachments: attachments,
      meta: data.meta && typeof data.meta === 'object' ? data.meta : null,
      exportedAt: data.exportedAt || null,
      device: typeof data.device === 'string' ? data.device : null,
      format: Number(data.format) || 1,
      skipped: data.notes.length - notes.length,
      files: null        // wird beim ZIP gefuellt
    };
  }

  // Liest JSON oder ZIP und prueft den Inhalt, ohne etwas zu speichern.
  function inspect(file) {
    var istZip = /\.zip$/i.test(file.name || '') ||
                 /zip/.test(file.type || '');

    if (!istZip) {
      return readFile(file).then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error('Das ist weder eine JSON- noch eine ZIP-Sicherung.');
        }
        return parsePayload(data);
      });
    }

    return loadJsZip().then(function (JSZipLib) {
      return JSZipLib.loadAsync(file);
    }).then(function (zip) {
      var eintrag = zip.file('second-brain.json');
      if (!eintrag) {
        throw new Error('Im ZIP fehlt die Datei "second-brain.json". ' +
                        'Stammt das Archiv aus dieser App?');
      }
      return eintrag.async('string').then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error('Die Daten im ZIP sind beschaedigt.');
        }
        var parsed = parsePayload(data);
        parsed.files = zip;
        return parsed;
      });
    });
  }

  // Holt die Anhang-Dateien aus dem ZIP zurueck in die Datenbank.
  function restoreAttachments(parsed) {
    if (!parsed.files || !parsed.attachments.length) return Promise.resolve(0);

    return parsed.attachments.reduce(function (kette, a) {
      return kette.then(function (n) {
        var pfad = a.file || ('anhaenge/' + a.id);
        var eintrag = parsed.files.file(pfad);

        // Falls die Endung abweicht: nach der Kennung suchen
        if (!eintrag) {
          var treffer = parsed.files.file(new RegExp('anhaenge/' + a.id + '\\.'));
          eintrag = treffer && treffer.length ? treffer[0] : null;
        }
        if (!eintrag) return n;

        return eintrag.async('blob').then(function (blob) {
          return DB.putAttachment({
            id: a.id,
            noteId: a.noteId,
            name: a.name || 'Anhang',
            type: a.type || blob.type || 'application/octet-stream',
            size: blob.size,
            created: Number(a.created) || Date.now(),
            blob: blob
          }).then(function () { return n + 1; });
        });
      });
    }, Promise.resolve(0));
  }

  // mode: 'merge' (dazu) oder 'replace' (alles ersetzen)
  function apply(parsed, mode) {
    var schritt;

    if (mode === 'replace') {
      schritt = DB.replaceAll(parsed.notes, null).then(function (n) {
        return { mode: 'replace', total: n };
      });
    } else {
      // Zusammenfuehren mit Konflikt-Sicherung (sync.js)
      schritt = Sync.merge(parsed).then(function (r) {
        r.mode = 'merge';
        return r;
      });
    }

    return schritt.then(function (ergebnis) {
      // Lernstand zuerst zurueckschreiben, danach erst abgleichen -
      // sonst wuerden die Karten als neu angelegt.
      var karten = parsed.cards.reduce(function (kette, c) {
        return kette.then(function () { return DB.putCard(c); });
      }, Promise.resolve());

      return karten
        .then(function () { return restoreAttachments(parsed); })
        .then(function (anzahl) {
          ergebnis.attachments = anzahl;
          ergebnis.cards = parsed.cards.length;
          // Karten mit dem Notiztext abgleichen (neue Zeilen, geloeschte)
          return Cards.syncAll();
        })
        .then(function () { return Sync.markSynced(); })
        .then(function () { return ergebnis; });
    });
  }

  /* ---------- Erinnerung an das naechste Backup ---------- */

  var MAX_AGE_DAYS = 14;

  // Ein Export ist zugleich der Stand, auf dem beide Geraete zuletzt
  // uebereinstimmten - darum wird auch der Abgleichs-Zeitpunkt gesetzt.
  function markBackedUp() {
    return DB.setMeta('lastBackup', Date.now()).then(function () {
      return Sync.markSynced();
    });
  }

  function status() {
    return DB.getMeta('lastBackup', 0).then(function (last) {
      return DB.count().then(function (count) {
        var days = last ? Math.floor((Date.now() - last) / 86400000) : null;
        return {
          last: last || null,
          days: days,
          count: count,
          // Erinnerung erst, wenn ueberhaupt Notizen vorhanden sind
          overdue: count > 0 && (!last || days >= MAX_AGE_DAYS)
        };
      });
    });
  }

  return {
    exportJson: exportJson,
    exportZip: exportZip,
    inspect: inspect,
    apply: apply,
    status: status,
    markBackedUp: markBackedUp,
    MAX_AGE_DAYS: MAX_AGE_DAYS
  };
})();
