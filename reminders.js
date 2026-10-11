/* ==========================================================================
   reminders.js – Kalender-Erinnerung als .ics-Datei

   Erzeugt einen einmaligen Termin am Tag der Wiedervorlage mit Alarm.
   Auf dem iPhone oeffnet sich das Teilen-Menue, von dort nimmt der
   Kalender die Datei an.

   WICHTIG: Das ist eine Momentaufnahme. Wird die Wiedervorlage spaeter
   in der App geaendert, aendert sich der Kalendertermin NICHT mit.
   ========================================================================== */

window.Reminders = (function () {
  'use strict';

  var ALARM_HOUR = 9;        // Uhrzeit des Termins und des Alarms
  var DURATION_MIN = 15;

  function pad(n) { return String(n).padStart(2, '0'); }

  // Ortszeit ohne Zeitzonen-Kennung ("floating"): der Kalender nimmt die
  // Zeit so, wie sie dasteht - genau was wir fuer einen Tagestermin wollen.
  function localStamp(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
           'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }

  // Zeitpunkt der Erstellung, in UTC
  function utcStamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
           'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) +
           pad(d.getUTCSeconds()) + 'Z';
  }

  // Sonderzeichen, die im ics-Format eine Bedeutung haben
  function esc(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  // Zeilen duerfen hoechstens 75 Zeichen lang sein; laengere werden
  // umgebrochen und in der naechsten Zeile mit einem Leerzeichen begonnen.
  function fold(line) {
    if (line.length <= 75) return line;
    var out = line.slice(0, 75);
    var rest = line.slice(75);
    while (rest.length > 74) {
      out += '\r\n ' + rest.slice(0, 74);
      rest = rest.slice(74);
    }
    return out + '\r\n ' + rest;
  }

  // Adresse, unter der die Notiz in der App zu finden ist
  function noteUrl(note) {
    return location.href.split('#')[0] + '#/note/' + note.id;
  }

  function build(note) {
    var day = new Date(note.due);
    day.setHours(ALARM_HOUR, 0, 0, 0);
    var end = new Date(day.getTime() + DURATION_MIN * 60000);

    var title = note.title.trim() || 'Wiedervorlage';
    var description = 'Wiedervorlage aus Second Brain.\n\n' + noteUrl(note);

    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Second Brain//Wiedervorlage//DE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + note.id + '@second-brain',
      'DTSTAMP:' + utcStamp(new Date()),
      'DTSTART:' + localStamp(day),
      'DTEND:' + localStamp(end),
      'SUMMARY:' + esc(title),
      'DESCRIPTION:' + esc(description),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:PT0S',
      'DESCRIPTION:' + esc(title),
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ];

    // ics verlangt CRLF als Zeilenende
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  /**
   * Erzeugt die Datei und uebergibt sie ans Teilen-Menue.
   * Die Notiz braucht dafuer eine Wiedervorlage (Feld due).
   */
  function share(note) {
    if (!note.due) {
      return Promise.reject(new Error('Für diese Notiz ist keine Wiedervorlage gesetzt.'));
    }
    var blob = new Blob([build(note)], { type: 'text/calendar;charset=utf-8' });
    var name = ShareFile.safeName(note.title, 'Wiedervorlage') + '.ics';
    return ShareFile.deliver(name, blob);
  }

  return {
    build: build,
    share: share,
    ALARM_HOUR: ALARM_HOUR
  };
})();
