/* Campground Host Book — simple offline check-in book for campground hosts.
   All data stays on this device (localStorage). */
(function () {
  'use strict';

  var DEMO = /[?&]demo\b/.test(location.search);
  var KEY = DEMO ? 'camphost_demo' : 'camphost_v1';
  var SITE_TYPES = [
    { id: 'full',   name: 'Full Hookup',           desc: 'Water, electric & sewer' },
    { id: 'ew',     name: 'Electric + Water Only', desc: 'No sewer' },
    { id: 'rustic', name: 'Rustic Cabin',          desc: 'Sleeps 4' },
    { id: 'ada',    name: 'ADA Cabin',             desc: 'Accessible, sleeps 6' },
    { id: 'tent',   name: 'Tent',                  desc: 'Tent site' }
  ];
  var PAYS = [
    { id: 'cash',   name: '💵 Cash' },
    { id: 'check',  name: '📝 Check' },
    { id: 'credit', name: '💳 Credit' }
  ];

  var DEFAULTS = {
    settings: {
      park: 'Waubonsie Trail Park',
      prices: { full: 25, ew: 20, rustic: 10, ada: 20, tent: 10 },
      wood: 5, cleaning: 0, pricesConfirmed: false
    },
    entries: [],
    days: {}
  };

  // ---------- storage ----------
  var db;
  function load() {
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!db || typeof db !== 'object') db = JSON.parse(JSON.stringify(DEFAULTS));
    db.settings = Object.assign({}, DEFAULTS.settings, db.settings || {});
    db.settings.prices = Object.assign({}, DEFAULTS.settings.prices, db.settings.prices || {});
    if (!Array.isArray(db.entries)) db.entries = [];
    if (!db.days || typeof db.days !== 'object') db.days = {};
    if (DEMO && !db.seeded) seedDemo();
  }
  function seedDemo() {
    db.settings.pricesConfirmed = true;
    var t = todayIso(), y = shiftDay(t, -1), n = Date.now();
    var mk = function (date, name, site, type, a, k, nights, wood, pay, extra) {
      return Object.assign({ id: 'demo' + name.replace(/\W/g, ''), date: date, name: name, site: site, type: type, adults: a, kids: k, other: 0,
        nights: nights, wood: wood, cleaning: '', donation: '', pay: pay, checkNo: '', note: '', amountOverride: null, createdAt: n++ }, extra || {});
    };
    db.entries = [
      mk(y, 'Peterson, Gary', '3', 'full', 2, 0, 3, 1, 'credit'),
      mk(y, 'Lopez, Maria', '', 'ada', 2, 2, 2, 0, 'check', { checkNo: '2214' }),
      mk(t, 'Hansen, Dale', '7', 'full', 2, 1, 2, 2, 'cash', { donation: '5' }),
      mk(t, 'Brown, Sue', '12', 'tent', 1, 0, 1, 1, 'cash', { note: 'Leaving early Sunday' })
    ];
    db.seeded = true;
    save();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) { alertBox('Could not save', 'This device is out of storage space. Please make a backup right away.'); return false; }
  }
  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }

  // ---------- helpers ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
  function money(n) { n = Math.round(num(n) * 100) / 100; var neg = n < 0; n = Math.abs(n); return (neg ? '-$' : '$') + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayIso() { return iso(new Date()); }
  function parseIso(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function shiftDay(s, n) { var d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); }
  function niceDate(s) { return parseIso(s).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
  function shortDate(s) { var d = parseIso(s); return (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(2); }
  function typeName(id) { var t = SITE_TYPES.filter(function (x) { return x.id === id; })[0]; return t ? t.name : id; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function entriesFor(date) { return db.entries.filter(function (e) { return e.date === date; }).sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); }); }
  function entriesForMonth(ym) { return db.entries.filter(function (e) { return e.date.slice(0, 7) === ym; }); }

  function calc(e) {
    var s = db.settings;
    var lodging = num(e.nights) * num(s.prices[e.type]);
    var wood = num(e.wood) * num(s.wood);
    var cleaning = num(e.cleaning);
    var donation = num(e.donation);
    return { lodging: lodging, wood: wood, cleaning: cleaning, donation: donation, total: lodging + wood + cleaning + donation };
  }
  function paid(e) { return e.amountOverride != null && e.amountOverride !== '' ? num(e.amountOverride) : calc(e).total; }

  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function modal(html) { var m = $('#modal'); m.innerHTML = '<div class="box" role="dialog" aria-modal="true">' + html + '</div>'; m.hidden = false; return m; }
  function closeModal() { var m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
  function alertBox(title, msg) {
    var m = modal('<h2>' + esc(title) + '</h2><p>' + esc(msg) + '</p><div class="btns"><button class="btn big" data-ok>OK</button></div>');
    $('[data-ok]', m).onclick = closeModal;
  }
  function confirmBox(title, msg, yesLabel, onYes, danger) {
    var m = modal('<h2>' + esc(title) + '</h2><p>' + esc(msg) + '</p><div class="btns">' +
      '<button class="btn big ' + (danger ? 'danger' : '') + '" data-yes>' + esc(yesLabel) + '</button>' +
      '<button class="btn big ghost" data-no>No, go back</button></div>');
    $('[data-yes]', m).onclick = function () { closeModal(); onYes(); };
    $('[data-no]', m).onclick = closeModal;
  }

  // ---------- routing ----------
  var state = { view: 'home', date: todayIso(), editId: null, draft: null, totalsMode: 'day' };
  function go(view, opts) {
    Object.assign(state, opts || {}); state.view = view;
    try { history.pushState({ v: view }, ''); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', function () { if (state.view !== 'home') { state.view = 'home'; render(); } });
  $('#homeBtn').onclick = function () { go('home'); };

  function render() {
    $('#parkName').textContent = db.settings.park || 'Campground';
    document.title = (db.settings.park || 'Campground') + ' · Host Book';
    $('#homeBtn').hidden = state.view === 'home';
    var old = $('.savebar'); if (old) old.remove();
    var app = $('#app');
    var db0 = $('#demoBar');
    if (DEMO && !db0) {
      db0 = document.createElement('div'); db0.id = 'demoBar'; db0.className = 'demobar';
      db0.innerHTML = '<span>🎓 <b>PRACTICE MODE</b> — pretend campers. Nothing here is real, so try anything!</span>' +
        '<span class="btns"><button class="btn sun" id="demoReset">Start Over</button><a class="btn ghost" href="./">Go to Real Book</a></span>';
      document.body.insertBefore(db0, $('main'));
      $('#demoReset').onclick = function () {
        confirmBox('Start practice over?', 'This puts the pretend campers back the way they were.', 'Yes, start over', function () {
          localStorage.removeItem(KEY); load(); state.view = 'home'; state.date = todayIso(); render(); toast('Practice reset');
        });
      };
    }
    if (state.view === 'home') app.innerHTML = viewHome();
    else if (state.view === 'checkin') { app.innerHTML = viewCheckin(); bindCheckin(); return; }
    else if (state.view === 'sheet') app.innerHTML = viewSheet();
    else if (state.view === 'totals') app.innerHTML = viewTotals();
    else if (state.view === 'find') app.innerHTML = viewFind();
    else if (state.view === 'settings') app.innerHTML = viewSettings();
    bindCommon();
  }

  // ---------- Home ----------
  function viewHome() {
    var t = todayIso(), list = entriesFor(t), sum = 0, people = 0;
    list.forEach(function (e) { sum += paid(e); people += num(e.adults) + num(e.kids) + num(e.other); });
    var h = new Date().getHours();
    var greet = h < 12 ? 'Good morning!' : h < 17 ? 'Good afternoon!' : 'Good evening!';
    return '' +
      (db.settings.pricesConfirmed ? '' :
        '<div class="banner"><div><b>First time?</b> Please check the nightly prices so totals come out right.</div>' +
        '<button class="btn sun" data-go="settings">Set Prices</button></div>') +
      '<div class="hello"><h1>' + greet + '</h1><div class="today">' + esc(niceDate(t)) + '</div></div>' +
      '<div class="big-grid">' +
        '<button class="tile primary" data-new><span class="ico">🏕️</span><span class="t">Check In a Camper</span><span class="d">Write down a new camper and what they paid</span></button>' +
        '<button class="tile" data-go="sheet"><span class="ico">📋</span><span class="t">Today\'s Sheet</span><span class="d">See, fix or print everyone checked in</span></button>' +
        '<button class="tile" data-go="totals"><span class="ico">🧮</span><span class="t">Totals &amp; Deposit</span><span class="d">Add up cash, checks &amp; credit</span></button>' +
        '<button class="tile" data-go="find"><span class="ico">🔍</span><span class="t">Find a Camper</span><span class="d">Look up someone from before</span></button>' +
        '<button class="tile" data-go="settings"><span class="ico">⚙️</span><span class="t">Prices &amp; Backup</span><span class="d">Change prices, save a backup copy</span></button>' +
        '<a class="tile" href="guide/" style="text-decoration:none"><span class="ico">📺</span><span class="t">How-To Video</span><span class="d">Watch a 3-minute guide &amp; print instructions</span></a>' +
        (DEMO ? '' : '<a class="tile" href="./?demo" style="text-decoration:none"><span class="ico">🎓</span><span class="t">Practice Mode</span><span class="d">Try it with pretend campers</span></a>') +
      '</div>' +
      '<div class="stats">' +
        '<div class="stat"><div class="n">' + list.length + '</div><div class="l">Check-ins today</div></div>' +
        '<div class="stat"><div class="n">' + people + '</div><div class="l">People today</div></div>' +
        '<div class="stat"><div class="n">' + money(sum) + '</div><div class="l">Collected today</div></div>' +
      '</div>';
  }

  // ---------- Check in ----------
  function blankEntry() {
    return { id: null, date: state.date || todayIso(), name: '', site: '', type: 'full', adults: 2, kids: 0, other: 0,
      nights: 1, wood: 0, cleaning: db.settings.cleaning ? String(db.settings.cleaning) : '', donation: '', pay: '', checkNo: '', note: '', amountOverride: null };
  }
  function viewCheckin() {
    var d = state.draft;
    var editing = !!d.id;
    var names = {};
    db.entries.forEach(function (e) { if (e.name) names[e.name] = 1; });
    var dl = '<datalist id="pastNames">' + Object.keys(names).sort().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>';

    var typeBtns = SITE_TYPES.map(function (t) {
      return '<button type="button" class="choice' + (d.type === t.id ? ' on' : '') + '" data-type="' + t.id + '">' + esc(t.name) +
        '<small>' + esc(t.desc) + ' · ' + money(db.settings.prices[t.id]) + '/night</small></button>';
    }).join('');
    var payBtns = PAYS.map(function (p) {
      return '<button type="button" class="choice ' + p.id + (d.pay === p.id ? ' on' : '') + '" data-pay="' + p.id + '">' + p.name + '</button>';
    }).join('');

    return '<h1>' + (editing ? 'Fix a Check-In' : 'Check In a Camper') + '</h1>' +
      '<p class="hint" style="font-size:1.05rem;margin-top:-4px">Go from top to bottom. The total adds itself up at the bottom of the screen.</p>' +
      '<div class="card"><div class="step"><span class="num">1</span><h2>Who is it?</h2></div>' +
        '<label class="lbl" for="f-name">Camper\'s name</label>' +
        '<input class="txt" id="f-name" list="pastNames" autocomplete="off" autocapitalize="words" value="' + esc(d.name) + '" placeholder="Last name, First name">' + dl +
        '<div class="row2">' +
          '<div><label class="lbl" for="f-site">Site number</label><input class="txt" id="f-site" inputmode="numeric" value="' + esc(d.site) + '" placeholder="Site # (leave empty for cabins)"></div>' +
          '<div><label class="lbl" for="f-date">Date</label><input class="txt" id="f-date" type="date" value="' + esc(d.date) + '"></div>' +
        '</div></div>' +
      '<div class="card"><div class="step"><span class="num">2</span><h2>What kind of site?</h2></div><div class="choices" id="types">' + typeBtns + '</div></div>' +
      '<div class="card"><div class="step"><span class="num">3</span><h2>How many people &amp; nights?</h2></div><div class="steppers">' +
        stepper('nights', 'Nights staying', d.nights, 1) +
        stepper('adults', 'Adults', d.adults, 0) +
        stepper('kids', 'Kids', d.kids, 0) +
        stepper('other', 'Other', d.other, 0) +
      '</div></div>' +
      '<div class="card"><div class="step"><span class="num">4</span><h2>Anything extra?</h2></div><div class="steppers">' +
        stepper('wood', 'Bundles of wood (' + money(db.settings.wood) + ' each)', d.wood, 0) +
      '</div><div class="row2">' +
        '<div><label class="lbl" for="f-cleaning">Cleaning fee</label><div class="money"><input class="txt" id="f-cleaning" inputmode="decimal" value="' + esc(d.cleaning) + '" placeholder="0.00"></div></div>' +
        '<div><label class="lbl" for="f-donation">Donation</label><div class="money"><input class="txt" id="f-donation" inputmode="decimal" value="' + esc(d.donation) + '" placeholder="0.00"></div></div>' +
      '</div></div>' +
      '<div class="card"><div class="step"><span class="num">5</span><h2>How did they pay?</h2></div><div class="choices pay" id="pays">' + payBtns + '</div>' +
        '<div id="checkNoWrap"' + (d.pay === 'check' ? '' : ' hidden') + '><label class="lbl" for="f-checkno">Check number (optional)</label><input class="txt" id="f-checkno" inputmode="numeric" value="' + esc(d.checkNo) + '"></div>' +
      '</div>' +
      '<div class="card"><div class="step"><span class="num">6</span><h2>Check the total</h2></div>' +
        '<table class="breakdown" id="breakdown"></table>' +
        '<label class="lbl" for="f-override">Amount actually paid <span style="font-weight:400;color:var(--muted)">(only change this if it was different)</span></label>' +
        '<div class="money"><input class="txt" id="f-override" inputmode="decimal" value="' + (d.amountOverride != null ? esc(d.amountOverride) : '') + '" placeholder="Same as total"></div>' +
        '<label class="lbl" for="f-note">Notes (optional)</label><textarea class="txt" id="f-note" placeholder="Leaving early, owes $5, etc.">' + esc(d.note) + '</textarea>' +
        (editing ? '<div class="btns" style="margin-top:16px"><button class="btn danger" id="delBtn">🗑 Delete this check-in</button></div>' : '') +
      '</div>';
  }
  function stepper(key, label, val, min) {
    return '<div class="stepper"><div class="sl">' + esc(label) + '</div><div class="ctl">' +
      '<button type="button" class="sbtn minus" data-step="' + key + '" data-d="-1" data-min="' + min + '" aria-label="Less ' + esc(label) + '">−</button>' +
      '<span class="sval" id="v-' + key + '">' + num(val) + '</span>' +
      '<button type="button" class="sbtn" data-step="' + key + '" data-d="1" aria-label="More ' + esc(label) + '">+</button></div></div>';
  }
  function readForm() {
    var d = state.draft;
    d.name = $('#f-name').value.trim();
    d.site = $('#f-site').value.trim();
    d.date = $('#f-date').value || todayIso();
    d.cleaning = $('#f-cleaning').value.trim();
    d.donation = $('#f-donation').value.trim();
    d.checkNo = $('#f-checkno') ? $('#f-checkno').value.trim() : '';
    d.note = $('#f-note').value.trim();
    var ov = $('#f-override').value.trim();
    d.amountOverride = ov === '' ? null : ov;
  }
  function refreshTotal() {
    readForm();
    var d = state.draft, c = calc(d);
    var rows = [[typeName(d.type) + ' — ' + d.nights + ' night' + (d.nights == 1 ? '' : 's') + ' × ' + money(db.settings.prices[d.type]), c.lodging]];
    if (num(d.wood)) rows.push(['Wood — ' + d.wood + ' × ' + money(db.settings.wood), c.wood]);
    if (c.cleaning) rows.push(['Cleaning', c.cleaning]);
    if (c.donation) rows.push(['Donation', c.donation]);
    rows.push(['<b>Total</b>', c.total]);
    $('#breakdown').innerHTML = rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + money(r[1]) + '</td></tr>'; }).join('');
    $('#barTotal').textContent = money(paid(d));
    $('#barPay').textContent = d.pay ? 'Paid by ' + d.pay : 'Pick how they paid (step 5)';
  }
  function bindCheckin() {
    var bar = document.createElement('div');
    bar.className = 'savebar';
    bar.innerHTML = '<div class="inner"><div class="tot">Total due<b id="barTotal">$0.00</b><span id="barPay"></span></div>' +
      '<div class="btns"><button class="btn ghost" id="cancelBtn">Cancel</button><button class="btn sun big" id="saveBtn">✓ Save Check-In</button></div></div>';
    document.body.appendChild(bar);
    var app = $('#app');
    app.oninput = refreshTotal;
    app.onclick = function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      var d = state.draft;
      if (b.dataset.type) {
        d.type = b.dataset.type;
        app.querySelectorAll('[data-type]').forEach(function (x) { x.classList.toggle('on', x === b); });
      } else if (b.dataset.pay) {
        d.pay = b.dataset.pay;
        app.querySelectorAll('[data-pay]').forEach(function (x) { x.classList.toggle('on', x === b); });
        $('#checkNoWrap').hidden = d.pay !== 'check';
      } else if (b.dataset.step) {
        var k = b.dataset.step, min = num(b.dataset.min || 0);
        d[k] = Math.max(min, num(d[k]) + num(b.dataset.d));
        $('#v-' + k).textContent = d[k];
      } else if (b.id === 'delBtn') {
        confirmBox('Delete this check-in?', 'This removes ' + (d.name || 'this camper') + ' from the sheet. It cannot be undone.', 'Yes, delete it', function () {
          db.entries = db.entries.filter(function (e) { return e.id !== d.id; });
          save(); toast('Check-in deleted'); go('sheet', { date: d.date });
        }, true);
        return;
      }
      refreshTotal();
    };
    // returning camper: fill site & type from their last visit
    $('#f-name').addEventListener('change', function () {
      var d = state.draft; if (d.id) return;
      var nm = this.value.trim().toLowerCase(); if (!nm) return;
      var prev = db.entries.filter(function (e) { return (e.name || '').toLowerCase() === nm; }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })[0];
      if (!prev) return;
      if (!$('#f-site').value) $('#f-site').value = prev.site || '';
      d.type = prev.type; d.adults = prev.adults; d.kids = prev.kids; d.other = prev.other;
      app.querySelectorAll('[data-type]').forEach(function (x) { x.classList.toggle('on', x.dataset.type === d.type); });
      ['adults', 'kids', 'other'].forEach(function (k) { $('#v-' + k).textContent = d[k]; });
      toast('Welcome back! Filled in from their last visit.');
      refreshTotal();
    });
    $('#cancelBtn').onclick = function () { go(state.draft.id ? 'sheet' : 'home'); };
    $('#saveBtn').onclick = saveEntry;
    refreshTotal();
    $('#f-name').focus();
  }
  function saveEntry() {
    readForm();
    var d = state.draft, missing = [];
    if (!d.name) missing.push('the camper\'s name (step 1)');
    if (!d.pay) missing.push('how they paid (step 5)');
    if (missing.length) { alertBox('Almost done!', 'Please fill in ' + missing.join(' and ') + '.'); return; }
    if (d.amountOverride != null && isNaN(parseFloat(d.amountOverride))) { alertBox('Check the amount', 'The "Amount actually paid" box needs a number, or leave it empty.'); return; }
    var rec = JSON.parse(JSON.stringify(d));
    rec.total = paid(rec);
    rec.updatedAt = Date.now();
    if (rec.id) {
      db.entries = db.entries.map(function (e) { return e.id === rec.id ? Object.assign({}, e, rec) : e; });
    } else {
      rec.id = uid(); rec.createdAt = Date.now(); db.entries.push(rec);
    }
    if (save()) {
      toast('✓ Saved ' + rec.name + ' — ' + money(rec.total));
      go('sheet', { date: rec.date });
    }
  }

  // ---------- Daily sheet ----------
  function dayNav() {
    var isToday = state.date === todayIso();
    return '<div class="daynav"><button class="btn ghost" data-day="-1">◀ Day before</button>' +
      '<div class="when">' + (isToday ? 'Today · ' : '') + esc(niceDate(state.date)) + '</div>' +
      '<button class="btn ghost" data-day="1">Next day ▶</button></div>' +
      (isToday ? '' : '<div style="text-align:center;margin:-6px 0 14px"><button class="btn sun" data-day="today">Back to Today</button></div>');
  }
  function viewSheet() {
    var list = entriesFor(state.date);
    var body = list.length ? list.map(function (e) {
      var ppl = [];
      if (num(e.adults)) ppl.push(e.adults + ' adult' + (e.adults == 1 ? '' : 's'));
      if (num(e.kids)) ppl.push(e.kids + ' kid' + (e.kids == 1 ? '' : 's'));
      if (num(e.other)) ppl.push(e.other + ' other');
      return '<button class="guest" data-edit="' + e.id + '">' +
        '<div class="site"><small>SITE</small>' + esc(e.site || '–') + '</div>' +
        '<div class="main"><div class="nm">' + esc(e.name) + '</div>' +
        '<div class="meta">' + esc(typeName(e.type)) + ' · ' + e.nights + ' night' + (e.nights == 1 ? '' : 's') + (ppl.length ? ' · ' + ppl.join(', ') : '') +
        (num(e.wood) ? ' · ' + e.wood + ' wood' : '') + '</div>' +
        (e.note ? '<div class="meta">📝 ' + esc(e.note) + '</div>' : '') + '</div>' +
        '<div class="amt">' + money(paid(e)) + '<br><span class="tag ' + e.pay + '">' + esc(e.pay) + (e.checkNo ? ' #' + esc(e.checkNo) : '') + '</span></div>' +
        '</button>';
    }).join('') : '<div class="empty">Nobody checked in on this day yet.</div>';
    return '<h1>Daily Sheet</h1>' + dayNav() +
      '<div class="btns" style="margin-bottom:16px"><button class="btn big" data-new>🏕️ Check In a Camper</button>' +
      '<button class="btn ghost" data-print="day">🖨 Print this sheet</button><button class="btn ghost" data-go="totals">🧮 Totals</button></div>' +
      (list.length ? '<p class="hint" style="font-size:1.05rem">Tap a camper to fix or delete them.</p>' : '') + body;
  }

  // ---------- Totals ----------
  function summarize(list) {
    var s = { byType: {}, wood: 0, woodQty: 0, cleaning: 0, donation: 0, grand: 0, cash: 0, check: 0, credit: 0, people: 0, adjust: 0 };
    SITE_TYPES.forEach(function (t) { s.byType[t.id] = { nights: 0, amt: 0 }; });
    list.forEach(function (e) {
      var c = calc(e), p = paid(e);
      if (!s.byType[e.type]) s.byType[e.type] = { nights: 0, amt: 0 };
      s.byType[e.type].nights += num(e.nights); s.byType[e.type].amt += c.lodging;
      s.woodQty += num(e.wood); s.wood += c.wood; s.cleaning += c.cleaning; s.donation += c.donation;
      s.adjust += p - c.total;
      s.grand += p;
      if (s[e.pay] != null) s[e.pay] += p;
      s.people += num(e.adults) + num(e.kids) + num(e.other);
    });
    return s;
  }
  function totalsTable(s) {
    var rows = SITE_TYPES.map(function (t) {
      return '<tr><td>' + esc(t.name) + '</td><td class="r">' + s.byType[t.id].nights + '</td><td class="r">' + money(s.byType[t.id].amt) + '</td></tr>';
    }).join('');
    rows += '<tr><td>Wood</td><td class="r">' + s.woodQty + '</td><td class="r">' + money(s.wood) + '</td></tr>';
    rows += '<tr><td>Cleaning</td><td></td><td class="r">' + money(s.cleaning) + '</td></tr>';
    rows += '<tr><td>Donations</td><td></td><td class="r">' + money(s.donation) + '</td></tr>';
    if (Math.abs(s.adjust) > 0.004) rows += '<tr><td>Price changes (paid different)</td><td></td><td class="r">' + money(s.adjust) + '</td></tr>';
    rows += '<tr class="grand"><td>Grand Total</td><td></td><td class="r">' + money(s.grand) + '</td></tr>';
    return '<table class="tot-table"><thead><tr><th>What</th><th class="r">Nights / Qty</th><th class="r">Amount</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function viewTotals() {
    var month = state.totalsMode === 'month';
    var list = month ? entriesForMonth(state.date.slice(0, 7)) : entriesFor(state.date);
    var s = summarize(list);
    var seg = '<div class="seg"><button data-mode="day" class="' + (month ? '' : 'on') + '">One Day</button><button data-mode="month" class="' + (month ? 'on' : '') + '">Whole Month</button></div>';
    var head;
    if (month) {
      var d = parseIso(state.date);
      head = '<div class="daynav"><button class="btn ghost" data-month="-1">◀ Month before</button><div class="when">' +
        esc(d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })) + '</div><button class="btn ghost" data-month="1">Next month ▶</button></div>';
    } else head = dayNav();
    var deposit = s.cash + s.check;
    var dayRec = db.days[state.date] || {};
    var depositBlock = month ? '' :
      '<div class="card"><h2>Deposit &amp; Count</h2>' +
      '<p style="font-size:1.15rem">Cash + checks that should go in the deposit: <b style="font-size:1.5rem;color:var(--pine)">' + money(deposit) + '</b></p>' +
      '<label class="lbl" for="counted">Count the cash and checks in hand, then type the amount here:</label>' +
      '<div class="money"><input class="txt" id="counted" inputmode="decimal" value="' + esc(dayRec.counted != null ? dayRec.counted : '') + '" placeholder="0.00"></div>' +
      '<div id="osOut"></div></div>';
    return '<h1>Totals &amp; Deposit</h1><div style="margin-bottom:14px">' + seg + '</div>' + head +
      '<div class="card"><h2>' + (month ? 'Month' : 'Day') + ' totals</h2>' +
      '<p class="hint" style="font-size:1.05rem">' + list.length + ' check-in' + (list.length === 1 ? '' : 's') + ' · ' + s.people + ' people</p>' + totalsTable(s) + '</div>' +
      '<div class="card"><h2>How it was paid</h2><div class="paygrid">' +
        '<div class="paybox cash"><div>💵 Cash</div><div class="n">' + money(s.cash) + '</div></div>' +
        '<div class="paybox check"><div>📝 Checks</div><div class="n">' + money(s.check) + '</div></div>' +
        '<div class="paybox credit"><div>💳 Credit</div><div class="n">' + money(s.credit) + '</div></div>' +
      '</div></div>' + depositBlock +
      '<div class="btns"><button class="btn big" data-print="' + (month ? 'month' : 'day') + '">🖨 Print ' + (month ? 'month report' : 'day sheet') + '</button></div>';
  }
  function updateOS() {
    var inp = $('#counted'); if (!inp) return;
    var s = summarize(entriesFor(state.date)), deposit = s.cash + s.check, out = $('#osOut');
    var v = inp.value.trim();
    db.days[state.date] = Object.assign({}, db.days[state.date] || {}, { counted: v === '' ? null : v });
    save();
    if (v === '') { out.innerHTML = ''; return; }
    var diff = Math.round((num(v) - deposit) * 100) / 100;
    if (diff === 0) out.innerHTML = '<div class="os ok">✓ It matches! Deposit is right.</div>';
    else if (diff > 0) out.innerHTML = '<div class="os over">Over by ' + money(diff) + ' — you have more than the sheet says.</div>';
    else out.innerHTML = '<div class="os short">Short by ' + money(-diff) + ' — check for a missing camper or a counting slip.</div>';
  }

  // ---------- Find ----------
  function viewFind() {
    return '<h1>Find a Camper</h1><div class="card"><label class="lbl" for="q">Type part of a name or a site number</label>' +
      '<input class="txt" id="q" autocomplete="off" placeholder="e.g. Smith" value="' + esc(state.q || '') + '"></div><div id="results">' + findResults(state.q || '') + '</div>';
  }
  function findResults(q) {
    q = q.trim().toLowerCase();
    if (!q) return '<div class="empty">Start typing to search every check-in.</div>';
    var hits = db.entries.filter(function (e) { return (e.name || '').toLowerCase().indexOf(q) >= 0 || String(e.site || '').toLowerCase() === q; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 60);
    if (!hits.length) return '<div class="empty">No one found by that name.</div>';
    return hits.map(function (e) {
      return '<button class="guest" data-edit="' + e.id + '"><div class="site"><small>SITE</small>' + esc(e.site || '–') + '</div>' +
        '<div class="main"><div class="nm">' + esc(e.name) + '</div><div class="meta">' + esc(shortDate(e.date)) + ' · ' + esc(typeName(e.type)) + ' · ' + e.nights + ' night' + (e.nights == 1 ? '' : 's') + '</div></div>' +
        '<div class="amt">' + money(paid(e)) + '<br><span class="tag ' + e.pay + '">' + esc(e.pay) + '</span></div></button>';
    }).join('');
  }

  // ---------- Settings ----------
  function viewSettings() {
    var s = db.settings;
    var priceRows = SITE_TYPES.map(function (t) {
      return '<div><label class="lbl" for="p-' + t.id + '">' + esc(t.name) + ' — per night</label><div class="money"><input class="txt" id="p-' + t.id + '" inputmode="decimal" value="' + num(s.prices[t.id]) + '"></div></div>';
    }).join('');
    return '<h1>Prices &amp; Backup</h1>' +
      '<div class="card"><h2>Nightly prices</h2><div class="row2">' + priceRows +
        '<div><label class="lbl" for="p-wood">Wood — per bundle</label><div class="money"><input class="txt" id="p-wood" inputmode="decimal" value="' + num(s.wood) + '"></div></div>' +
        '<div><label class="lbl" for="p-cleaning">Usual cleaning fee <span style="font-weight:400;color:var(--muted)">(0 = none)</span></label><div class="money"><input class="txt" id="p-cleaning" inputmode="decimal" value="' + num(s.cleaning) + '"></div></div>' +
      '</div><label class="lbl" for="p-park">Campground name</label><input class="txt" id="p-park" value="' + esc(s.park) + '">' +
      '<p class="hint">Changing a price changes the totals for old check-ins too — unless "Amount actually paid" was typed in.</p>' +
      '<div class="btns" style="margin-top:12px"><button class="btn big" id="savePrices">✓ Save Prices</button></div></div>' +
      (DEMO ? '' : '<div class="card"><h2>Practice</h2><p style="font-size:1.1rem">Want to try things out first? Practice Mode has pretend campers. It never touches the real book.</p><div class="btns"><a class="btn sun big" href="./?demo">🎓 Open Practice Mode</a></div></div>') +
      '<div class="card"><h2>Backup copy</h2><p style="font-size:1.1rem">Everything is kept on this device only. Once a week, tap <b>Save a Backup</b> — it puts a file in your Downloads folder. If the tablet ever breaks, that file brings everything back.</p>' +
        '<div class="btns"><button class="btn sun big" id="backupBtn">💾 Save a Backup</button><button class="btn ghost" id="csvBtn">📊 Spreadsheet (CSV)</button><button class="btn ghost" id="restoreBtn">📂 Restore from Backup</button></div>' +
        '<input type="file" id="restoreFile" accept=".json,application/json" hidden>' +
        '<p class="hint">' + db.entries.length + ' check-ins saved on this device.' + (s.lastBackup ? ' Last backup: ' + esc(new Date(s.lastBackup).toLocaleDateString()) + '.' : ' No backup yet.') + '</p></div>';
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function csv() {
    var head = ['Date', 'Name', 'Adults', 'Kids', 'Other', 'Space', 'Site Type', 'Nights', 'Cash', 'Check', 'Credit', 'Check #', 'Cleaning', 'Donation', 'Wood', 'Total', 'Notes'];
    var q = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var rows = db.entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0); }).map(function (e) {
      var p = paid(e), c = calc(e);
      return [e.date, e.name, e.adults, e.kids, e.other, e.site, typeName(e.type), e.nights,
        e.pay === 'cash' ? p.toFixed(2) : '', e.pay === 'check' ? p.toFixed(2) : '', e.pay === 'credit' ? p.toFixed(2) : '',
        e.checkNo, c.cleaning ? c.cleaning.toFixed(2) : '', c.donation ? c.donation.toFixed(2) : '', e.wood || '', p.toFixed(2), e.note].map(q).join(',');
    });
    return [head.join(',')].concat(rows).join('\r\n');
  }

  // ---------- Print ----------
  function printSheet(mode) {
    var month = mode === 'month';
    var list = month ? entriesForMonth(state.date.slice(0, 7)).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }) : entriesFor(state.date);
    var s = summarize(list);
    var title = month ? parseIso(state.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : niceDate(state.date);
    var rows = list.map(function (e) {
      var p = paid(e), c = calc(e);
      return '<tr><td>' + esc(shortDate(e.date)) + '</td><td>' + esc(e.name) + '</td><td class="r">' + (num(e.adults) || '') + '</td><td class="r">' + (num(e.kids) || '') + '</td><td class="r">' + (num(e.other) || '') +
        '</td><td>' + esc(e.site) + ' ' + esc(typeName(e.type)) + '</td><td class="r">' + e.nights + '</td>' +
        '<td class="r">' + (e.pay === 'cash' ? money(p) : '') + '</td><td class="r">' + (e.pay === 'check' ? money(p) + (e.checkNo ? ' #' + esc(e.checkNo) : '') : '') + '</td><td class="r">' + (e.pay === 'credit' ? money(p) : '') +
        '</td><td class="r">' + (c.cleaning ? money(c.cleaning) : '') + '</td><td class="r">' + (c.donation ? money(c.donation) : '') + '</td><td class="r">' + (num(e.wood) || '') + '</td></tr>';
    }).join('');
    for (var i = list.length; i < (month ? 0 : 18); i++) rows += '<tr>' + new Array(14).join('<td>&nbsp;</td>') + '</tr>';
    var typeRows = SITE_TYPES.map(function (t) { return '<tr><td>' + esc(t.name) + '</td><td>' + s.byType[t.id].nights + ' nights</td><td class="r">' + money(s.byType[t.id].amt) + '</td></tr>'; }).join('') +
      '<tr><td>Wood</td><td>' + s.woodQty + '</td><td class="r">' + money(s.wood) + '</td></tr>';
    var counted = !month && db.days[state.date] && db.days[state.date].counted != null ? num(db.days[state.date].counted) : null;
    var deposit = s.cash + s.check;
    var os = counted == null ? '' : (Math.abs(counted - deposit) < 0.005 ? 'Even' : (counted > deposit ? 'Over ' : 'Short ') + money(Math.abs(counted - deposit)));
    var html = '<div class="ph"><h1>' + esc(db.settings.park) + ' — ' + esc(title) + '</h1><div>Host: ____________________</div></div>' +
      '<table><thead><tr><th>Date</th><th>Name</th><th>Adults</th><th>Kids</th><th>Other</th><th>Space</th><th>Nights</th><th>Cash</th><th>Check</th><th>Credit</th><th>Cleaning</th><th>Donation</th><th>Wood</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="sum"><table>' + typeRows + '</table>' +
      '<table><tr><td>Cleaning</td><td class="r">' + money(s.cleaning) + '</td></tr><tr><td>Donations</td><td class="r">' + money(s.donation) + '</td></tr>' +
      (Math.abs(s.adjust) > 0.004 ? '<tr><td>Price changes</td><td class="r">' + money(s.adjust) + '</td></tr>' : '') +
      '<tr><td><b>Grand Total</b></td><td class="r"><b>' + money(s.grand) + '</b></td></tr></table>' +
      '<table><tr><td>Cash</td><td class="r">' + money(s.cash) + '</td></tr><tr><td>Checks</td><td class="r">' + money(s.check) + '</td></tr><tr><td>Credit</td><td class="r">' + money(s.credit) + '</td></tr>' +
      '<tr><td><b>Deposit (cash + checks)</b></td><td class="r"><b>' + money(deposit) + '</b></td></tr>' +
      (month ? '' : '<tr><td>Counted</td><td class="r">' + (counted == null ? '________' : money(counted)) + '</td></tr><tr><td>Over / Short</td><td class="r">' + (os || '________') + '</td></tr>') +
      '</table></div>';
    var ps = $('#printSheet'); if (!ps) { ps = document.createElement('div'); ps.id = 'printSheet'; document.body.appendChild(ps); }
    ps.innerHTML = html;
    window.print();
  }

  // ---------- common bindings ----------
  function bindCommon() {
    var app = $('#app');
    app.oninput = null;
    app.onclick = function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.go) return go(b.dataset.go);
      if (b.hasAttribute('data-new')) { state.draft = blankEntry(); if (state.view === 'home') state.draft.date = todayIso(); return go('checkin'); }
      if (b.dataset.edit) {
        var e = db.entries.filter(function (x) { return x.id === b.dataset.edit; })[0];
        if (e) { state.draft = JSON.parse(JSON.stringify(e)); go('checkin'); }
        return;
      }
      if (b.dataset.day) { state.date = b.dataset.day === 'today' ? todayIso() : shiftDay(state.date, num(b.dataset.day)); return render(); }
      if (b.dataset.month) { var d = parseIso(state.date); d.setDate(1); d.setMonth(d.getMonth() + num(b.dataset.month)); state.date = iso(d); return render(); }
      if (b.dataset.mode) { state.totalsMode = b.dataset.mode; return render(); }
      if (b.dataset.print) return printSheet(b.dataset.print);
      if (b.id === 'savePrices') {
        var s = db.settings;
        SITE_TYPES.forEach(function (t) { s.prices[t.id] = num($('#p-' + t.id).value); });
        s.wood = num($('#p-wood').value); s.cleaning = num($('#p-cleaning').value);
        s.park = $('#p-park').value.trim() || 'Campground'; s.pricesConfirmed = true;
        save(); toast('✓ Prices saved'); return render();
      }
      if (b.id === 'backupBtn') {
        db.settings.lastBackup = Date.now(); save();
        download('campground-backup-' + todayIso() + '.json', JSON.stringify(db, null, 1), 'application/json');
        toast('Backup saved to Downloads'); return render();
      }
      if (b.id === 'csvBtn') { download('campground-checkins-' + todayIso() + '.csv', csv(), 'text/csv'); return toast('Spreadsheet saved to Downloads'); }
      if (b.id === 'restoreBtn') return $('#restoreFile').click();
    };
    var q = $('#q');
    if (q) { q.oninput = function () { state.q = q.value; $('#results').innerHTML = findResults(q.value); }; q.focus(); var v = q.value; q.value = ''; q.value = v; }
    var c = $('#counted');
    if (c) { c.oninput = updateOS; updateOS(); }
    var rf = $('#restoreFile');
    if (rf) rf.onchange = function () {
      var f = rf.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var data; try { data = JSON.parse(r.result); } catch (e) { return alertBox('That file did not work', 'Pick a file named campground-backup-….json.'); }
        if (!data || !Array.isArray(data.entries)) return alertBox('That file did not work', 'Pick a file named campground-backup-….json.');
        confirmBox('Restore this backup?', 'It has ' + data.entries.length + ' check-ins. Check-ins already on this device are kept; matching ones are updated.', 'Yes, restore', function () {
          var byId = {}; db.entries.forEach(function (e) { byId[e.id] = e; });
          data.entries.forEach(function (e) { if (e && e.id) byId[e.id] = e; });
          db.entries = Object.keys(byId).map(function (k) { return byId[k]; });
          db.days = Object.assign({}, data.days || {}, db.days);
          if (data.settings) { db.settings = Object.assign({}, db.settings, data.settings); db.settings.prices = Object.assign({}, DEFAULTS.settings.prices, data.settings.prices || {}); }
          save(); toast('✓ Backup restored'); render();
        });
      };
      r.readAsText(f);
      rf.value = '';
    };
  }

  load();
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  window.__camp = { db: function () { return db; }, state: state, go: go, calc: calc, summarize: summarize };
})();
