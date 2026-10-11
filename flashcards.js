/* ==========================================================================
   flashcards.js – Lernkarten aus dem Notiztext

   Jede Zeile mit "::" wird eine Karte:
       Deckungsbeitrag :: Umsatz minus variable Kosten
       ^ Vorderseite      ^ Rueckseite

   Der Lernstand (wann die Karte wieder drankommt) haengt an der
   Vorderseite. Text der Rueckseite aendern ist also gefahrlos -
   die Karte behaelt ihren Rhythmus. Wird die Vorderseite geaendert,
   gilt das als neue Karte.

   Wiederholungsabstaende nach einem vereinfachten SM-2.
   ========================================================================== */

window.Cards = (function () {
  'use strict';

  var EASE_START = 2.5;
  var EASE_MIN = 1.3;
  var EASE_MAX = 2.8;

  var RATINGS = [
    { id: 'nochmal', label: 'Nochmal', value: 0 },
    { id: 'schwer', label: 'Schwer', value: 1 },
    { id: 'gut', label: 'Gut', value: 2 },
    { id: 'leicht', label: 'Leicht', value: 3 }
  ];

  /* ---------- Text auswerten ---------- */

  function normalize(front) {
    return String(front || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Findet alle "Vorderseite :: Rueckseite"-Zeilen.
   * Code-Abschnitte werden uebersprungen, damit "::" in Code
   * (z. B. C++) keine Karte erzeugt.
   */
  function parse(body) {
    var out = [];
    var inCode = false;

    String(body || '').split(/\r?\n/).forEach(function (line) {
      if (/^\s*```/.test(line)) { inCode = !inCode; return; }
      if (inCode) return;

      var at = line.indexOf('::');
      if (at === -1) return;

      var front = line.slice(0, at).trim();
      var back = line.slice(at + 2).trim();
      if (!front || !back) return;

      // Aufzaehlungszeichen und Fettschrift vorne wegnehmen
      front = front.replace(/^\s*[-*+]\s+/, '').replace(/^\*\*(.*)\*\*$/, '$1').trim();
      if (!front) return;

      out.push({ front: front, back: back });
    });

    return out;
  }

  /* ---------- Karten mit der Notiz abgleichen ---------- */

  function blankCard(noteId, front, back, order) {
    return {
      id: DB.uid(),
      noteId: noteId,
      key: normalize(front),
      front: front,
      back: back,
      order: order,
      ease: EASE_START,
      interval: 0,
      reps: 0,
      lapses: 0,
      due: DB.startOfDay(Date.now()),   // neue Karten sind sofort dran
      created: Date.now(),
      updated: Date.now()
    };
  }

  /**
   * Bringt die Karten einer Notiz auf den Stand ihres Textes.
   * Wird von DB.save() automatisch aufgerufen.
   */
  function sync(note) {
    var gewuenscht = parse(note.body);

    return DB.cardsForNote(note.id).then(function (vorhanden) {
      var byKey = {};
      vorhanden.forEach(function (c) { byKey[c.key] = c; });

      var behalten = {};
      var jobs = [];

      gewuenscht.forEach(function (item, i) {
        var key = normalize(item.front);
        behalten[key] = true;
        var alt = byKey[key];

        if (alt) {
          // Lernstand bleibt, nur Text und Reihenfolge auffrischen
          if (alt.back !== item.back || alt.order !== i || alt.front !== item.front) {
            alt.front = item.front;
            alt.back = item.back;
            alt.order = i;
            alt.updated = Date.now();
            jobs.push(DB.putCard(alt));
          }
        } else {
          jobs.push(DB.putCard(blankCard(note.id, item.front, item.back, i)));
        }
      });

      // Karten, deren Zeile aus der Notiz verschwunden ist
      vorhanden.forEach(function (c) {
        if (!behalten[c.key]) jobs.push(DB.deleteCard(c.id));
      });

      return Promise.all(jobs);
    });
  }

  // Nach einem Import: alle Notizen einmal durchgehen
  function syncAll() {
    return DB.listAll().then(function (notes) {
      return notes.reduce(function (kette, note) {
        return kette.then(function () { return sync(note); });
      }, Promise.resolve());
    });
  }

  /* ---------- Wiederholungsabstaende (vereinfachtes SM-2) ---------- */

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  /**
   * Berechnet den neuen Stand einer Karte.
   * @param rating 0 Nochmal, 1 Schwer, 2 Gut, 3 Leicht
   */
  function schedule(card, rating) {
    var ease = card.ease || EASE_START;
    var interval = card.interval || 0;

    if (rating === 0) {
      // Nicht gewusst: heute nochmal zeigen, Abstand faellt zurueck
      card.lapses = (card.lapses || 0) + 1;
      ease -= 0.20;
      interval = 0;
    } else if (rating === 1) {
      ease -= 0.15;
      interval = interval < 1 ? 1 : Math.round(interval * 1.2);
    } else if (rating === 2) {
      if (interval < 1) interval = 1;
      else if (interval === 1) interval = 3;
      else interval = Math.round(interval * ease);
    } else {
      ease += 0.15;
      interval = interval < 1 ? 2 : Math.round(interval * ease * 1.3);
    }

    card.ease = clamp(ease, EASE_MIN, EASE_MAX);
    card.interval = Math.min(interval, 365 * 2);
    card.reps = (card.reps || 0) + 1;
    card.due = DB.addDays(DB.startOfDay(Date.now()), card.interval);
    card.updated = Date.now();

    return card;
  }

  // Zeigt dem Nutzer, wann die Karte wiederkommt
  function nextLabel(card, rating) {
    var probe = {
      ease: card.ease, interval: card.interval,
      reps: card.reps, lapses: card.lapses
    };
    schedule(probe, rating);
    if (probe.interval === 0) return 'gleich nochmal';
    if (probe.interval === 1) return 'morgen';
    if (probe.interval < 30) return 'in ' + probe.interval + ' Tagen';
    return 'in ' + Math.round(probe.interval / 30) + ' Monaten';
  }

  return {
    RATINGS: RATINGS,
    parse: parse,
    sync: sync,
    syncAll: syncAll,
    schedule: schedule,
    nextLabel: nextLabel
  };
})();
