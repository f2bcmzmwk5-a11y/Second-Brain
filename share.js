/* ==========================================================================
   share.js – eine fertige Datei an den Nutzer uebergeben

   Auf dem iPhone funktioniert "Datei herunterladen" in einer installierten
   PWA nicht zuverlaessig. Darum zuerst das Teilen-Menue benutzen
   (dort: "In Dateien speichern"), sonst normaler Download.

   Wird von backup.js (Export) und reminders.js (Kalender) benutzt.
   ========================================================================== */

window.ShareFile = (function () {
  'use strict';

  /**
   * Gibt die Datei an den Nutzer weiter.
   * @returns 'geteilt' | 'gespeichert' | 'abgebrochen'
   */
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

  // Dateinamen muessen auf Windows und Mac funktionieren.
  function safeName(title, fallback) {
    var base = String(title || fallback || 'ohne-titel')
      .replace(/[\\/:*?"<>|#\n\r\t]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    if (!base || base === '-') base = fallback || 'ohne-titel';
    return base;
  }

  function stamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           '_' + p(d.getHours()) + p(d.getMinutes());
  }

  return {
    deliver: deliver,
    safeName: safeName,
    stamp: stamp
  };
})();
