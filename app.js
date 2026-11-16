/* MarathonIndia - static race calendar. Data: races.json (community-maintained, agent-refreshed). */
(function () {
  'use strict';

  var state = { city: 'all', zone: '', st: '', dist: '', certOnly: false, q: '', when: '', sport: '' };
  var races = [];

  var el = {
    races: document.getElementById('races'),
    count: document.getElementById('count'),
    empty: document.getElementById('empty'),
    fState: document.getElementById('f-state'),
    fCity: document.getElementById('f-city'),
    fDist: document.getElementById('f-dist'),
    fCert: document.getElementById('f-cert'),
    fSearch: document.getElementById('f-search'),
    fHome: document.getElementById('f-home'),
    locate: document.getElementById('f-locate'),
    nearPanel: document.getElementById('near-panel'),
    nearNote: document.getElementById('near-note'),
    nearBtn: document.querySelector('[data-city="near"]')
  };


  // "Near me": the visitor picks a metro, or taps "Use my location" (browser
  // permission asked only on that tap). The choice is kept in this browser's
  // localStorage only. Nothing is sent anywhere; no external lookup is used.
  var METROS = [
    { name: 'Pune', lat: 18.52, lon: 73.86, alias: ['pune'] },
    { name: 'Mumbai', lat: 19.08, lon: 72.88, alias: ['mumbai', 'thane', 'malad', 'bkc'] },
    { name: 'Delhi NCR', lat: 28.61, lon: 77.21, alias: ['delhi', 'noida', 'gurugram', 'gurgaon', 'ghaziabad', 'faridabad'] },
    { name: 'Bengaluru', lat: 12.97, lon: 77.59, alias: ['bengaluru', 'bangalore'] },
    { name: 'Hyderabad', lat: 17.39, lon: 78.49, alias: ['hyderabad', 'gachibowli', 'secunderabad'] },
    { name: 'Chennai', lat: 13.08, lon: 80.27, alias: ['chennai'] },
    { name: 'Kolkata', lat: 22.57, lon: 88.36, alias: ['kolkata', 'calcutta'] },
    { name: 'Ahmedabad', lat: 23.02, lon: 72.57, alias: ['ahmedabad', 'amdavad'] },
    { name: 'Vadodara', lat: 22.31, lon: 73.18, alias: ['vadodara', 'baroda'] },
    { name: 'Jaipur', lat: 26.91, lon: 75.79, alias: ['jaipur'] },
    { name: 'Kochi', lat: 9.93, lon: 76.27, alias: ['kochi', 'cochin'] },
    { name: 'Goa', lat: 15.5, lon: 73.83, alias: ['goa'] },
    { name: 'Dehradun', lat: 30.32, lon: 78.03, alias: ['dehradun'] },
    { name: 'Bhubaneswar', lat: 20.3, lon: 85.82, alias: ['bhubaneswar'] },
    { name: 'Indore', lat: 22.72, lon: 75.86, alias: ['indore'] },
    { name: 'Bhopal', lat: 23.26, lon: 77.41, alias: ['bhopal'] },
    { name: 'Chandigarh', lat: 30.73, lon: 76.78, alias: ['chandigarh', 'mohali', 'panchkula'] },
    { name: 'Visakhapatnam', lat: 17.69, lon: 83.22, alias: ['visakhapatnam', 'vizag'] },
    { name: 'Thiruvananthapuram', lat: 8.52, lon: 76.94, alias: ['thiruvananthapuram', 'trivandrum'] }
  ];
  var HOME_KEY = 'marathonindia.home';
  function metroByName(n) { for (var i = 0; i < METROS.length; i++) if (METROS[i].name === n) return METROS[i]; return null; }
  function getHome() { try { var h = localStorage.getItem(HOME_KEY); return metroByName(h) ? h : ''; } catch (e) { return ''; } }
  function setHome(n) { state.home = n; try { if (n) localStorage.setItem(HOME_KEY, n); else localStorage.removeItem(HOME_KEY); } catch (e) {} }
  function metrosIn(text) {
    var t = (text || '').toLowerCase();
    return METROS.filter(function (m) { return m.alias.some(function (a) { return t.indexOf(a) !== -1; }); })
      .map(function (m) { return m.name; });
  }
  // Local match uses the listed city (or a locality inside it) first; the race
  // name only decides when the city names no metro. A record whose city and name
  // point to different metros is unresolved and is left out of local-only views
  // (it still shows under All India). Source records are never modified.
  function isLocal(r, home) {
    if (!metroByName(home)) return true;
    var cm = metrosIn(r.city), nm = metrosIn(r.name);
    if (cm.length > 1) return false;
    if (cm.length === 1) return cm[0] === home && !nm.some(function (x) { return x !== cm[0]; });
    return nm.length === 1 && nm[0] === home;
  }
  // Zone of a metro, taken from the data itself (most common zone among its races).
  function metroZone(name) {
    var m = metroByName(name), n = {}, best = '', bc = 0;
    if (!m) return '';
    races.forEach(function (r) {
      if (r.zone && metrosIn(r.city).length === 1 && metrosIn(r.city)[0] === name) n[r.zone] = (n[r.zone] || 0) + 1;
    });
    Object.keys(n).forEach(function (z) { if (n[z] > bc) { bc = n[z]; best = z; } });
    return best;
  }
  function km(a, b, c, d) {
    var R = 6371, t = Math.PI / 180, dl = (c - a) * t, dn = (d - b) * t;
    var x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a * t) * Math.cos(c * t) * Math.sin(dn / 2) * Math.sin(dn / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function isCertified(r) {
    return /AIMS|World Athletics|WA |ITRA/i.test(r.certification || '');
  }

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function raceDate(r) {
    var m = (r.dateText || '').match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
    if (!m) return null;
    return new Date(Number(m[3]), MONTHS.indexOf(m[2].slice(0, 3)), Number(m[1]));
  }
  // End of event (ranges use their last day); events expire at end of day IST.
  function raceEndDate(r) {
    var t = r.dateText || '';
    var m = t.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
    if (m) { var e = new Date(Number(m[4]), MONTHS.indexOf(m[3].slice(0, 3)), Number(m[2])); e.setHours(23, 59, 59, 999); return e; }
    var s = raceDate(r);
    if (s) s.setHours(23, 59, 59, 999);
    return s;
  }

  // Next calendar month / next calendar quarter as YYYY-MM keys, computed
  // from today so labels and filtering stay correct over time.
  function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function nextMonths(n) {
    var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1);
    var keys = [];
    for (var i = 0; i < n; i++) { keys.push(monthKey(d)); d.setMonth(d.getMonth() + 1); }
    return keys;
  }
  // Next calendar quarter (e.g. Jan-Mar after any month in Oct-Dec).
  function nextQuarter() {
    var d = new Date();
    var q = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 1);
    var keys = [];
    for (var i = 0; i < 3; i++) { keys.push(monthKey(q)); q.setMonth(q.getMonth() + 1); }
    return keys;
  }
  function thisWeekend() {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    var sat = new Date(d); sat.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
    var sun = new Date(sat); sun.setDate(sat.getDate() + 1); sun.setHours(23, 59, 59, 999);
    return [sat, sun];
  }

  function matches(r) {
    // Past editions stay in the data but are not shown; undated races
    // (next edition to be confirmed) stay visible as unconfirmed.
    var end = raceEndDate(r);
    if (end && end < new Date()) return false;
    if (state.sport && (r.sport || 'run') !== state.sport) return false;
    if (state.when === 'weekend') {
      var rd = raceDate(r), w = thisWeekend();
      if (!rd || rd < w[0] || rd > w[1]) return false;
    } else if (state.when === 'month') {
      if (r.month !== nextMonths(1)[0]) return false;
    } else if (state.when === 'quarter') {
      if (nextQuarter().indexOf(r.month) === -1) return false;
    }
    if (state.city === 'near' && state.home && !isLocal(r, state.home)) return false;
    if (state.zone && r.zone !== state.zone) return false;
    if (state.st && r.state !== state.st) return false;
    if (state.citySel && r.city !== state.citySel) return false;
    if (state.dist && (r.distances || []).indexOf(state.dist) === -1) return false;
    if (state.certOnly && !isCertified(r)) return false;
    if (state.q) {
      var hay = (r.name + ' ' + r.city + ' ' + r.state + ' ' + (r.certification || '')).toLowerCase();
      if (hay.indexOf(state.q) === -1) return false;
    }
    return true;
  }

  function optionList(select, values, label) {
    select.innerHTML = '';
    var first = document.createElement('option');
    first.value = '';
    first.textContent = label;
    select.appendChild(first);
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      select.appendChild(o);
    });
  }

  function refreshFilterOptions() {
    var states = [], cities = [];
    races.forEach(function (r) {
      if (state.zone && r.zone !== state.zone) return;
      if (r.state && states.indexOf(r.state) === -1) states.push(r.state);
      if (r.city && cities.indexOf(r.city) === -1) cities.push(r.city);
    });
    states.sort(); cities.sort();
    optionList(el.fState, states, 'Every state');
    optionList(el.fCity, cities, 'Every city');
  }

  function certTag(cert) {
    // Explicit per-race tag in the data wins: certification expiry is never
    // derived from the first or last year appearing in prose.
    if (/AIMS member/i.test(cert) && !/WA course cert/i.test(cert)) return 'AIMS member';
    var m = cert.match(/^WA course cert: (.+?) to (\d{4})/);
    if (m) return 'WA course cert: ' + m[1].replace(/"/g, '').replace(/\s+/g, ' ') + ' to ' + m[2];
    if (/ITRA listed/i.test(cert) && !/WA/i.test(cert)) return 'ITRA listed';
    return '';
  }

  function render() {
    var list = races.filter(matches);
    el.races.innerHTML = '';
    list.forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'card';
      var url = r.url || '';
      if (url.charAt(0) === '/' && url.charAt(1) !== '/') url = 'https://punerunners.com' + url;

      var html = '';
      html += '<div class="card__date">' + (r.dateText || 'Date to be confirmed') + '</div>';
      html += '<div class="card__name"></div>';
      html += '<div class="card__place"></div>';
      var ct = r.certTag || (r.certification ? certTag(r.certification) : '');
      if ((r.distances || []).length || ct) {
        html += '<div class="tags">';
        (r.distances || []).forEach(function (d) { html += '<span class="tag">' + d + '</span>'; });
        if (ct) html += '<span class="tag tag--cert">' + ct + '</span>';
        html += '</div>';
      }
      if (r.certification) html += '<p class="card__cert"></p>';
      if ((r.fees || []).length) html += '<p class="card__fees">Fees: ' + r.fees.join(' · ') + '</p>';
      if (r.gstNote) html += '<p class="card__gst"></p>';
      if (r.requirements) html += '<p class="card__req"></p>';
      if (r.hasDiscount) html += '<p class="card__discount">Club discount listed - see race page</p>';
      if (r.note) html += '<p class="card__note"></p>';
      if (r.lastChecked) html += '<p class="card__checked"></p>';
      if (url) html += '<div class="card__actions"><span class="action"></span></div>';
      card.innerHTML = html;
      card.querySelector('.card__name').textContent = r.name;
      card.querySelector('.card__place').textContent = [r.city, r.state].filter(Boolean).join(', ');
      var certEl = card.querySelector('.card__cert');
      if (certEl) certEl.textContent = r.certification;
      var gstEl = card.querySelector('.card__gst');
      if (gstEl) gstEl.textContent = r.gstNote;
      var reqEl = card.querySelector('.card__req');
      if (reqEl) reqEl.textContent = 'Requirements: ' + r.requirements;
      var chkEl = card.querySelector('.card__checked');
      if (chkEl) chkEl.textContent = r.lastChecked;
      var noteEl = card.querySelector('.card__note');
      if (noteEl) noteEl.textContent = r.note;
      if (url) {
        var link = card.querySelector('.action');
        link.textContent = r.ctaLabel || 'Official site and registration';
        link.addEventListener('click', function () { window.open(url, '_blank', 'noopener'); });
      }
      el.races.appendChild(card);
    });
    syncNear();
    el.empty.hidden = list.length > 0;
    var eb = document.getElementById('empty-all');
    if (eb) eb.hidden = !(state.city === 'near' && state.home);
    el.count.textContent = list.length + (list.length === 1 ? ' race' : ' races') +
      (state.city === 'near' ? (state.home ? ' listed for ' + state.home : ' across India. Choose your city above to see local races first') : state.zone ? ' in ' + state.zone + ' India' : ' across India');
    if (state.msg) el.count.textContent += '. ' + state.msg;
  }

  // Date chips carry their exact ranges in the label, so 'next month' and
  // 'next quarter' mean the calendar month/quarter, visible at a glance.
  (function () {
    var nm = new Date(); nm.setDate(1); nm.setMonth(nm.getMonth() + 1);
    var qk = nextQuarter();
    var q = qk.map(function (k) { return MONTHS[Number(k.slice(5)) - 1]; });
    var w = thisWeekend();
    var wtxt = MONTHS[w[0].getMonth()] + ' ' + w[0].getDate() + '-' + (w[0].getMonth() === w[1].getMonth() ? '' : MONTHS[w[1].getMonth()] + ' ') + w[1].getDate();
    document.querySelectorAll('[data-when]').forEach(function (btn) {
      var v = btn.getAttribute('data-when');
      if (v === 'weekend') btn.textContent = 'This weekend (' + wtxt + ')';
      if (v === 'month') btn.textContent = 'Next month (' + MONTHS[nm.getMonth()] + ')';
      if (v === 'quarter') btn.textContent = 'Next quarter (' + q[0] + '-' + q[2] + ')';
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-when]').forEach(function (b) { b.classList.remove('is-on'); });
        btn.classList.add('is-on');
        state.when = v;
        render();
      });
    });
  })();
  document.querySelectorAll('[data-sport]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-sport]').forEach(function (b) { b.classList.remove('is-on'); });
      btn.classList.add('is-on');
      state.sport = btn.getAttribute('data-sport');
      state.msg = '';
      render();
    });
  });
  document.querySelectorAll('[data-zone]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-zone]').forEach(function (b) { b.classList.remove('is-on'); });
      btn.classList.add('is-on');
      state.zone = btn.getAttribute('data-zone');
      state.st = ''; state.citySel = '';
      // A zone that contains the chosen local city keeps it. A zone that does
      // not (or a plain Pune-first-style list) switches to All India, and says so.
      state.msg = '';
      if (state.city === 'near' && state.home && state.zone && metroZone(state.home) !== state.zone) {
        state.city = 'all';
        state.msg = 'Switched to All India because ' + state.home + ' is not in the ' + state.zone + ' zone.';
        document.querySelectorAll('[data-city]').forEach(function (b) {
          b.classList.toggle('is-on', b.getAttribute('data-city') === 'all');
        });
      }
      refreshFilterOptions();
      render();
    });
  });
  document.querySelectorAll('[data-city]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-city]').forEach(function (b) { b.classList.remove('is-on'); });
      btn.classList.add('is-on');
      state.city = btn.getAttribute('data-city');
      state.msg = '';
      reconcileZone();
      render();
    });
  });
  el.fState.addEventListener('change', function () { state.st = el.fState.value; render(); });
  el.fCity.addEventListener('change', function () { state.citySel = el.fCity.value; render(); });
  el.fDist.addEventListener('change', function () { state.dist = el.fDist.value; render(); });
  el.fCert.addEventListener('change', function () { state.certOnly = el.fCert.checked; render(); });
  el.fSearch.addEventListener('input', function () { state.q = el.fSearch.value.trim().toLowerCase(); render(); });


  // If a zone is selected that does not contain the chosen local city, clear the zone visibly.
  function reconcileZone() {
    if (state.city === 'near' && state.home && state.zone && metroZone(state.home) !== state.zone) {
      state.msg = 'Zone cleared because ' + state.home + ' is not in the ' + state.zone + ' zone.';
      state.zone = ''; state.st = ''; state.citySel = '';
      document.querySelectorAll('[data-zone]').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-zone') === ''); });
      refreshFilterOptions();
    }
  }
  function syncNear() {
    var on = state.city === 'near';
    if (el.nearPanel) el.nearPanel.hidden = !on;
    if (el.nearBtn) el.nearBtn.textContent = state.home ? 'Near ' + state.home : 'Near me';
    if (el.fHome && el.fHome.value !== (state.home || '')) el.fHome.value = state.home || '';
  }
  if (el.fHome) {
    METROS.forEach(function (m) { var o = document.createElement('option'); o.value = m.name; o.textContent = m.name; el.fHome.appendChild(o); });
    state.home = getHome();
    if (state.home) state.city = 'near';
    document.querySelectorAll('[data-city]').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-city') === state.city); });
    el.fHome.addEventListener('change', function () { setHome(el.fHome.value); state.msg = ''; reconcileZone(); if (el.nearNote) el.nearNote.textContent = ''; render(); });
    document.getElementById('f-clear').addEventListener('click', function () { setHome(''); el.nearNote.textContent = 'Saved city cleared from this browser.'; render(); });
    document.getElementById('empty-all').addEventListener('click', function () { document.querySelector('[data-city="all"]').click(); });
    el.locate.addEventListener('click', function () {
      if (!navigator.geolocation) { el.nearNote.textContent = 'Location is not available in this browser. Pick your city instead.'; return; }
      el.nearNote.textContent = 'Asking your browser for your location...';
      navigator.geolocation.getCurrentPosition(function (p) {
        var best = null, bd = 1e9;
        METROS.forEach(function (m) { var d = km(p.coords.latitude, p.coords.longitude, m.lat, m.lon); if (d < bd) { bd = d; best = m; } });
        if (best && bd <= 150) { setHome(best.name); state.msg = ''; reconcileZone(); el.nearNote.textContent = 'Using ' + best.name + ' (nearest listed metro, about ' + Math.round(bd) + ' km away). Your location itself was not saved or sent anywhere.'; }
        else el.nearNote.textContent = 'No listed city within 150 km. Pick the closest one from the list.';
        render();
      }, function () { el.nearNote.textContent = 'Location was not shared. Pick your city instead.'; }, { timeout: 10000, maximumAge: 600000 });
    });
  }

  fetch('meta.json', { cache: 'no-cache' }).then(function (res) { return res.ok ? res.json() : null; }).then(function (m) {
    if (!m) return;
    var el = document.getElementById('data-status');
    if (!el) return;
    var d = new Date(m.fetchedAt);
    var when = isNaN(d) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
      + ', ' + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) + ' IST';
    el.textContent = '';
    var dot = document.createElement('span');
    dot.className = 'data-status__dot';
    el.appendChild(dot);
    // runUrl is set only by the scheduled workflow; manual data refreshes say "Updated".
    el.appendChild(document.createTextNode((m.runUrl ? 'Updated automatically ' : 'Updated ') + when + ' from live sources: ' + (m.upcoming || m.races) + ' upcoming races shown (' + m.races + ' records tracked, past editions hidden). '));
    if (m.runUrl) {
      var a = document.createElement('a');
      a.href = m.runUrl; a.textContent = 'Latest fetch run'; a.target = '_blank'; a.rel = 'noopener';
      el.appendChild(a);
    }
  }).catch(function () {});

  fetch('news.json', { cache: 'no-cache' }).then(function (res) { return res.ok ? res.json() : null; }).then(function (n) {
    if (!n) return;
    function fill(listId, emptyId, items) {
      var ul = document.getElementById(listId);
      if (!ul) return;
      ul.innerHTML = '';
      if (!items.length) {
        var ep = document.getElementById(emptyId);
        if (ep) ep.hidden = false;
        return;
      }
      items.forEach(function (it) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = it.url; a.textContent = it.title; a.target = '_blank'; a.rel = 'noopener';
        var meta = document.createElement('span');
        meta.className = 'news__meta';
        meta.textContent = it.source + ' \u00b7 ' + it.date;
        li.appendChild(a); li.appendChild(meta);
        ul.appendChild(li);
      });
    }
    // India items expire 7 days after their publisher timestamp, even
    // between daily fetches, so nothing stale stays on view.
    var freshCut = Date.now() - 7 * 86400000;
    var indiaItems = (n.india || []).filter(function (it) {
      var t = new Date(it.published || it.date).getTime();
      return !isNaN(t) && t >= freshCut;
    });
    fill('news-india', 'news-india-empty', indiaItems);
    fill('news-global', 'news-global-empty', n.global || []);
  }).catch(function () {});

  document.querySelectorAll('.tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (b) {
        b.classList.toggle('is-on', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      document.getElementById('tab-races').hidden = btn.dataset.tab !== 'races';
      document.getElementById('tab-news').hidden = btn.dataset.tab !== 'news';
    });
  });

  fetch('races.json', { cache: 'no-cache' })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      races = data;
      refreshFilterOptions();
      render();
    })
    .catch(function () {
      el.count.textContent = 'Race data could not load right now.';
    });
})();
