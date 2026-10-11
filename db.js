/* ==========================================================================
   db.js – Speicherung in IndexedDB
   Alles bleibt auf dem Geraet. Kein Server, kein Login.

   WICHTIG bei Aenderungen an der Datenstruktur:
   DB_VERSION hochzaehlen und in migrate() einen neuen "if (oldVersion < N)"
   Block ergaenzen. Vorhandene Bloecke NIE aendern oder loeschen – sonst
   verlieren Geraete, die eine alte Version haben, ihre Notizen.
   ========================================================================== */

window.DB = (function () {
  'use strict';

  var DB_NAME = 'second-brain';
  var DB_VERSION = 2;

  var SECTIONS = ['inbox', 'projekte', 'wissen', 'archiv'];
  var AREAS = ['arbeit', 'fachwirt', 'privat', 'ideen'];

  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        migrate(req.result, e.oldVersion, req.transaction);
      };
      req.onsuccess = function () {
        var db = req.result;
        // Wird die App in einem anderen Tab aktualisiert, muss diese
        // Verbindung weichen - sonst blockiert sie die Migration.
        db.onversionchange = function () {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () {
        reject(new Error('Datenbank blockiert – bitte andere Tabs der App schliessen.'));
      };
    });
    return dbPromise;
  }

  function migrate(db, oldVersion, tx) {
    if (oldVersion < 1) {
      var notes = db.createObjectStore('notes', { keyPath: 'id' });
      notes.createIndex('titleKey', 'titleKey');
      notes.createIndex('section', 'section');
      notes.createIndex('area', 'area');
      notes.createIndex('updated', 'updated');
      notes.createIndex('tags', 'tags', { multiEntry: true });
      notes.createIndex('links', 'links', { multiEntry: true });

      db.createObjectStore('meta', { keyPath: 'key' });
    }

    if (oldVersion < 2) {
      // Wiedervorlage: Feld "due" (Zeitstempel, 0:00 Uhr des Tages).
      // Nur ein zusaetzlicher Index - vorhandene Notizen werden nicht
      // angefasst. Notizen ohne Datum tauchen im Index gar nicht auf.
      var store = tx.objectStore('notes');
      if (!store.indexNames.contains('due')) store.createIndex('due', 'due');
    }

    // if (oldVersion < 3) { ... hier spaetere Aenderungen ... }
  }

  /* ---------- kleine Helfer um IndexedDB herum ---------- */

  function tx(store, mode) {
    return open().then(function (db) {
      return db.transaction(store, mode || 'readonly').objectStore(store);
    });
  }

  function wrap(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function get(store, key) {
    return tx(store).then(function (s) { return wrap(s.get(key)); });
  }

  function put(store, value) {
    return tx(store, 'readwrite').then(function (s) {
      return wrap(s.put(value)).then(function () { return value; });
    });
  }

  function del(store, key) {
    return tx(store, 'readwrite').then(function (s) { return wrap(s.delete(key)); });
  }

  function all(store) {
    return tx(store).then(function (s) { return wrap(s.getAll()); });
  }

  function allByIndex(store, index, key) {
    return tx(store).then(function (s) { return wrap(s.index(index).getAll(key)); });
  }

  /* ---------- Notizen ---------- */

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // Normalisierter Titel: dient dem Aufloesen von [[Verknuepfungen]]
  function titleKey(title) {
    return String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // Felder, die sich aus dem Text ergeben, werden beim Speichern neu berechnet.
  function derive(note) {
    note.titleKey = titleKey(note.title);
    note.tags = MD.tags(note.body);
    note.links = MD.links(note.body).map(titleKey);
    note.updated = Date.now();
    if (!note.created) note.created = note.updated;
    if (SECTIONS.indexOf(note.section) === -1) note.section = 'inbox';
    if (note.area && AREAS.indexOf(note.area) === -1) note.area = '';
    // Ungueltige Wiedervorlage ganz entfernen - IndexedDB kann null oder
    // undefined nicht als Schluessel ablegen.
    if (typeof note.due !== 'number' || !isFinite(note.due)) delete note.due;
    return note;
  }

  function blank(fields) {
    var note = {
      id: uid(),
      title: '',
      body: '',
      section: 'inbox',
      area: '',
      created: Date.now(),
      updated: Date.now()
    };
    if (fields) Object.keys(fields).forEach(function (k) { note[k] = fields[k]; });
    return derive(note);
  }

  function create(fields) {
    return put('notes', blank(fields));
  }

  function save(note) {
    return put('notes', derive(note));
  }

  function getNote(id) {
    return get('notes', id);
  }

  function remove(id) {
    return del('notes', id);
  }

  function listAll() {
    return all('notes').then(byNewest);
  }

  function listSection(section, area) {
    return allByIndex('notes', 'section', section).then(function (notes) {
      if (area) notes = notes.filter(function (n) { return n.area === area; });
      return byNewest(notes);
    });
  }

  function byNewest(notes) {
    return notes.sort(function (a, b) { return b.updated - a.updated; });
  }

  function findByTitle(title) {
    return allByIndex('notes', 'titleKey', titleKey(title)).then(function (hits) {
      return hits[0] || null;
    });
  }

  // Alle Notizen, die auf diese Notiz verweisen
  function backlinks(note) {
    if (!note.titleKey) return Promise.resolve([]);
    return allByIndex('notes', 'links', note.titleKey).then(function (hits) {
      return byNewest(hits.filter(function (n) { return n.id !== note.id; }));
    });
  }

  function listByTag(tag) {
    return allByIndex('notes', 'tags', String(tag).toLowerCase()).then(byNewest);
  }

  function allTags() {
    return all('notes').then(function (notes) {
      var counts = {};
      notes.forEach(function (n) {
        (n.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
      });
      return Object.keys(counts)
        .map(function (t) { return { tag: t, count: counts[t] }; })
        .sort(function (a, b) { return b.count - a.count || a.tag.localeCompare(b.tag); });
    });
  }

  // Volltextsuche ueber Titel, Text und Tags. Alle Suchwoerter muessen passen.
  function search(query, area) {
    var words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return Promise.resolve([]);

    return all('notes').then(function (notes) {
      var hits = notes.filter(function (n) {
        if (area && n.area !== area) return false;
        var haystack = (n.title + '\n' + n.body + '\n' + (n.tags || []).join(' ')).toLowerCase();
        return words.every(function (w) { return haystack.indexOf(w) !== -1; });
      });
      // Treffer im Titel zuerst
      var first = words[0];
      return hits.sort(function (a, b) {
        var at = a.title.toLowerCase().indexOf(first) !== -1 ? 1 : 0;
        var bt = b.title.toLowerCase().indexOf(first) !== -1 ? 1 : 0;
        return bt - at || b.updated - a.updated;
      });
    });
  }

  /* ---------- Wiedervorlage ---------- */

  // Wiedervorlagen sind tagesgenau: immer 0:00 Uhr des gewaehlten Tages.
  function startOfDay(d) {
    var x = new Date(d || Date.now());
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  }

  function addDays(ts, n) {
    var x = new Date(ts);
    x.setDate(x.getDate() + n);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  }

  // Ende des heutigen Tages - alles davor gilt als faellig.
  function endOfToday() {
    var x = new Date();
    x.setHours(23, 59, 59, 999);
    return x.getTime();
  }

  function dueNotes(until) {
    var range = IDBKeyRange.upperBound(until == null ? endOfToday() : until);
    return tx('notes').then(function (s) {
      return wrap(s.index('due').getAll(range));
    }).then(function (notes) {
      // Archiviertes soll nicht mehr auf der Startseite auftauchen
      return notes
        .filter(function (n) { return n.section !== 'archiv'; })
        .sort(function (a, b) { return a.due - b.due; });
    });
  }

  function dueCount(until) {
    return dueNotes(until).then(function (notes) { return notes.length; });
  }

  function setDue(note, ts) {
    if (ts == null) delete note.due;
    else note.due = startOfDay(ts);
    return save(note);
  }

  /* ---------- Taegliche Notiz ---------- */

  function dateTitle(d) {
    d = d || new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  // Holt die Notiz von heute oder legt sie an.
  function daily() {
    var title = dateTitle();
    return findByTitle(title).then(function (found) {
      if (found) return found;
      return create({ title: title, section: 'inbox', body: '' });
    });
  }

  /* ---------- Einstellungen / Merkwerte ---------- */

  function getMeta(key, fallback) {
    return get('meta', key).then(function (row) {
      return row ? row.value : fallback;
    });
  }

  function setMeta(key, value) {
    return put('meta', { key: key, value: value });
  }

  function allMeta() {
    return all('meta').then(function (rows) {
      var out = {};
      rows.forEach(function (r) { out[r.key] = r.value; });
      return out;
    });
  }

  /* ---------- Import / Export ---------- */

  // Ersetzt den gesamten Inhalt (nur beim Import mit "Alles ersetzen").
  function replaceAll(notes, meta) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(['notes', 'meta'], 'readwrite');
        var ns = t.objectStore('notes');
        ns.clear();
        notes.forEach(function (n) { ns.put(n); });
        if (meta) {
          var ms = t.objectStore('meta');
          Object.keys(meta).forEach(function (k) { ms.put({ key: k, value: meta[k] }); });
        }
        t.oncomplete = function () { resolve(notes.length); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  // Fuegt Notizen hinzu. Bei gleicher id gewinnt die neuere Fassung.
  function mergeAll(notes) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction('notes', 'readwrite');
        var ns = t.objectStore('notes');
        var added = 0, updated = 0, skipped = 0, pending = notes.length;

        if (!pending) { resolve({ added: 0, updated: 0, skipped: 0 }); return; }

        notes.forEach(function (incoming) {
          var r = ns.get(incoming.id);
          r.onsuccess = function () {
            var existing = r.result;
            if (!existing) { ns.put(incoming); added++; }
            else if ((incoming.updated || 0) > (existing.updated || 0)) { ns.put(incoming); updated++; }
            else { skipped++; }
          };
        });

        t.oncomplete = function () { resolve({ added: added, updated: updated, skipped: skipped }); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  function count() {
    return tx('notes').then(function (s) { return wrap(s.count()); });
  }

  /* ---------- Speicherplatz ---------- */

  // Bittet den Browser, die Daten nicht automatisch zu loeschen.
  function requestPersist() {
    if (!navigator.storage || !navigator.storage.persist) return Promise.resolve(false);
    return navigator.storage.persisted().then(function (already) {
      return already ? true : navigator.storage.persist();
    }).catch(function () { return false; });
  }

  function storageInfo() {
    if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
    return navigator.storage.estimate().then(function (est) {
      return navigator.storage.persisted
        ? navigator.storage.persisted().then(function (p) {
            return { usage: est.usage, quota: est.quota, persisted: p };
          })
        : { usage: est.usage, quota: est.quota, persisted: false };
    }).catch(function () { return null; });
  }

  return {
    SECTIONS: SECTIONS,
    AREAS: AREAS,
    titleKey: titleKey,
    dateTitle: dateTitle,
    startOfDay: startOfDay,
    addDays: addDays,
    endOfToday: endOfToday,
    dueNotes: dueNotes,
    dueCount: dueCount,
    setDue: setDue,
    blank: blank,
    create: create,
    save: save,
    get: getNote,
    remove: remove,
    listAll: listAll,
    listSection: listSection,
    findByTitle: findByTitle,
    backlinks: backlinks,
    listByTag: listByTag,
    allTags: allTags,
    search: search,
    daily: daily,
    getMeta: getMeta,
    setMeta: setMeta,
    allMeta: allMeta,
    replaceAll: replaceAll,
    mergeAll: mergeAll,
    count: count,
    requestPersist: requestPersist,
    storageInfo: storageInfo
  };
})();
