/* ==========================================================================
   templates.js – Vorlagen fuer neue Notizen

   Platzhalter im Titel und im Text:
     {{date}}   10.10.2026
     {{time}}   14:30
     {{title}}  der Titel der Notiz

   Neue Vorlage hinzufuegen: einfach einen weiteren Eintrag in LIST
   ergaenzen. Reihenfolge hier = Reihenfolge im Menue.
   ========================================================================== */

window.Templates = (function () {
  'use strict';

  var LIST = [
    {
      id: 'projekt',
      label: 'Projekt',
      section: 'projekte',
      title: '',
      body: [
        '## Ziel',
        '',
        '',
        '## Nächste Schritte',
        '',
        '- [ ] ',
        '- [ ] ',
        '',
        '## Beteiligte',
        '',
        '',
        '## Notizen & Entscheidungen',
        '',
        '',
        '## Links',
        '',
        ''
      ].join('\n')
    },

    {
      id: 'gespraech',
      label: 'Gesprächsnotiz',
      section: 'inbox',
      area: 'arbeit',
      title: 'Gespräch {{date}}',
      body: [
        '**Datum/Uhrzeit:** {{date}}, {{time}}',
        '**Mit:** ',
        '**Firma:** ',
        '**Anlass:** ',
        '',
        '## Besprochen',
        '',
        '',
        '## Vereinbart',
        '',
        '| Wer | Was | Bis wann |',
        '|---|---|---|',
        '|  |  |  |',
        '',
        '## Offene Fragen',
        '',
        '- ',
        '',
        '## Nächster Kontakt',
        '',
        ''
      ].join('\n')
    },

    {
      id: 'lernkarte',
      label: 'Lernkarte',
      section: 'wissen',
      area: 'fachwirt',
      title: '',
      body: [
        '**Fach:** ',
        '**Thema:** {{title}}',
        '',
        '## Fragen',
        '',
        'Frage :: Antwort',
        'Frage :: Antwort',
        '',
        '## Merksatz',
        '',
        '',
        '## Praxisbeispiel',
        '',
        ''
      ].join('\n')
    }
  ];

  function pad(n) { return String(n).padStart(2, '0'); }

  function fill(text, vars) {
    return String(text || '')
      .replace(/\{\{date\}\}/g, vars.date)
      .replace(/\{\{time\}\}/g, vars.time)
      .replace(/\{\{title\}\}/g, vars.title);
  }

  function byId(id) {
    for (var i = 0; i < LIST.length; i++) {
      if (LIST[i].id === id) return LIST[i];
    }
    return null;
  }

  /**
   * Baut aus einer Vorlage die Felder fuer eine neue Notiz.
   * @param id    Kennung der Vorlage
   * @param area  Lebensbereich aus dem aktuellen Filter (falls gesetzt);
   *              schlaegt den Vorgabewert der Vorlage.
   */
  function build(id, area) {
    var tpl = byId(id);
    if (!tpl) return null;

    var now = new Date();
    var vars = {
      date: DB.dateTitle(now),
      time: pad(now.getHours()) + ':' + pad(now.getMinutes()),
      title: ''
    };

    var title = fill(tpl.title, vars);
    // {{title}} im Text soll den fertigen Titel einsetzen
    vars.title = title;

    return {
      title: title,
      body: fill(tpl.body, vars),
      section: tpl.section || 'inbox',
      area: area || tpl.area || ''
    };
  }

  return {
    list: LIST,
    build: build
  };
})();
