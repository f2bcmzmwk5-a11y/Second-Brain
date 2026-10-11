/* ==========================================================================
   markdown.js – Text auswerten und darstellen

   Erkennt zusaetzlich zum normalen Markdown:
     [[Notizname]]          Verknuepfung auf eine andere Notiz
     [[Notizname|Anzeige]]  Verknuepfung mit abweichendem Text
     #tag                   Schlagwort
   Beides wird in normale Markdown-Links umgeschrieben, bevor marked laeuft.
   ========================================================================== */

window.MD = (function () {
  'use strict';

  var RE_LINK = /\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/g;
  // Ein Tag beginnt nach Zeilenanfang oder Leerzeichen/Satzzeichen.
  // "# Titel" ist eine Ueberschrift (Leerzeichen hinter #) und kein Tag.
  var RE_TAG = /(^|[\s(,;:!?"'])#([\p{L}\p{N}][\p{L}\p{N}_-]{0,39})/gu;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Code soll unangetastet bleiben: Text in ``` ``` und `...` wird
     uebersprungen. split() mit Klammergruppe legt die Code-Teile auf die
     ungeraden Positionen. */
  function outsideCode(src, fn) {
    return String(src || '')
      .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
      .map(function (part, i) { return i % 2 ? part : fn(part); })
      .join('');
  }

  /* ---------- Auswerten ---------- */

  // Alle [[Ziele]] einer Notiz, ohne Doppelte, in Originalschreibweise.
  function links(body) {
    var out = [], seen = {};
    outsideCode(body, function (text) {
      var m;
      RE_LINK.lastIndex = 0;
      while ((m = RE_LINK.exec(text))) {
        var target = m[1].trim();
        var key = target.toLowerCase();
        if (target && !seen[key]) { seen[key] = 1; out.push(target); }
      }
      return text;
    });
    return out;
  }

  // Alle #tags einer Notiz, kleingeschrieben, ohne Doppelte.
  function tags(body) {
    var out = [], seen = {};
    outsideCode(body, function (text) {
      var m;
      RE_TAG.lastIndex = 0;
      while ((m = RE_TAG.exec(text))) {
        var tag = m[2].toLowerCase();
        if (!seen[tag]) { seen[tag] = 1; out.push(tag); }
      }
      return text;
    });
    return out;
  }

  // Kurzer Vorschautext fuer die Liste: Markdown-Zeichen entfernen.
  function snippet(body, max) {
    var text = String(body || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(RE_LINK, function (_, t, label) { return label || t; })
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s*[-*+]\s+(\[[ xX]\]\s*)?/gm, '')
      .replace(/[*_~`]/g, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    max = max || 160;
    return text.length > max ? text.slice(0, max).trim() + '…' : text;
  }

  /* ---------- Darstellen ---------- */

  function toMarkdown(body) {
    return outsideCode(body, function (text) {
      return text
        .replace(RE_LINK, function (_, target, label) {
          var t = target.trim();
          return '[' + (label ? label.trim() : t) + '](#/titel/' + encodeURIComponent(t) + ')';
        })
        .replace(RE_TAG, function (_, before, tag) {
          return before + '[#' + tag + '](#/tag/' + encodeURIComponent(tag.toLowerCase()) + ')';
        });
    });
  }

  // Einfacher Ersatz, falls marked nicht geladen wurde (z. B. erster Start
  // ohne Netz). Deckt Ueberschriften, Listen, fett/kursiv und Links ab.
  function fallbackRender(md) {
    var html = escapeHtml(md);

    html = html.replace(/^(\s{0,3})(#{1,6})\s+(.*)$/gm, function (_, sp, hashes, text) {
      var n = hashes.length;
      return '<h' + n + '>' + text + '</h' + n + '>';
    });
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
    html = html.replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+)/g, '$1<a href="$2">$2</a>');
    html = html.replace(/^\s*[-*+]\s+(.*)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
    html = html.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');

    return '<p>' + html + '</p>';
  }

  var markedReady = false;

  function setupMarked() {
    if (markedReady || typeof marked === 'undefined') return;
    marked.setOptions({
      gfm: true,       // Tabellen, Checkboxen, automatische Links
      breaks: true     // einzelner Zeilenumbruch bleibt ein Umbruch
    });
    markedReady = true;
  }

  /**
   * Erzeugt die HTML-Vorschau.
   * @param body      Markdown-Text der Notiz
   * @param existing  Set mit vorhandenen titleKeys – fehlende [[Links]]
   *                  werden dann gestrichelt dargestellt.
   */
  function render(body, existing) {
    setupMarked();
    var md = toMarkdown(body);
    var html;

    try {
      html = markedReady ? marked.parse(md) : fallbackRender(md);
    } catch (err) {
      console.warn('Markdown konnte nicht gelesen werden:', err);
      html = fallbackRender(md);
    }

    var box = document.createElement('div');
    box.className = 'preview';
    box.innerHTML = html;

    box.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href');

      if (href.indexOf('#/titel/') === 0) {
        var key = decodeURIComponent(href.slice(8)).trim().toLowerCase();
        if (existing && !existing.has(key)) {
          a.className = 'wikilink-missing';
          a.title = 'Notiz existiert noch nicht – antippen zum Anlegen';
        }
      } else if (/^(https?:|mailto:|tel:)/i.test(href)) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
    });

    // Checkboxen in der Vorschau nur anzeigen, nicht bedienbar
    box.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.disabled = true;
    });

    return box;
  }

  return {
    links: links,
    tags: tags,
    snippet: snippet,
    render: render,
    escapeHtml: escapeHtml
  };
})();
