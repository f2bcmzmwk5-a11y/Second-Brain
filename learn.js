/* ==========================================================================
   learn.js – Lernmodus

   Zeigt die faelligen Karten nacheinander. Die Antwort bleibt verdeckt,
   bis man tippt. Danach vier Knoepfe mit dem jeweils naechsten Abstand.

   Mit "Nochmal" bewertete Karten kommen noch in derselben Runde wieder.
   ========================================================================== */

window.Learn = (function () {
  'use strict';

  /**
   * Baut den Lernmodus in einen Container.
   * @param view     Element, in das gezeichnet wird
   * @param helpers  { el, clear, toast, go }
   */
  function render(view, helpers) {
    var el = helpers.el;
    var clear = helpers.clear;

    var stapel = [];
    var erledigt = 0;
    var gesamt = 0;
    var bewertungen = { nochmal: 0, schwer: 0, gut: 0, leicht: 0 };

    return DB.dueCards().then(function (cards) {
      stapel = cards.slice();
      gesamt = stapel.length;
      zeichne();
    });

    function zeichne() {
      clear(view);

      if (!stapel.length) {
        view.appendChild(fertig());
        return;
      }

      var card = stapel[0];

      /* --- Fortschritt --- */
      var anteil = gesamt ? (erledigt / (erledigt + stapel.length)) * 100 : 0;
      view.appendChild(el('div', { class: 'learn-progress' }, [
        el('div', { class: 'bar' }, [el('i', { style: 'width:' + anteil + '%' })]),
        el('div', { class: 'learn-count small muted' }, [
          erledigt + ' von ' + (erledigt + stapel.length)
        ])
      ]));

      /* --- Karte --- */
      var rueckseite = el('div', { class: 'learn-back', hidden: true });
      rueckseite.appendChild(MD.render(card.back, new Set()));

      var zeigen = el('button', {
        class: 'btn btn-primary btn-block', type: 'button',
        onclick: function () {
          rueckseite.hidden = false;
          zeigen.hidden = true;
          knoepfe.hidden = false;
        }
      }, [el('span', { text: 'Antwort zeigen' })]);

      var knoepfe = el('div', { class: 'learn-ratings', hidden: true });
      Cards.RATINGS.forEach(function (r) {
        knoepfe.appendChild(el('button', {
          class: 'learn-rating learn-' + r.id,
          type: 'button',
          onclick: function () { bewerte(card, r); }
        }, [
          el('strong', { text: r.label }),
          el('span', { class: 'small', text: Cards.nextLabel(card, r.value) })
        ]));
      });

      var karte = el('div', { class: 'learn-card' }, [
        el('div', { class: 'learn-front' }, [MD.render(card.front, new Set())]),
        rueckseite
      ]);

      // Auch ein Tipp auf die Karte deckt die Antwort auf
      karte.addEventListener('click', function () {
        if (!rueckseite.hidden) return;
        zeigen.click();
      });

      view.appendChild(karte);
      view.appendChild(zeigen);
      view.appendChild(knoepfe);

      /* --- Herkunft --- */
      view.appendChild(el('div', { class: 'learn-source' }, [
        el('a', {
          href: '#/note/' + card.noteId,
          class: 'small muted',
          text: 'Zur Notiz'
        })
      ]));
    }

    function bewerte(card, rating) {
      bewertungen[rating.id]++;
      Cards.schedule(card, rating.value);

      DB.putCard(card).then(function () {
        stapel.shift();

        if (rating.value === 0) {
          // Nicht gewusst: spaeter in dieser Runde nochmal zeigen
          var pos = Math.min(stapel.length, 3);
          stapel.splice(pos, 0, card);
        } else {
          erledigt++;
        }

        zeichne();
      }).catch(function (err) {
        console.error(err);
        helpers.toast('Konnte nicht gespeichert werden');
      });
    }

    function fertig() {
      if (!gesamt) {
        return el('div', { class: 'empty' }, [
          el('strong', { text: 'Heute nichts zu lernen' }),
          el('span', { text: 'Karten entstehen aus Zeilen mit :: in deinen Notizen.' })
        ]);
      }

      return el('div', { class: 'learn-done' }, [
        el('div', { class: 'learn-done-mark', text: '✓' }),
        el('h2', { text: 'Fertig für heute' }),
        el('p', { class: 'muted', text: gesamt + (gesamt === 1 ? ' Karte' : ' Karten') + ' wiederholt' }),
        el('div', { class: 'rows' }, Cards.RATINGS.map(function (r) {
          return el('div', { class: 'row' }, [
            el('span', { class: 'label', text: r.label }),
            el('span', { class: 'value', text: String(bewertungen[r.id]) })
          ]);
        })),
        el('button', {
          class: 'btn btn-block', type: 'button',
          onclick: function () { helpers.go('#/inbox'); }
        }, [el('span', { text: 'Zurück zur Inbox' })])
      ]);
    }
  }

  return { render: render };
})();
