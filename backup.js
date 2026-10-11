/* ==========================================================================
   backup.js – Sichern und Wiederherstellen

   JSON  = vollstaendige Sicherung, kann wieder importiert werden.
   ZIP   = eine .md-Datei pro Notiz (zum Lesen auf dem PC / in Obsidian)
           plus die JSON-Sicherung darin.

   Auf dem iPhone funktioniert "Datei herunterladen" in einer installierten
   PWA nicht zuverlaessig. Darum wird zuerst das Teilen-Menue benutzt
   (dort: "In Dateien speichern").
   ========================================================================== */

window.Backup = (function () {
  'use strict';

  var FORMAT = 1;
  var JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';

  function stamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           '_' + p(d.getHours()) + p(d.getMinutes());
  }

  /* ---------- Datei an den Nutzer uebergeben ---------- */

  function deliver(filename, blob) {
    var file = null;
    try {
      file = new File([blob], filename, { type: blob.type });
    } catch (e) { /* aeltere Browser kennen File() nicht */ }

    // 1. Weg: Teilen-Menue (iPhone)
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: filename })
        .then(function () { return 'geteilt'; })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return 'abgebrochen';
          return download(filename, blob);
        });
    }

    // 2. Weg: normaler Download (PC)
    return Promise.resolve(download(filename, blob));
  }

  function download(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 20000);
    return 'gespeichert';
  }

  /* ---------- JSON-Export ---------- */

  function buildJson() {
    return Promise.all([DB.listAll(), DB.allMeta()]).then(function (res) {
      var notes = res[0];
      var meta = res[1];
      return {
        app: 'second-brain',
        format: FORMAT,
        exportedAt: new Date().toISOString(),
        noteCount: notes.length,
        meta: meta,
        notes: notes
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

  // Dateinamen muessen auf Windows und Mac funktionieren.
  function safeName(title, id) {
    var base = String(title || 'ohne-titel')
      .replace(/[\\/:*?"<>|#\n\r\t]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    if (!base || base === '-') base = 'ohne-titel';
    return base + ' (' + String(id).slice(0, 6) + ').md';
  }

  function toMarkdownFile(note) {
    var fm = [
      '---',
      'titel: ' + JSON.stringify(note.title || ''),
      'bereich: ' + (note.section || 'inbox'),
      'lebensbereich: ' + (note.area || ''),
      'tags: [' + (note.tags || []).join(', ') + ']',
      'erstellt: ' + new Date(note.created || Date.now()).toISOString(),
      'geaendert: ' + new Date(note.updated || Date.now()).toISOString(),
      'id: ' + note.id,
      '---',
      ''
    ].join('\n');
    return fm + '# ' + (note.title || '') + '\n\n' + (note.body || '') + '\n';
  }

  function exportZip() {
    return Promise.all([loadJsZip(), buildJson()]).then(function (res) {
      var JSZipLib = res[0];
      var data = res[1];
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

      zip.file('LIESMICH.txt',
        'Sicherung der App "Second Brain"\n' +
        'Erstellt: ' + new Date().toLocaleString('de-DE') + '\n' +
        'Notizen: ' + data.noteCount + '\n\n' +
        'Ordner "notizen": je Notiz eine Markdown-Datei – nur zum Lesen.\n' +
        'Datei "second-brain.json": diese Datei in der App unter\n' +
        'Menue > Einstellungen > Import wieder einlesen.\n');

      return zip.generateAsync({ type: 'blob' }).then(function (blob) {
        return deliver('second-brain_' + stamp() + '.zip', blob)
          .then(function (how) {
            return markBackedUp().then(function () {
              return { how: how, count: data.noteCount };
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

    return {
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
  }

  // Liest die Datei und prueft sie, ohne etwas zu speichern.
  function inspect(file) {
    return readFile(file).then(function (text) {
      var data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('Das ist keine gueltige JSON-Sicherung.');
      }
      if (!data || !Array.isArray(data.notes)) {
        throw new Error('In der Datei sind keine Notizen enthalten.');
      }
      if (data.app && data.app !== 'second-brain') {
        throw new Error('Die Datei gehoert zu einer anderen App.');
      }

      var notes = data.notes.map(cleanNote).filter(Boolean);
      if (!notes.length) throw new Error('Keine lesbaren Notizen gefunden.');

      return {
        notes: notes,
        meta: data.meta && typeof data.meta === 'object' ? data.meta : null,
        exportedAt: data.exportedAt || null,
        skipped: data.notes.length - notes.length
      };
    });
  }

  // mode: 'merge' (dazu) oder 'replace' (alles ersetzen)
  function apply(parsed, mode) {
    if (mode === 'replace') {
      return DB.replaceAll(parsed.notes, null).then(function (n) {
        return { mode: 'replace', total: n };
      });
    }
    return DB.mergeAll(parsed.notes).then(function (r) {
      r.mode = 'merge';
      return r;
    });
  }

  /* ---------- Erinnerung an das naechste Backup ---------- */

  var MAX_AGE_DAYS = 14;

  function markBackedUp() {
    return DB.setMeta('lastBackup', Date.now());
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
