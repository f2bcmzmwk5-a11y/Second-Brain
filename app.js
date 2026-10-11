/* ==========================================================================
   app.js – Oberflaeche, Navigation, Editor

   Navigation laeuft ueber die Adresse hinter dem #:
     #/inbox #/projekte #/wissen #/archiv   Listen
     #/suche?q=...                          Suche
     #/note/<id>                            eine Notiz
     #/titel/<name>                         Notiz per Titel ([[Verknuepfung]])
     #/tag/<tag>                            alle Notizen mit diesem Tag
     #/einstellungen                        Einstellungen und Backup
   ========================================================================== */

(function () {
  'use strict';

  var SECTION_LABEL = {
    inbox: 'Inbox',
    projekte: 'Projekte',
    wissen: 'Wissen',
    archiv: 'Archiv'
  };

  var AREA_LABEL = {
    arbeit: 'Arbeit',
    fachwirt: 'Fachwirt',
    privat: 'Privat',
    ideen: 'Ideen'
  };

  var view = document.getElementById('view');
  var titleEl = document.getElementById('appbar-title');
  var backBtn = document.getElementById('btn-back');
  var menuBtn = document.getElementById('btn-menu');
  var fab = document.getElementById('fab');
  var banner = document.getElementById('banner');
  var sheetWrap = document.getElementById('sheet');
  var sheet = sheetWrap.querySelector('.sheet');

  // Merkt den gewaehlten Lebensbereich-Filter waehrend der Sitzung
  var areaFilter = '';
  // Offener Editor, damit vor dem Wegnavigieren gespeichert werden kann
  var openEditor = null;

  /* ====================================================================
     Kleine Helfer
     ==================================================================== */

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === 'class') node.className = props[k];
        else if (k === 'text') node.textContent = props[k];
        else if (k === 'html') node.innerHTML = props[k];
        else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), props[k]);
        else if (props[k] === true) node.setAttribute(k, '');
        else if (props[k] !== false && props[k] != null) node.setAttribute(k, props[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function toast(message) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = el('div', { class: 'toast', text: message, role: 'status' });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  function formatDate(ms) {
    var d = new Date(ms);
    var today = new Date();
    var sameDay = d.toDateString() === today.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
    if (d.getFullYear() === today.getFullYear()) {
      return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    }
    return d.toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: '2-digit'
    });
  }

  function formatBytes(n) {
    if (n == null) return '–';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  /* ====================================================================
     Sheet (Menue von unten)
     ==================================================================== */

  function openSheet(heading, groups) {
    clear(sheet);
    sheet.appendChild(el('h2', { text: heading }));

    groups.forEach(function (group) {
      if (group.label) sheet.appendChild(el('div', { class: 'sheet-label', text: group.label }));
      group.items.forEach(function (item) {
        var btn = el('button', {
          class: 'sheet-item' + (item.danger ? ' sheet-danger' : ''),
          type: 'button',
          'aria-pressed': item.pressed ? 'true' : null,
          onclick: function () {
            closeSheet();
            setTimeout(function () { item.onClick(); }, 60);
          }
        }, [item.label]);
        if (item.pressed) btn.appendChild(el('span', { class: 'check', text: '✓' }));
        sheet.appendChild(btn);
      });
    });

    sheet.appendChild(el('button', {
      class: 'sheet-item', type: 'button', onclick: closeSheet
    }, ['Abbrechen']));

    sheetWrap.hidden = false;
  }

  function closeSheet() { sheetWrap.hidden = true; }

  sheetWrap.addEventListener('click', function (e) {
    if (e.target.dataset.close) closeSheet();
  });

  /* ====================================================================
     Hinweisleiste
     ==================================================================== */

  function showBanner(text, actionLabel, onAction) {
    clear(banner);
    banner.appendChild(el('span', { text: text }));
    if (actionLabel) {
      banner.appendChild(el('button', { type: 'button', onclick: onAction }, [actionLabel]));
    }
    banner.appendChild(el('button', {
      type: 'button',
      'aria-label': 'Hinweis ausblenden',
      onclick: function () { banner.hidden = true; }
    }, ['✕']));
    banner.hidden = false;
  }

  function checkBackupAge() {
    if (!banner.hidden) return;   // Update-Hinweis hat Vorrang
    Backup.status().then(function (s) {
      if (!s.overdue) return;
      var text = s.last
        ? 'Letztes Backup vor ' + s.days + ' Tagen.'
        : 'Noch kein Backup erstellt.';
      showBanner(text, 'Jetzt sichern', function () {
        banner.hidden = true;
        go('#/einstellungen');
      });
    });
  }

  /* ====================================================================
     Notizliste
     ==================================================================== */

  function noteCard(note) {
    var title = note.title.trim() || '(ohne Titel)';

    var foot = [];
    if (note.area) {
      foot.push(el('span', {
        class: 'area-dot area-' + note.area,
        text: AREA_LABEL[note.area]
      }));
    }
    (note.tags || []).slice(0, 3).forEach(function (t) {
      foot.push(el('span', { class: 'tag-pill', text: '#' + t }));
    });

    var children = [
      el('div', { class: 'note-card-top' }, [
        el('h3', { text: title }),
        el('time', { datetime: new Date(note.updated).toISOString(), text: formatDate(note.updated) })
      ])
    ];

    var snippet = MD.snippet(note.body);
    if (snippet) children.push(el('p', { text: snippet }));
    if (foot.length) children.push(el('div', { class: 'note-card-foot' }, foot));

    return el('a', { class: 'note-card', href: '#/note/' + note.id }, children);
  }

  function noteListEl(notes, emptyTitle, emptyHint) {
    if (!notes.length) {
      return el('div', { class: 'empty' }, [
        el('strong', { text: emptyTitle }),
        el('span', { text: emptyHint || '' })
      ]);
    }
    return el('div', { class: 'note-list' }, notes.map(noteCard));
  }

  function areaChips(onChange) {
    var row = el('div', { class: 'chips', role: 'group', 'aria-label': 'Lebensbereich' });
    var options = [{ id: '', label: 'Alle' }].concat(
      DB.AREAS.map(function (a) { return { id: a, label: AREA_LABEL[a] }; })
    );
    options.forEach(function (opt) {
      row.appendChild(el('button', {
        class: 'chip',
        type: 'button',
        'aria-pressed': areaFilter === opt.id ? 'true' : 'false',
        onclick: function () { areaFilter = opt.id; onChange(); }
      }, [opt.label]));
    });
    return row;
  }

  function renderSection(section) {
    titleEl.textContent = SECTION_LABEL[section];
    backBtn.hidden = true;
    fab.hidden = false;

    return DB.listSection(section, areaFilter).then(function (notes) {
      clear(view);

      if (section === 'inbox') {
        view.appendChild(el('div', { class: 'btn-row' }, [
          el('button', { class: 'btn', type: 'button', onclick: openDaily }, [
            el('span', { text: 'Tägliche Notiz' })
          ]),
          el('button', { class: 'btn', type: 'button', onclick: pasteFromClipboard }, [
            el('span', { text: 'Aus Zwischenablage' })
          ])
        ]));
      }

      view.appendChild(areaChips(function () { renderSection(section); }));
      view.appendChild(noteListEl(
        notes,
        areaFilter ? 'Nichts in „' + AREA_LABEL[areaFilter] + '“' : 'Noch leer',
        section === 'inbox'
          ? 'Mit dem Plus unten rechts die erste Notiz anlegen.'
          : 'Notizen aus der Inbox hierher verschieben.'
      ));
    });
  }

  /* ====================================================================
     Suche
     ==================================================================== */

  var searchTimer = null;

  function renderSearch(query) {
    titleEl.textContent = 'Suche';
    backBtn.hidden = true;
    fab.hidden = false;

    clear(view);

    var field = el('input', {
      class: 'search-field',
      type: 'search',
      value: query,
      placeholder: 'Titel, Text oder #tag',
      enterkeyhint: 'search',
      autocomplete: 'off',
      autocapitalize: 'none'
    });

    var results = el('div');

    field.addEventListener('input', function () {
      clearTimeout(searchTimer);
      var q = field.value;
      searchTimer = setTimeout(function () {
        // Adresse still mitfuehren, damit Zurueck die Suche behaelt
        var hash = '#/suche' + (q ? '?q=' + encodeURIComponent(q) : '');
        history.replaceState(null, '', hash);
        runSearch(q, results);
      }, 180);
    });

    field.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') field.blur();
    });

    view.appendChild(field);
    view.appendChild(results);

    runSearch(query, results);
    if (!query) setTimeout(function () { field.focus(); }, 60);
  }

  function runSearch(query, target) {
    if (!query.trim()) {
      return DB.allTags().then(function (tags) {
        clear(target);
        if (!tags.length) {
          target.appendChild(el('div', { class: 'empty' }, [
            el('strong', { text: 'Suche' }),
            el('span', { text: 'Sucht in Titel, Text und Tags.' })
          ]));
          return;
        }
        target.appendChild(el('div', { class: 'section-head', text: 'Tags' }));
        target.appendChild(el('div', { class: 'tag-cloud' }, tags.map(function (t) {
          return el('a', {
            class: 'tag-pill',
            href: '#/tag/' + encodeURIComponent(t.tag),
            text: '#' + t.tag + ' · ' + t.count
          });
        })));
      });
    }

    return DB.search(query, areaFilter).then(function (notes) {
      clear(target);
      target.appendChild(el('div', {
        class: 'section-head',
        text: notes.length + (notes.length === 1 ? ' Treffer' : ' Treffer')
      }));
      target.appendChild(noteListEl(notes, 'Keine Treffer', 'Anderes Wort versuchen.'));
    });
  }

  function renderTag(tag) {
    titleEl.textContent = '#' + tag;
    backBtn.hidden = false;
    fab.hidden = true;

    return DB.listByTag(tag).then(function (notes) {
      clear(view);
      view.appendChild(noteListEl(notes, 'Keine Notiz mit #' + tag, ''));
    });
  }

  /* ====================================================================
     Eine Notiz anzeigen und bearbeiten
     ==================================================================== */

  function renderNote(id) {
    return Promise.all([DB.get(id), DB.listAll()]).then(function (res) {
      var note = res[0];
      if (!note) {
        titleEl.textContent = 'Nicht gefunden';
        backBtn.hidden = false;
        fab.hidden = true;
        clear(view).appendChild(el('div', { class: 'empty' }, [
          el('strong', { text: 'Diese Notiz gibt es nicht mehr.' }),
          el('span', { text: 'Vielleicht wurde sie gelöscht.' })
        ]));
        return;
      }

      var existing = new Set(res[1].map(function (n) { return n.titleKey; }).filter(Boolean));

      titleEl.textContent = SECTION_LABEL[note.section];
      backBtn.hidden = false;
      fab.hidden = true;

      clear(view);

      /* --- Titel --- */
      var titleInput = el('input', {
        class: 'note-title',
        type: 'text',
        value: note.title,
        placeholder: 'Titel',
        enterkeyhint: 'next',
        autocomplete: 'off'
      });

      /* --- Zeile mit Bereich, Datum --- */
      var meta = el('div', { class: 'note-meta' }, [
        note.area ? el('span', {
          class: 'area-dot area-' + note.area, text: AREA_LABEL[note.area]
        }) : null,
        el('span', { text: 'Geändert ' + formatDate(note.updated) }),
        el('span', { class: 'muted', text: SECTION_LABEL[note.section] })
      ]);

      /* --- Umschalter --- */
      var editBtn = el('button', { type: 'button' }, ['Bearbeiten']);
      var prevBtn = el('button', { type: 'button' }, ['Vorschau']);
      var segmented = el('div', { class: 'segmented', role: 'group' }, [editBtn, prevBtn]);

      /* --- Textfeld und Vorschau --- */
      var editor = el('textarea', {
        class: 'editor',
        placeholder: 'Text in Markdown…\n\n[[Andere Notiz]] verknüpft, #tag markiert.',
        spellcheck: 'true'
      });
      editor.value = note.body;

      var previewBox = el('div');
      var backlinksBox = el('div');

      // Nur eins von beiden ist sichtbar
      var mode = note.body.trim() ? 'preview' : 'edit';

      function applyMode() {
        var editing = mode === 'edit';
        editBtn.setAttribute('aria-pressed', editing ? 'true' : 'false');
        prevBtn.setAttribute('aria-pressed', editing ? 'false' : 'true');
        editor.hidden = !editing;
        previewBox.hidden = editing;
        if (!editing) drawPreview();
      }

      function drawPreview() {
        clear(previewBox);
        var body = editor.value.trim();
        if (!body) {
          previewBox.appendChild(el('div', { class: 'empty' }, [
            el('strong', { text: 'Noch kein Text' }),
            el('span', { text: 'Auf „Bearbeiten“ tippen.' })
          ]));
          return;
        }
        previewBox.appendChild(MD.render(editor.value, existing));
      }

      editBtn.addEventListener('click', function () {
        mode = 'edit';
        applyMode();
        editor.focus();
      });
      prevBtn.addEventListener('click', function () {
        mode = 'preview';
        flush().then(applyMode);
      });

      /* --- Speichern (verzoegert, damit nicht bei jedem Zeichen) --- */
      var saveTimer = null;
      var dirty = false;

      function touch() {
        dirty = true;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, 700);
      }

      function flush() {
        clearTimeout(saveTimer);
        if (!dirty) return Promise.resolve(note);
        note.title = titleInput.value;
        note.body = editor.value;
        dirty = false;
        return DB.save(note).then(function (saved) {
          note = saved;
          existing = new Set([].concat(Array.from(existing), [saved.titleKey]).filter(Boolean));
          drawBacklinks();
          return saved;
        }).catch(function (err) {
          dirty = true;
          toast('Speichern fehlgeschlagen');
          console.error(err);
        });
      }

      titleInput.addEventListener('input', touch);
      editor.addEventListener('input', touch);
      titleInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); editor.focus(); }
      });

      // Beim Verlassen der Notiz sicher speichern
      openEditor = {
        flush: function () {
          return flush().then(function () {
            // Vollstaendig leere Notiz nicht behalten
            if (!note.title.trim() && !note.body.trim()) return DB.remove(note.id);
          });
        }
      };

      /* --- Verknuepfungen in der Vorschau --- */
      previewBox.addEventListener('click', function (e) {
        var a = e.target.closest ? e.target.closest('a[href^="#/titel/"]') : null;
        if (!a) return;
        e.preventDefault();
        var name = decodeURIComponent(a.getAttribute('href').slice(8));
        flush().then(function () { openByTitle(name); });
      });

      /* --- Backlinks --- */
      function drawBacklinks() {
        DB.backlinks(note).then(function (hits) {
          clear(backlinksBox);
          if (!hits.length) return;
          backlinksBox.appendChild(el('div', {
            class: 'section-head',
            text: hits.length === 1 ? '1 Notiz verweist hierher' : hits.length + ' Notizen verweisen hierher'
          }));
          backlinksBox.appendChild(el('div', { class: 'note-list' }, hits.map(noteCard)));
        });
      }

      view.appendChild(titleInput);
      view.appendChild(meta);
      view.appendChild(segmented);
      view.appendChild(editor);
      view.appendChild(previewBox);
      view.appendChild(backlinksBox);

      applyMode();
      drawBacklinks();

      // Menue oben rechts bekommt die Notiz-Aktionen
      currentNoteMenu = function () { noteMenu(note, flush); };
    });
  }

  var currentNoteMenu = null;

  function noteMenu(note, flush) {
    openSheet(note.title.trim() || 'Notiz', [
      {
        label: 'Verschieben nach',
        items: DB.SECTIONS.map(function (s) {
          return {
            label: SECTION_LABEL[s],
            pressed: note.section === s,
            onClick: function () {
              note.section = s;
              DB.save(note).then(function () {
                toast('Verschoben nach ' + SECTION_LABEL[s]);
                render();
              });
            }
          };
        })
      },
      {
        label: 'Lebensbereich',
        items: [{ id: '', label: 'Keiner' }].concat(
          DB.AREAS.map(function (a) { return { id: a, label: AREA_LABEL[a] }; })
        ).map(function (opt) {
          return {
            label: opt.label,
            pressed: (note.area || '') === opt.id,
            onClick: function () {
              note.area = opt.id;
              DB.save(note).then(function () { render(); });
            }
          };
        })
      },
      {
        label: 'Mehr',
        items: [
          {
            label: 'Als Markdown kopieren',
            onClick: function () {
              flush().then(function () {
                var text = (note.title ? '# ' + note.title + '\n\n' : '') + note.body;
                copyText(text);
              });
            }
          },
          {
            label: 'Notiz löschen',
            danger: true,
            onClick: function () {
              if (!confirm('„' + (note.title.trim() || 'Diese Notiz') + '“ wirklich löschen?')) return;
              openEditor = null;
              DB.remove(note.id).then(function () {
                toast('Gelöscht');
                history.length > 1 ? history.back() : go('#/inbox');
              });
            }
          }
        ]
      }
    ]);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { toast('Kopiert'); })
        .catch(function () { toast('Kopieren nicht erlaubt'); });
    } else {
      toast('Kopieren wird hier nicht unterstützt');
    }
  }

  /* ====================================================================
     Notiz per Titel oeffnen – Grundlage fuer [[Verknuepfungen]]
     ==================================================================== */

  function openByTitle(name) {
    var clean = String(name || '').trim();
    if (!clean) return;

    DB.findByTitle(clean).then(function (found) {
      if (found) { go('#/note/' + found.id); return; }
      if (!confirm('Die Notiz „' + clean + '“ gibt es noch nicht.\n\nJetzt anlegen?')) return;
      DB.create({ title: clean, section: 'inbox' }).then(function (note) {
        toast('Notiz angelegt');
        go('#/note/' + note.id);
      });
    });
  }

  /* ====================================================================
     Neue Notiz, taegliche Notiz, Zwischenablage
     ==================================================================== */

  function currentSection() {
    var m = /^#\/(inbox|projekte|wissen|archiv)/.exec(location.hash);
    return m ? m[1] : 'inbox';
  }

  function newNote() {
    DB.create({ section: currentSection(), area: areaFilter || '' })
      .then(function (note) { go('#/note/' + note.id); });
  }

  function openDaily() {
    DB.daily().then(function (note) { go('#/note/' + note.id); });
  }

  // iOS zeigt dabei eine Rueckfrage "Einfuegen erlauben?"
  function pasteFromClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      toast('Zwischenablage hier nicht verfügbar');
      return;
    }
    navigator.clipboard.readText().then(function (text) {
      text = String(text || '').trim();
      if (!text) { toast('Zwischenablage ist leer'); return; }

      var firstLine = text.split('\n')[0].trim();
      var title;
      var body = text;

      // Nur eine URL? Dann Domain als Titel und Link als Text.
      if (/^https?:\/\/\S+$/.test(text)) {
        try { title = new URL(text).hostname.replace(/^www\./, ''); }
        catch (e) { title = 'Link'; }
        body = '<' + text + '>';
      } else {
        title = firstLine.replace(/^#{1,6}\s*/, '').slice(0, 80);
        if (text.split('\n').length > 1) body = text.split('\n').slice(1).join('\n').trim();
        else body = '';
      }

      DB.create({ title: title, body: body, section: 'inbox', area: areaFilter || '' })
        .then(function (note) {
          toast('Eingefügt');
          go('#/note/' + note.id);
        });
    }).catch(function () {
      toast('Einfügen wurde abgelehnt');
    });
  }

  /* ====================================================================
     Einstellungen
     ==================================================================== */

  function renderSettings() {
    titleEl.textContent = 'Einstellungen';
    backBtn.hidden = false;
    fab.hidden = true;

    clear(view);

    /* --- Backup --- */
    view.appendChild(el('div', { class: 'section-head', text: 'Backup' }));

    var statusRows = el('div', { class: 'rows' });
    view.appendChild(statusRows);

    view.appendChild(el('div', { class: 'btn-row' }, [
      el('button', {
        class: 'btn btn-primary', type: 'button',
        onclick: function (e) { runExport(e.currentTarget, Backup.exportJson, 'JSON'); }
      }, [el('span', { text: 'Export JSON' })]),
      el('button', {
        class: 'btn', type: 'button',
        onclick: function (e) { runExport(e.currentTarget, Backup.exportZip, 'ZIP'); }
      }, [el('span', { text: 'Export ZIP' })])
    ]));

    var fileInput = el('input', {
      type: 'file', accept: '.json,application/json', hidden: true
    });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (file) startImport(file);
    });

    view.appendChild(el('button', {
      class: 'btn btn-block', type: 'button',
      onclick: function () { fileInput.click(); }
    }, [el('span', { text: 'Import aus JSON' })]));
    view.appendChild(fileInput);

    view.appendChild(el('p', { class: 'hint' }, [
      'JSON ist die vollständige Sicherung zum Wiedereinlesen. ' +
      'ZIP enthält zusätzlich eine Markdown-Datei pro Notiz. ' +
      'Auf dem iPhone erscheint das Teilen-Menü – dort „In Dateien speichern“.'
    ]));

    /* --- Speicher --- */
    view.appendChild(el('div', { class: 'section-head', text: 'Speicher' }));
    var storageRows = el('div', { class: 'rows' });
    view.appendChild(storageRows);

    view.appendChild(el('p', { class: 'hint' }, [
      'Alle Notizen liegen nur auf diesem Gerät. ' +
      'App vom Home-Bildschirm löschen = Daten weg. Vorher exportieren!'
    ]));

    /* --- App --- */
    view.appendChild(el('div', { class: 'section-head', text: 'App' }));
    view.appendChild(el('div', { class: 'rows' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'label', text: 'Version' }),
        el('span', { class: 'value', text: window.APP_VERSION || '–' })
      ]),
      el('div', { class: 'row' }, [
        el('span', { class: 'label', text: 'Start' }),
        el('span', {
          class: 'value',
          text: window.matchMedia('(display-mode: standalone)').matches
            ? 'Als App installiert' : 'Im Browser'
        })
      ])
    ]));

    /* --- Werte nachladen --- */
    Backup.status().then(function (s) {
      clear(statusRows);
      statusRows.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'label', text: 'Notizen' }),
        el('span', { class: 'value', text: String(s.count) })
      ]));
      statusRows.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'label', text: 'Letztes Backup' }),
        el('span', {
          class: 'value',
          text: s.last
            ? new Date(s.last).toLocaleString('de-DE', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              }) + (s.days > 0 ? ' (vor ' + s.days + ' Tagen)' : '')
            : 'noch keins'
        })
      ]));
    });

    DB.storageInfo().then(function (info) {
      clear(storageRows);
      if (!info) {
        storageRows.appendChild(el('div', { class: 'row' }, [
          el('span', { class: 'label', text: 'Belegt' }),
          el('span', { class: 'value', text: 'nicht abfragbar' })
        ]));
        return;
      }

      var pct = info.quota ? Math.min(100, (info.usage / info.quota) * 100) : 0;
      var usageRow = el('div', { class: 'row' }, [
        el('div', { class: 'label' }, [
          el('div', { text: 'Belegt' }),
          el('div', { class: 'bar' }, [el('i', { style: 'width:' + Math.max(pct, 1) + '%' })])
        ]),
        el('span', {
          class: 'value',
          text: formatBytes(info.usage) + ' von ' + formatBytes(info.quota)
        })
      ]);
      storageRows.appendChild(usageRow);

      var persistRow = el('div', { class: 'row' }, [
        el('span', { class: 'label', text: 'Dauerhafter Speicher' }),
        info.persisted
          ? el('span', { class: 'value', text: 'aktiv ✓' })
          : el('button', {
              class: 'btn', type: 'button',
              style: 'min-height:38px;padding:0 12px',
              onclick: function () {
                DB.requestPersist().then(function (ok) {
                  toast(ok ? 'Dauerhafter Speicher aktiv'
                           : 'Vom Browser abgelehnt – Backups bleiben wichtig');
                  renderSettings();
                });
              }
            }, [el('span', { text: 'Anfragen' })])
      ]);
      storageRows.appendChild(persistRow);
    });
  }

  function runExport(button, fn, label) {
    var span = button.querySelector('span');
    var before = span.textContent;
    span.textContent = 'Erstelle…';
    button.disabled = true;

    fn().then(function (res) {
      if (res.how === 'abgebrochen') toast('Abgebrochen');
      else toast(res.count + ' Notizen als ' + label + ' gesichert');
      renderSettings();
    }).catch(function (err) {
      console.error(err);
      alert('Export fehlgeschlagen:\n\n' + (err.message || err));
    }).then(function () {
      span.textContent = before;
      button.disabled = false;
    });
  }

  function startImport(file) {
    Backup.inspect(file).then(function (parsed) {
      var when = parsed.exportedAt
        ? new Date(parsed.exportedAt).toLocaleString('de-DE')
        : 'unbekannt';

      return DB.count().then(function (have) {
        openSheet('Import', [{
          label: parsed.notes.length + ' Notizen in der Datei (vom ' + when + ')',
          items: [
            {
              label: 'Dazu laden (empfohlen)',
              onClick: function () {
                Backup.apply(parsed, 'merge').then(function (r) {
                  toast(r.added + ' neu, ' + r.updated + ' aktualisiert');
                  render();
                }).catch(importFailed);
              }
            },
            {
              label: 'Alles ersetzen (' + have + ' Notizen löschen)',
              danger: true,
              onClick: function () {
                if (!confirm('Alle ' + have + ' Notizen auf diesem Gerät werden ' +
                             'gelöscht und durch die ' + parsed.notes.length +
                             ' aus der Datei ersetzt.\n\nFortfahren?')) return;
                Backup.apply(parsed, 'replace').then(function (r) {
                  toast(r.total + ' Notizen eingelesen');
                  render();
                }).catch(importFailed);
              }
            }
          ]
        }]);
      });
    }).catch(function (err) {
      alert('Import nicht möglich:\n\n' + (err.message || err));
    });
  }

  function importFailed(err) {
    console.error(err);
    alert('Import fehlgeschlagen:\n\n' + (err.message || err));
  }

  /* ====================================================================
     Menue oben rechts
     ==================================================================== */

  menuBtn.addEventListener('click', function () {
    if (currentNoteMenu && /^#\/note\//.test(location.hash)) {
      currentNoteMenu();
      return;
    }
    openSheet('Menü', [{
      items: [
        { label: 'Einstellungen & Backup', onClick: function () { go('#/einstellungen'); } },
        { label: 'Tägliche Notiz', onClick: openDaily },
        { label: 'Aus Zwischenablage einfügen', onClick: pasteFromClipboard }
      ]
    }]);
  });

  backBtn.addEventListener('click', function () {
    if (history.length > 1) history.back();
    else go('#/inbox');
  });

  fab.addEventListener('click', newNote);

  /* ====================================================================
     Router
     ==================================================================== */

  function render() {
    closeSheet();
    currentNoteMenu = null;

    var hash = location.hash || '#/inbox';
    var queryAt = hash.indexOf('?');
    var path = queryAt === -1 ? hash : hash.slice(0, queryAt);
    var query = queryAt === -1 ? '' : hash.slice(queryAt + 1);
    var parts = path.replace(/^#\/?/, '').split('/');
    var route = parts[0] || 'inbox';

    // Tab-Leiste markieren
    document.querySelectorAll('.tab').forEach(function (tab) {
      var active = tab.dataset.tab === route;
      active ? tab.setAttribute('aria-current', 'page') : tab.removeAttribute('aria-current');
    });

    window.scrollTo(0, 0);

    var done;
    if (DB.SECTIONS.indexOf(route) !== -1) {
      done = renderSection(route);
    } else if (route === 'suche') {
      var q = new URLSearchParams(query).get('q') || '';
      done = renderSearch(q);
    } else if (route === 'note' && parts[1]) {
      done = renderNote(decodeURIComponent(parts[1]));
    } else if (route === 'titel' && parts[1]) {
      openByTitle(decodeURIComponent(parts[1]));
      // Diese Adresse nicht stehen lassen
      history.replaceState(null, '', '#/inbox');
      return Promise.resolve();
    } else if (route === 'tag' && parts[1]) {
      done = renderTag(decodeURIComponent(parts[1]));
    } else if (route === 'einstellungen') {
      done = renderSettings();
    } else {
      location.replace('#/inbox');
      return Promise.resolve();
    }

    return Promise.resolve(done).catch(function (err) {
      console.error(err);
      clear(view).appendChild(el('div', { class: 'empty' }, [
        el('strong', { text: 'Etwas ist schiefgelaufen' }),
        el('span', { text: String(err && err.message || err) })
      ]));
    });
  }

  window.addEventListener('hashchange', function () {
    // Offenen Editor erst sichern, dann die neue Ansicht zeigen
    var pending = openEditor;
    openEditor = null;
    Promise.resolve(pending ? pending.flush() : null).then(render, render);
  });

  // App wird in den Hintergrund geschoben (iPhone: Home, App-Wechsel)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && openEditor) openEditor.flush();
  });
  window.addEventListener('pagehide', function () {
    if (openEditor) openEditor.flush();
  });

  /* ====================================================================
     Service Worker (Offline-Betrieb und Updates)
     ==================================================================== */

  function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') {
      console.warn('Service Worker braucht http://localhost oder https:// – ' +
                   'die App läuft hier ohne Offline-Modus.');
      return;
    }

    navigator.serviceWorker.register('sw.js').then(function (reg) {
      // Version anzeigen koennen
      if (navigator.serviceWorker.controller) askVersion();

      reg.addEventListener('updatefound', function () {
        var fresh = reg.installing;
        if (!fresh) return;
        fresh.addEventListener('statechange', function () {
          if (fresh.state === 'installed' && navigator.serviceWorker.controller) {
            showBanner('Neue Version verfügbar.', 'Neu laden', function () {
              fresh.postMessage({ type: 'SKIP_WAITING' });
            });
          }
        });
      });
    }).catch(function (err) {
      console.warn('Service Worker nicht registriert:', err);
    });

    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return;
      reloading = true;
      location.reload();
    });

    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'VERSION') window.APP_VERSION = e.data.version;
    });
  }

  function askVersion() {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
    }
  }

  /* ====================================================================
     Start
     ==================================================================== */

  if (!location.hash) location.replace('#/inbox');

  render().then(function () {
    setupServiceWorker();
    checkBackupAge();

    // Beim ersten Start darum bitten, die Daten nicht zu verwerfen
    DB.getMeta('persistAsked', false).then(function (asked) {
      if (asked) return;
      DB.setMeta('persistAsked', true);
      DB.requestPersist();
    });
  });
})();
