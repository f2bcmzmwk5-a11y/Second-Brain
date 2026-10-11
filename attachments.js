/* ==========================================================================
   attachments.js – Fotos, PDFs und Sprachmemos an einer Notiz

   Die Dateien liegen als Blob in IndexedDB, also wie alles andere
   nur auf dem Geraet.

   Bilder werden vor dem Speichern verkleinert (lange Kante 1600 Pixel,
   JPEG). Ein iPhone-Foto geht so von ~4 MB auf wenige hundert KB.
   ========================================================================== */

window.Attachments = (function () {
  'use strict';

  var MAX_EDGE = 1600;
  var JPEG_QUALITY = 0.82;
  var WARN_BYTES = 20 * 1024 * 1024;   // ab hier nachfragen

  /* ---------- Hinzufuegen ---------- */

  function isImage(type) { return /^image\//.test(type || ''); }
  function isAudio(type) { return /^audio\//.test(type || ''); }
  function isPdf(type) { return /pdf/.test(type || ''); }

  function formatBytes(n) {
    if (n == null) return '–';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  /**
   * Verkleinert ein Bild ueber ein Canvas.
   * Klappt es nicht (seltene Formate), wird das Original behalten.
   */
  function shrinkImage(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();

      img.onload = function () {
        URL.revokeObjectURL(url);

        var w = img.naturalWidth;
        var h = img.naturalHeight;
        if (!w || !h) { resolve(file); return; }

        var faktor = Math.min(1, MAX_EDGE / Math.max(w, h));
        // Kleine Bilder bleiben unangetastet
        if (faktor === 1 && file.size < 500 * 1024) { resolve(file); return; }

        var canvas = document.createElement('canvas');
        canvas.width = Math.round(w * faktor);
        canvas.height = Math.round(h * faktor);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(function (blob) {
          // Nur nehmen, wenn es wirklich kleiner geworden ist
          resolve(blob && blob.size < file.size ? blob : file);
        }, 'image/jpeg', JPEG_QUALITY);
      };

      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(file);   // z. B. HEIC, das der Browser nicht oeffnet
      };

      img.src = url;
    });
  }

  function niceName(file, blob) {
    var name = file.name || '';
    if (!name) {
      if (isAudio(blob.type)) name = 'Sprachmemo';
      else if (isImage(blob.type)) name = 'Foto';
      else name = 'Datei';
    }
    // Umgewandeltes Bild bekommt die passende Endung
    if (isImage(blob.type) && blob.type === 'image/jpeg' && !/\.(jpe?g)$/i.test(name)) {
      name = name.replace(/\.[^.]+$/, '') + '.jpg';
    }
    return name;
  }

  /**
   * Haengt eine Datei an eine Notiz.
   * @returns den gespeicherten Eintrag (ohne den Blob zu kopieren)
   */
  function add(noteId, file) {
    var vorbereiten = isImage(file.type) ? shrinkImage(file) : Promise.resolve(file);

    return vorbereiten.then(function (blob) {
      if (blob.size > WARN_BYTES) {
        var weiter = confirm(
          'Die Datei ist ' + formatBytes(blob.size) + ' groß.\n\n' +
          'Große Anhänge füllen den Speicher des iPhones schnell.\n\nTrotzdem anhängen?'
        );
        if (!weiter) return null;
      }

      var eintrag = {
        id: DB.uid(),
        noteId: noteId,
        name: niceName(file, blob),
        type: blob.type || file.type || 'application/octet-stream',
        size: blob.size,
        created: Date.now(),
        blob: blob
      };

      return DB.putAttachment(eintrag).then(function () { return eintrag; });
    });
  }

  function addMany(noteId, files) {
    var liste = Array.prototype.slice.call(files);
    var hinzugefuegt = 0;

    return liste.reduce(function (kette, file) {
      return kette.then(function () {
        return add(noteId, file).then(function (res) { if (res) hinzugefuegt++; });
      });
    }, Promise.resolve()).then(function () { return hinzugefuegt; });
  }

  /* ---------- Sprachmemo aufnehmen ---------- */

  function supportedAudioType() {
    if (typeof MediaRecorder === 'undefined') return null;
    var kandidaten = [
      'audio/mp4',                 // Safari / iPhone
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus'
    ];
    for (var i = 0; i < kandidaten.length; i++) {
      if (MediaRecorder.isTypeSupported(kandidaten[i])) return kandidaten[i];
    }
    return '';
  }

  function canRecord() {
    return !!(navigator.mediaDevices &&
              navigator.mediaDevices.getUserMedia &&
              typeof MediaRecorder !== 'undefined');
  }

  /**
   * Startet eine Aufnahme. Gibt ein Objekt mit stop() und cancel() zurueck.
   * stop() liefert die fertige Datei.
   */
  function startRecording() {
    if (!canRecord()) {
      return Promise.reject(new Error('Aufnahme wird auf diesem Gerät nicht unterstützt.'));
    }

    var mimeType = supportedAudioType();

    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var options = mimeType ? { mimeType: mimeType } : undefined;
      var recorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (e) {
        recorder = new MediaRecorder(stream);
      }

      var teile = [];
      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size) teile.push(e.data);
      };

      var fertig = new Promise(function (resolve) {
        recorder.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          var typ = recorder.mimeType || mimeType || 'audio/mp4';
          resolve(new Blob(teile, { type: typ }));
        };
      });

      recorder.start();
      var begonnen = Date.now();

      return {
        seconds: function () { return Math.floor((Date.now() - begonnen) / 1000); },
        stop: function () {
          if (recorder.state !== 'inactive') recorder.stop();
          return fertig.then(function (blob) {
            var endung = /mp4/.test(blob.type) ? 'm4a' : (/ogg/.test(blob.type) ? 'ogg' : 'webm');
            var d = new Date();
            var p = function (n) { return String(n).padStart(2, '0'); };
            var name = 'Sprachmemo ' + p(d.getDate()) + '.' + p(d.getMonth() + 1) + '. ' +
                       p(d.getHours()) + '-' + p(d.getMinutes()) + '.' + endung;
            return new File([blob], name, { type: blob.type });
          });
        },
        cancel: function () {
          if (recorder.state !== 'inactive') recorder.stop();
          stream.getTracks().forEach(function (t) { t.stop(); });
        }
      };
    });
  }

  /* ---------- Dateiendung fuer den ZIP-Export ---------- */

  function extensionFor(att) {
    var vonName = /\.([a-z0-9]{1,5})$/i.exec(att.name || '');
    if (vonName) return vonName[1].toLowerCase();

    var typ = att.type || '';
    if (/jpeg|jpg/.test(typ)) return 'jpg';
    if (/png/.test(typ)) return 'png';
    if (/gif/.test(typ)) return 'gif';
    if (/webp/.test(typ)) return 'webp';
    if (/pdf/.test(typ)) return 'pdf';
    if (/mp4|m4a/.test(typ)) return 'm4a';
    if (/webm/.test(typ)) return 'webm';
    if (/ogg/.test(typ)) return 'ogg';
    return 'bin';
  }

  return {
    add: add,
    addMany: addMany,
    startRecording: startRecording,
    canRecord: canRecord,
    isImage: isImage,
    isAudio: isAudio,
    isPdf: isPdf,
    formatBytes: formatBytes,
    extensionFor: extensionFor,
    MAX_EDGE: MAX_EDGE
  };
})();
