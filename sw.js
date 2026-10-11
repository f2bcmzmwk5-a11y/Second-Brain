/* ==========================================================================
   sw.js – Service Worker: macht die App offline nutzbar

   WICHTIG BEI JEDER AENDERUNG AN DEN DATEIEN:
   VERSION unten hochzaehlen. Sonst benutzt das iPhone weiter die alten
   Dateien aus dem Zwischenspeicher.
   ========================================================================== */

var VERSION = 'v1.3.0';
var CACHE = 'second-brain-' + VERSION;

// Eigene Dateien – muessen alle vorhanden sein.
var APP_FILES = [
  './',
  './index.html',
  './style.css',
  './db.js',
  './markdown.js',
  './share.js',
  './sync.js',
  './flashcards.js',
  './attachments.js',
  './backup.js',
  './templates.js',
  './reminders.js',
  './learn.js',
  './app.js',
  './manifest.json',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

// Fremde Dateien – wenn sie fehlen, laeuft die App trotzdem.
var EXTRA_FILES = [
  'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(APP_FILES).then(function () {
        // Einzeln laden, damit ein Fehler die Installation nicht abbricht
        return Promise.all(EXTRA_FILES.map(function (url) {
          return cache.add(new Request(url, { mode: 'cors' }))
            .catch(function () { /* ohne Netz halt spaeter */ });
        }));
      });
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name.indexOf('second-brain-') === 0 && name !== CACHE) {
          return caches.delete(name);
        }
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) {
  var data = e.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'GET_VERSION' && e.source) {
    e.source.postMessage({ type: 'VERSION', version: VERSION });
  }
});

/* Strategie: zuerst aus dem Zwischenspeicher antworten (schnell, offline),
   im Hintergrund eine frische Fassung holen und ablegen. */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  var isExtra = EXTRA_FILES.indexOf(req.url) !== -1;
  if (!sameOrigin && !isExtra) return;

  // Seitenaufruf: immer die index.html ausliefern (eine Seite, Routing per #)
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(function (hit) {
        return hit || fetch(req);
      })
    );
    return;
  }

  e.respondWith(handle(e));
});

function handle(e) {
  var req = e.request;

  return caches.match(req).then(function (hit) {
    var fresh = fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) {
        var copy = res.clone();
        return caches.open(CACHE).then(function (c) {
          return c.put(req, copy);
        }).then(function () { return res; });
      }
      return res;
    });

    if (hit) {
      // Antwort kommt sofort aus dem Speicher. waitUntil haelt den Service
      // Worker am Leben, bis die frische Fassung abgelegt ist - ohne das
      // wird die Aktualisierung abgebrochen und Updates kommen nie an.
      e.waitUntil(fresh.catch(function () { /* offline: egal */ }));
      return hit;
    }

    return fresh;
  });
}
