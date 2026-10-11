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

  // Wiedervorlage menschlich benennen: Heute / Morgen / Überfällig / Datum
  function formatDue(ts) {
    var heute = DB.startOfDay(Date.now());
    var tage = Math.round((DB.startOfDay(ts) - heute) / 86400000);

    if (tage < 0) return { text: tage === -1 ? 'Gestern fällig' : 'Überfällig', overdue: true };
    if (tage === 0) return { text: 'Heute', overdue: false };
    if (tage === 1) return { text: 'Morgen', overdue: false };
    if (tage < 7) return { text: 'In ' + tage + ' Tagen', overdue: false };

    return {
      text: new Date(ts).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: '2-digit'
      }),
      overdue: false
    };
  }

  // Datum als JJJJ-MM-TT fuer <input type="date">
  function toDateInput(ts) {
    var d = new Date(ts);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
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
    if (note.due) {
      var due = formatDue(note.due);
      foot.push(el('span', {
        class: 'due-chip' + (due.overdue ? ' due-overdue' : ''),
        text: due.text
      }));
    }
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

  // Kleine Zahl am Inbox-Tab, wenn etwas faellig ist
  function updateDueBadge() {
    return DB.dueCount().then(function (n) {
      var tab = document.querySelector('.tab[data-tab="inbox"]');
      if (!tab) return;
      var badge = tab.querySelector('.badge');
      if (!n) { if (badge) badge.remove(); return; }
      if (!badge) {
        badge = el('span', { class: 'badge' });
        tab.appendChild(badge);
      }
      badge.textContent = n > 9 ? '9+' : String(n);
    }).catch(function () { /* Zaehler ist nicht kritisch */ });
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

    // Die Inbox ist die Startseite und zeigt oben die faelligen Notizen.
    var dueP = section === 'inbox' ? DB.dueNotes() : Promise.resolve([]);
    var cardsP = section === 'inbox' ? DB.dueCardCount() : Promise.resolve(0);

    return Promise.all([DB.listSection(section, areaFilter), dueP, cardsP]).then(function (res) {
      var notes = res[0];
      var due = res[1];
      var faelligeKarten = res[2];

      clear(view);

      if (section === 'inbox') {
        if (faelligeKarten) {
          view.appendChild(el('a', {
            class: 'learn-banner',
            href: '#/lernen'
          }, [
            el('strong', { text: faelligeKarten + (faelligeKarten === 1 ? ' Karte' : ' Karten') + ' heute fällig' }),
            el('span', { class: 'small', text: 'Lernen starten' })
          ]));
        }

        if (due.length) {
          var ueberfaellig = due.filter(function (n) {
            return DB.startOfDay(n.due) < DB.startOfDay(Date.now());
          }).length;

          view.appendChild(el('div', {
            class: 'section-head',
            text: 'Fällig (' + due.length + ')' +
                  (ueberfaellig ? ' · ' + ueberfaellig + ' überfällig' : '')
          }));
          view.appendChild(el('div', { class: 'note-list due-list' }, due.map(noteCard)));
        }

        view.appendChild(el('div', { class: 'btn-row' }, [
          el('button', { class: 'btn', type: 'button', onclick: openDaily }, [
            el('span', { text: 'Tägliche Notiz' })
          ]),
          el('button', { class: 'btn', type: 'button', onclick: pasteFromClipboard }, [
            el('span', { text: 'Aus Zwischenablage' })
          ])
        ]));

        if (due.length) {
          view.appendChild(el('div', { class: 'section-head', text: 'Alle Notizen' }));
        }
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

  function renderLearn() {
    titleEl.textContent = 'Lernen';
    backBtn.hidden = false;
    fab.hidden = true;
    clear(view);

    return Learn.render(view, {
      el: el, clear: clear, toast: toast, go: go
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

      /* --- Zeile mit Bereich, Datum, Wiedervorlage --- */
      var dueInfo = note.due ? formatDue(note.due) : null;
      var meta = el('div', { class: 'note-meta' }, [
        dueInfo ? el('button', {
          class: 'due-chip' + (dueInfo.overdue ? ' due-overdue' : ''),
          type: 'button',
          title: 'Wiedervorlage ändern',
          onclick: function () { dueMenu(note); }
        }, ['Fällig: ' + dueInfo.text]) : null,
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
      view.appendChild(attachmentsBlock(note));
      view.appendChild(backlinksBox);

      applyMode();
      drawBacklinks();

      // Menue oben rechts bekommt die Notiz-Aktionen
      currentNoteMenu = function () { noteMenu(note, flush); };
    });
  }

  var currentNoteMenu = null;

  /* ====================================================================
     Anhaenge
     ==================================================================== */

  // Adressen fuer Blobs muessen wieder freigegeben werden, sonst
  // belegen sie Speicher bis zum Neuladen.
  var objectUrls = [];

  function blobUrl(blob) {
    var url = URL.createObjectURL(blob);
    objectUrls.push(url);
    return url;
  }

  function releaseUrls() {
    objectUrls.forEach(function (u) { URL.revokeObjectURL(u); });
    objectUrls = [];
  }

  function attachmentsBlock(note) {
    var box = el('div');

    var fileInput = el('input', {
      type: 'file',
      accept: 'image/*,application/pdf',
      multiple: true,
      hidden: true
    });
    fileInput.addEventListener('change', function () {
      var files = fileInput.files;
      if (!files || !files.length) return;
      toast(files.length === 1 ? 'Wird hinzugefügt …' : files.length + ' Dateien …');
      Attachments.addMany(note.id, files).then(function (n) {
        fileInput.value = '';
        if (n) toast(n === 1 ? 'Angehängt' : n + ' angehängt');
        draw();
      }).catch(function (err) {
        console.error(err);
        fileInput.value = '';
        alert('Anhängen fehlgeschlagen:\n\n' + (err.message || err));
      });
    });

    function draw() {
      clear(box);
      box.appendChild(fileInput);

      DB.attachmentsForNote(note.id).then(function (liste) {
        box.appendChild(el('div', {
          class: 'section-head',
          text: liste.length ? 'Anhänge (' + liste.length + ')' : 'Anhänge'
        }));

        if (liste.length) {
          var bilder = liste.filter(function (a) { return Attachments.isImage(a.type); });
          var rest = liste.filter(function (a) { return !Attachments.isImage(a.type); });

          if (bilder.length) {
            box.appendChild(el('div', { class: 'thumbs' }, bilder.map(function (a) {
              return el('button', {
                class: 'thumb', type: 'button',
                onclick: function () { attachmentMenu(a, draw); }
              }, [
                el('img', { src: blobUrl(a.blob), alt: a.name, loading: 'lazy' })
              ]);
            })));
          }

          rest.forEach(function (a) {
            box.appendChild(attachmentRow(a, draw));
          });
        }

        var knoepfe = [
          el('button', {
            class: 'btn', type: 'button',
            onclick: function () { fileInput.click(); }
          }, [el('span', { text: 'Foto / Datei' })])
        ];

        if (Attachments.canRecord()) {
          knoepfe.push(el('button', {
            class: 'btn', type: 'button',
            onclick: function () { recordSheet(note, draw); }
          }, [el('span', { text: 'Sprachmemo' })]));
        }

        box.appendChild(el('div', { class: 'btn-row attach-actions' }, knoepfe));
      });
    }

    draw();
    return box;
  }

  function attachmentRow(att, onChange) {
    var inhalt = [
      el('div', { class: 'attach-info' }, [
        el('div', { class: 'attach-name', text: att.name }),
        el('div', { class: 'small muted', text: Attachments.formatBytes(att.size) })
      ])
    ];

    if (Attachments.isAudio(att.type)) {
      var player = el('audio', { controls: true, preload: 'none', src: blobUrl(att.blob) });
      inhalt.push(player);
    }

    inhalt.push(el('button', {
      class: 'attach-more', type: 'button', 'aria-label': 'Mehr',
      onclick: function () { attachmentMenu(att, onChange); }
    }, ['⋯']));

    return el('div', { class: 'attach-row' }, inhalt);
  }

  function attachmentMenu(att, onChange) {
    var items = [];

    if (Attachments.isImage(att.type) || Attachments.isPdf(att.type)) {
      items.push({
        label: 'Öffnen',
        onClick: function () { window.open(blobUrl(att.blob), '_blank', 'noopener'); }
      });
    }

    items.push({
      label: 'Teilen / Speichern',
      onClick: function () {
        ShareFile.deliver(att.name, att.blob).then(function (how) {
          if (how !== 'abgebrochen') toast('Weitergegeben');
        }).catch(function () { toast('Teilen nicht möglich'); });
      }
    });

    items.push({
      label: 'Anhang löschen',
      danger: true,
      onClick: function () {
        if (!confirm('„' + att.name + '“ wirklich löschen?')) return;
        DB.deleteAttachment(att.id).then(function () {
          toast('Gelöscht');
          onChange();
        });
      }
    });

    openSheet(att.name, [{
      label: Attachments.formatBytes(att.size),
      items: items
    }]);
  }

  // Aufnahme-Blatt fuer Sprachmemos
  function recordSheet(note, onChange) {
    clear(sheet);
    sheet.appendChild(el('h2', { text: 'Sprachmemo' }));

    var zeit = el('div', { class: 'record-time', text: '0:00' });
    var punkt = el('div', { class: 'record-dot' });
    sheet.appendChild(el('div', { class: 'record-box' }, [punkt, zeit]));

    var hinweis = el('p', { class: 'hint', text: 'Mikrofon wird angefragt …' });
    sheet.appendChild(hinweis);

    var stopBtn = el('button', {
      class: 'sheet-item', type: 'button', disabled: true
    }, ['Aufnahme beenden']);
    var abbrechen = el('button', { class: 'sheet-item', type: 'button' }, ['Abbrechen']);
    sheet.appendChild(stopBtn);
    sheet.appendChild(abbrechen);
    sheetWrap.hidden = false;

    var ticker = null;
    var aufnahme = null;
    var beendet = false;

    function aufraeumen() {
      clearInterval(ticker);
      sheetWrap.hidden = true;
    }

    abbrechen.addEventListener('click', function () {
      beendet = true;
      if (aufnahme) aufnahme.cancel();
      aufraeumen();
    });

    Attachments.startRecording().then(function (rec) {
      if (beendet) { rec.cancel(); return; }
      aufnahme = rec;
      hinweis.textContent = 'Läuft – zum Beenden antippen.';
      punkt.classList.add('is-live');
      stopBtn.disabled = false;

      ticker = setInterval(function () {
        var s = rec.seconds();
        zeit.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      }, 250);

      stopBtn.addEventListener('click', function () {
        if (beendet) return;
        beendet = true;
        clearInterval(ticker);
        stopBtn.disabled = true;
        hinweis.textContent = 'Wird gespeichert …';

        rec.stop().then(function (file) {
          return Attachments.add(note.id, file);
        }).then(function (res) {
          aufraeumen();
          if (res) { toast('Sprachmemo gespeichert'); onChange(); }
        }).catch(function (err) {
          console.error(err);
          aufraeumen();
          alert('Aufnahme fehlgeschlagen:\n\n' + (err.message || err));
        });
      });
    }).catch(function (err) {
      console.error(err);
      aufraeumen();
      alert('Mikrofon nicht verfügbar:\n\n' + (err.message || err) +
            '\n\nIn den iPhone-Einstellungen unter Safari den Mikrofonzugriff erlauben.');
    });
  }

  /* ---------- Wiedervorlage ---------- */

  function dueMenu(note) {
    var heute = DB.startOfDay(Date.now());

    var auswahl = [
      { label: 'Heute', ts: heute },
      { label: 'Morgen', ts: DB.addDays(heute, 1) },
      { label: 'In 3 Tagen', ts: DB.addDays(heute, 3) },
      { label: 'Nächste Woche', ts: DB.addDays(heute, 7) }
    ].map(function (opt) {
      return {
        label: opt.label + ' · ' + new Date(opt.ts).toLocaleDateString('de-DE', {
          weekday: 'short', day: '2-digit', month: '2-digit'
        }),
        pressed: note.due === opt.ts,
        onClick: function () { applyDue(note, opt.ts); }
      };
    });

    auswahl.push({
      label: 'Datum wählen …',
      onClick: function () { dateSheet(note); }
    });

    var gruppen = [{ label: 'Wiedervorlage', items: auswahl }];

    if (note.due) {
      gruppen.push({
        items: [
          {
            label: 'Im Kalender erinnern',
            onClick: function () { sendToCalendar(note); }
          },
          {
            label: 'Wiedervorlage entfernen',
            danger: true,
            onClick: function () { applyDue(note, null); }
          }
        ]
      });
    }

    openSheet(note.title.trim() || 'Notiz', gruppen);
  }

  function applyDue(note, ts) {
    DB.setDue(note, ts).then(function () {
      toast(ts ? 'Fällig ' + formatDue(ts).text.toLowerCase() : 'Wiedervorlage entfernt');
      updateDueBadge();
      render();
    }).catch(function (err) {
      console.error(err);
      toast('Konnte nicht gespeichert werden');
    });
  }

  // Eigenes Blatt mit Datumsfeld – funktioniert auf iPhone und PC gleich.
  function dateSheet(note) {
    clear(sheet);
    sheet.appendChild(el('h2', { text: 'Datum wählen' }));

    var field = el('input', {
      class: 'search-field',
      type: 'date',
      value: toDateInput(note.due || Date.now()),
      min: toDateInput(Date.now())
    });
    sheet.appendChild(field);

    sheet.appendChild(el('button', {
      class: 'sheet-item', type: 'button',
      onclick: function () {
        var parts = field.value.split('-');
        if (parts.length !== 3) { toast('Kein gültiges Datum'); return; }
        // Monat ist bei new Date() nullbasiert
        var ts = new Date(+parts[0], +parts[1] - 1, +parts[2]).getTime();
        if (!isFinite(ts)) { toast('Kein gültiges Datum'); return; }
        closeSheet();
        applyDue(note, ts);
      }
    }, ['Übernehmen']));

    sheet.appendChild(el('button', {
      class: 'sheet-item', type: 'button', onclick: closeSheet
    }, ['Abbrechen']));

    sheetWrap.hidden = false;
    setTimeout(function () { field.focus(); }, 80);
  }

  function sendToCalendar(note) {
    Reminders.share(note).then(function (how) {
      if (how === 'abgebrochen') toast('Abgebrochen');
      else toast('Termin um ' + Reminders.ALARM_HOUR + ':00 Uhr erstellt');
    }).catch(function (err) {
      console.error(err);
      alert('Kalender-Datei konnte nicht erstellt werden:\n\n' + (err.message || err));
    });
  }

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
        label: 'Wiedervorlage',
        items: [
          {
            label: note.due ? 'Fällig: ' + formatDue(note.due).text + ' – ändern'
                            : 'Wiedervorlage setzen …',
            onClick: function () { dueMenu(note); }
          },
          {
            label: 'Im Kalender erinnern',
            onClick: function () {
              if (!note.due) {
                toast('Erst eine Wiedervorlage setzen');
                setTimeout(function () { dueMenu(note); }, 900);
                return;
              }
              sendToCalendar(note);
            }
          }
        ]
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

  /* ---------- Vorlagen ---------- */

  function templateSheet() {
    openSheet('Neue Notiz', [{
      label: 'Vorlage wählen',
      items: [{ label: 'Leere Notiz', onClick: newNote }].concat(
        Templates.list.map(function (tpl) {
          return {
            label: tpl.label,
            onClick: function () { newFromTemplate(tpl.id); }
          };
        })
      )
    }]);
  }

  function newFromTemplate(id) {
    var fields = Templates.build(id, areaFilter);
    if (!fields) { toast('Vorlage nicht gefunden'); return; }
    DB.create(fields).then(function (note) {
      go('#/note/' + note.id);
    });
  }

  // Plus-Knopf: kurz tippen = leere Notiz, lange druecken = Vorlagen
  function setupFab() {
    var timer = null;
    var longPress = false;

    function start() {
      longPress = false;
      clearTimeout(timer);
      timer = setTimeout(function () {
        longPress = true;
        if (navigator.vibrate) navigator.vibrate(12);
        templateSheet();
      }, 500);
    }

    function cancel() { clearTimeout(timer); }

    fab.addEventListener('pointerdown', start);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      fab.addEventListener(ev, cancel);
    });

    // Das iPhone zeigt beim langen Druecken sonst sein eigenes Menue
    fab.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    fab.addEventListener('click', function () {
      if (longPress) { longPress = false; return; }
      newNote();
    });
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

  /* ====================================================================
     Übertragen zwischen iPhone und PC
     ==================================================================== */

  // Bericht des letzten Einlesens, damit er nach dem Neuzeichnen bleibt
  var letzterBericht = null;

  function renderTransfer() {
    titleEl.textContent = 'Übertragen';
    backBtn.hidden = false;
    fab.hidden = true;

    clear(view);

    var kopf = el('div', { class: 'rows' });
    view.appendChild(kopf);

    /* --- Bericht des letzten Einlesens --- */
    if (letzterBericht) {
      var b = letzterBericht;
      letzterBericht = null;

      var zeilen = [
        ['Neu dazugekommen', b.added],
        ['Aktualisiert', b.updated],
        ['Unverändert', b.unchanged]
      ];
      if (b.attachments) zeilen.push(['Anhänge', b.attachments]);

      var box = el('div', { class: 'report' }, [
        el('div', { class: 'report-head', text: 'Eingelesen' }),
        el('div', { class: 'rows' }, zeilen.map(function (z) {
          return el('div', { class: 'row' }, [
            el('span', { class: 'label', text: z[0] }),
            el('span', { class: 'value', text: String(z[1]) })
          ]);
        }))
      ]);

      if (b.conflicts && b.conflicts.length) {
        box.appendChild(el('div', { class: 'report-conflict' }, [
          el('strong', {
            text: b.conflicts.length === 1
              ? '1 Notiz war auf beiden Geräten geändert'
              : b.conflicts.length + ' Notizen waren auf beiden Geräten geändert'
          }),
          el('p', { class: 'small', text: 'Die neuere Fassung steht jetzt in der Notiz. ' +
                                          'Die andere wurde als Kopie gesichert:' }),
          el('ul', { class: 'small' }, b.conflicts.map(function (t) {
            return el('li', { text: t });
          }))
        ]));
      }

      view.appendChild(box);
    }

    /* --- Die zwei Richtungen --- */
    view.appendChild(el('div', { class: 'section-head', text: 'Datei' }));

    view.appendChild(el('button', {
      class: 'btn btn-primary btn-block', type: 'button',
      onclick: function (e) {
        runExport(e.currentTarget, Backup.exportZip, 'ZIP');
      }
    }, [el('span', { text: 'Datei für das andere Gerät erzeugen' })]));

    var fileInput = el('input', {
      type: 'file', accept: '.zip,.json,application/zip,application/json', hidden: true
    });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (file) startImport(file);
    });

    view.appendChild(el('button', {
      class: 'btn btn-block', type: 'button',
      style: 'margin-top:8px',
      onclick: function () { fileInput.click(); }
    }, [el('span', { text: 'Datei vom anderen Gerät einlesen' })]));
    view.appendChild(fileInput);

    view.appendChild(el('p', { class: 'hint' }, [
      'Beide Geräte behalten ihre eigene Datenbank. Beim Einlesen wird ' +
      'zusammengeführt: Bei derselben Notiz gewinnt die neuere Fassung. ' +
      'Wurde sie auf beiden Geräten geändert, bleibt die unterlegene als ' +
      'Kopie erhalten – es geht also nichts verloren.'
    ]));

    /* --- Gerätename --- */
    view.appendChild(el('div', { class: 'section-head', text: 'Dieses Gerät' }));
    var nameRow = el('div', { class: 'rows' });
    view.appendChild(nameRow);
    view.appendChild(el('p', { class: 'hint' }, [
      'Der Name taucht in Konflikt-Kopien auf, damit du sie zuordnen kannst.'
    ]));

    /* --- Werte nachladen --- */
    Promise.all([Sync.deviceName(), Sync.lastSync(), DB.count()]).then(function (r) {
      var name = r[0];
      var seit = r[1];
      var anzahl = r[2];

      clear(kopf);
      kopf.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'label', text: 'Notizen hier' }),
        el('span', { class: 'value', text: String(anzahl) })
      ]));
      kopf.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'label', text: 'Zuletzt übertragen' }),
        el('span', {
          class: 'value',
          text: seit ? new Date(seit).toLocaleString('de-DE', {
            day: '2-digit', month: '2-digit', year: '2-digit',
            hour: '2-digit', minute: '2-digit'
          }) : 'noch nie'
        })
      ]));

      clear(nameRow);
      var feld = el('input', {
        class: 'name-field', type: 'text', value: name, maxlength: 24,
        'aria-label': 'Gerätename'
      });
      feld.addEventListener('change', function () {
        Sync.setDeviceName(feld.value).then(function () {
          toast('Name gespeichert');
          renderTransfer();
        });
      });
      nameRow.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'label', text: 'Name' }),
        feld
      ]));
    });
  }

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
        onclick: function (e) { runExport(e.currentTarget, Backup.exportZip, 'ZIP'); }
      }, [el('span', { text: 'Export ZIP' })]),
      el('button', {
        class: 'btn', type: 'button',
        onclick: function (e) { runExport(e.currentTarget, Backup.exportJson, 'JSON'); }
      }, [el('span', { text: 'Nur JSON' })])
    ]));

    var fileInput = el('input', {
      type: 'file', accept: '.zip,.json,application/zip,application/json', hidden: true
    });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (file) startImport(file);
    });

    view.appendChild(el('button', {
      class: 'btn btn-block', type: 'button',
      onclick: function () { fileInput.click(); }
    }, [el('span', { text: 'Import aus ZIP oder JSON' })]));
    view.appendChild(fileInput);

    view.appendChild(el('a', {
      class: 'btn btn-block', href: '#/uebertragen', style: 'margin-top:8px'
    }, [el('span', { text: 'Übertragen zwischen iPhone und PC →' })]));

    view.appendChild(el('p', { class: 'hint' }, [
      '**ZIP ist die vollständige Sicherung**: Notizen, Lernstand und Anhänge, ' +
      'dazu eine Markdown-Datei pro Notiz zum Lesen am PC. ' +
      'JSON enthält alles außer den Anhang-Dateien. ' +
      'Auf dem iPhone erscheint das Teilen-Menü – dort „In Dateien speichern“.'
    ].join('').replace(/\*\*/g, '')));

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
    Promise.all([Backup.status(), DB.attachmentStats(), DB.allCards()])
      .then(function (r) {
      var s = r[0];
      var att = r[1];
      var cards = r[2];

      clear(statusRows);
      statusRows.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'label', text: 'Notizen' }),
        el('span', { class: 'value', text: String(s.count) })
      ]));
      statusRows.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'label', text: 'Lernkarten' }),
        el('span', { class: 'value', text: String(cards.length) })
      ]));
      statusRows.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'label', text: 'Anhänge' }),
        el('span', {
          class: 'value',
          text: att.count + (att.count ? ' · ' + formatBytes(att.bytes) : '')
        })
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

      var inhalt = parsed.notes.length + ' Notizen';
      if (parsed.cards.length) inhalt += ', ' + parsed.cards.length + ' Karten';
      if (parsed.attachments.length) {
        inhalt += ', ' + parsed.attachments.length + ' Anhänge';
        if (!parsed.files) inhalt += ' (Dateien fehlen – war nur JSON)';
      }

      return DB.count().then(function (have) {
        openSheet('Import', [{
          label: inhalt + ' · vom ' + when,
          items: [
            {
              label: 'Zusammenführen (empfohlen)',
              onClick: function () {
                toast('Wird eingelesen …');
                Backup.apply(parsed, 'merge').then(function (r) {
                  // go() zeichnet den Bildschirm - dort wird der Bericht
                  // einmalig angezeigt und danach verworfen.
                  letzterBericht = r;
                  updateDueBadge();
                  go('#/uebertragen');
                }).catch(importFailed);
              }
            },
            {
              label: 'Alles ersetzen (' + have + ' Notizen löschen)',
              danger: true,
              onClick: function () {
                if (!confirm('Alle ' + have + ' Notizen auf diesem Gerät werden ' +
                             'gelöscht – mitsamt Lernstand und Anhängen – und durch die ' +
                             parsed.notes.length + ' aus der Datei ersetzt.\n\nFortfahren?')) return;
                toast('Wird eingelesen …');
                Backup.apply(parsed, 'replace').then(function (r) {
                  toast(r.total + ' Notizen eingelesen' +
                        (r.attachments ? ', ' + r.attachments + ' Anhänge' : ''));
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
        { label: 'Neu aus Vorlage …', onClick: templateSheet },
        { label: 'Tägliche Notiz', onClick: openDaily },
        { label: 'Aus Zwischenablage einfügen', onClick: pasteFromClipboard },
        { label: 'Übertragen (iPhone ↔ PC)', onClick: function () { go('#/uebertragen'); } },
        { label: 'Einstellungen & Backup', onClick: function () { go('#/einstellungen'); } }
      ]
    }]);
  });

  backBtn.addEventListener('click', function () {
    if (history.length > 1) history.back();
    else go('#/inbox');
  });

  setupFab();

  /* ====================================================================
     Router
     ==================================================================== */

  function render() {
    closeSheet();
    currentNoteMenu = null;
    releaseUrls();

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

    updateDueBadge();
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
    } else if (route === 'lernen') {
      done = renderLearn();
    } else if (route === 'uebertragen') {
      done = renderTransfer();
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
