/* Campground Host Book — simple offline check-in book for campground hosts.
   All data stays on this device (localStorage). */
(function () {
  'use strict';

  var DEMO = /[?&]demo\b/.test(location.search);
  var KEY = DEMO ? 'camphost_demo' : 'camphost_v1';
  var KIOSK = /[?&]kiosk\b/.test(location.search) || !!window.AndroidKiosk;
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

  // Prices the park itself has posted. When this list changes (new version),
  // the home screen offers a one-tap update. Only list prices the park published.
  var PARK_PRICES = {
    version: '2026-11-25',
    source: 'the park\'s Facebook page (Waubonsie Trail Park Campground)',
    prices: { full: 25, tent: 10, ada: 80 },
    note: 'The ADA cabin is $80 a night plus a cleaning fee.'
  };
  var CABINS = { rustic: 1, ada: 1 };
  var DEFAULTS = {
    settings: {
      park: 'Waubonsie Trail Park',
      prices: { full: 25, ew: 20, rustic: 10, ada: 80, tent: 10 },
      wood: 5, cleaning: 0, cabinCleaning: 0, pricesConfirmed: false,
      priceListSeen: '', pricesChangedAt: null,
      mode: 'host', pin: '2193'
    },
    entries: [],
    days: {},
    feedback: []
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
    if (!Array.isArray(db.feedback)) db.feedback = [];
    if (DEMO && !db.seeded) seedDemo();
    if (KIOSK && !db.settings.kioskInit) { db.settings.kioskInit = true; db.settings.mode = 'cantril'; }
    lockRates();
  }
  // Every check-in remembers the price it was charged, so changing prices later
  // never changes old totals. Older check-ins get today's prices locked in once.
  function lockRates() {
    var s = db.settings, changed = false;
    db.entries.forEach(function (e) {
      if (e.rate == null) { e.rate = num(s.prices[e.type]); changed = true; }
      if (e.woodRate == null) { e.woodRate = num(s.wood); changed = true; }
    });
    if (changed) save();
  }
  function parkPriceChanges() {
    var s = db.settings;
    return SITE_TYPES.filter(function (t) {
      return PARK_PRICES.prices[t.id] != null && num(PARK_PRICES.prices[t.id]) !== num(s.prices[t.id]);
    });
  }
  function markPricesChanged() { db.settings.pricesChangedAt = Date.now(); db.settings.pricesConfirmed = true; }
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
    db.feedback = [
      { id: 'demofb1', by: 'host', date: y, name: 'Peterson, Gary', site: '3', stars: 5, likes: ['Friendly hosts', 'Quiet & peaceful'], needs: [], comment: 'Best little park around. Will be back in the spring.', followUp: false, createdAt: n++ },
      { id: 'demofb2', by: 'camper', date: t, name: '', site: '12', stars: 3, likes: ['Pretty park'], needs: ['Showers', 'Bugs'], comment: 'Shower on the left only had cold water.', followUp: true, createdAt: n++ }
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
    var lodging = num(e.nights) * rateOf(e);
    var wood = num(e.wood) * woodRateOf(e);
    var cleaning = num(e.cleaning);
    var donation = num(e.donation);
    return { lodging: lodging, wood: wood, cleaning: cleaning, donation: donation, total: lodging + wood + cleaning + donation };
  }
  function rateOf(e) { return e.rate != null ? num(e.rate) : num(db.settings.prices[e.type]); }
  function woodRateOf(e) { return e.woodRate != null ? num(e.woodRate) : num(db.settings.wood); }
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
  window.addEventListener('popstate', function () {
    if (state.view === 'pin') return;
    // a camper holding the tablet should not be able to back out into the book
    if (state.view === 'fbthanks' || (state.view === 'fbform' && state.fb && state.fb.by === 'camper')) { try { history.pushState({ v: state.view }, ''); } catch (e) {} return; }
    var mh = modeHome(); if (state.view !== mh) { state.view = mh; render(); }
  });
  function modeHome() { var m = db.settings.mode; return m === 'cantril' ? 'cantril' : m === 'personal' ? 'personal' : 'home'; }
  $('#homeBtn').onclick = function () { go(modeHome()); };

  function render() {
    $('#parkName').textContent = db.settings.park || 'Campground';
    document.title = (db.settings.park || 'Campground') + ' · Host Book';
    var camperMode = (state.view === 'fbform' && state.fb && state.fb.by === 'camper') || state.view === 'fbthanks';
    $('#homeBtn').hidden = state.view === modeHome() || camperMode;
    document.body.dataset.mode = db.settings.mode;
    $('.sub').textContent = db.settings.mode === 'cantril' ? 'Cantril, Iowa' : db.settings.mode === 'personal' ? 'Home' : 'Campground Host Book';
    document.body.classList.toggle('camper-mode', camperMode);
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
    else if (state.view === 'cantril') app.innerHTML = viewCantril();
    else if (state.view === 'todo') app.innerHTML = viewTodo();
    else if (state.view === 'park') app.innerHTML = viewPark();
    else if (state.view === 'help') app.innerHTML = viewHelp();
    else if (state.view === 'personal') app.innerHTML = viewPersonal();
    else if (state.view === 'dev') app.innerHTML = viewDev();
    else if (state.view === 'checkin') { app.onchange = null; app.innerHTML = viewCheckin(); bindCheckin(); return; }
    else if (state.view === 'sheet') app.innerHTML = viewSheet();
    else if (state.view === 'totals') app.innerHTML = viewTotals();
    else if (state.view === 'find') app.innerHTML = viewFind();
    else if (state.view === 'settings') app.innerHTML = viewSettings();
    else if (state.view === 'feedback') app.innerHTML = viewFeedback();
    else if (state.view === 'fbform') { app.onchange = null; app.innerHTML = viewFbForm(); bindFbForm(); return; }
    else if (state.view === 'fbthanks') { app.innerHTML = viewFbThanks(); bindFbThanks(); return; }
    bindCommon();
  }

  // ---------- Home ----------
  function viewHome() {
    var t = todayIso(), list = entriesFor(t), sum = 0, people = 0;
    list.forEach(function (e) { sum += paid(e); people += num(e.adults) + num(e.kids) + num(e.other); });
    var h = new Date().getHours();
    var greet = h < 12 ? 'Good morning!' : h < 17 ? 'Good afternoon!' : 'Good evening!';
    return '' +
      (!db.settings.pricesConfirmed ?
        '<div class="banner"><div><b>First time?</b> Please check the nightly prices so totals come out right.</div>' +
        '<button class="btn sun" data-go="settings">Set Prices</button></div>' :
        (db.settings.priceListSeen !== PARK_PRICES.version && parkPriceChanges().length ?
        '<div class="banner"><div><b>The park\'s prices changed.</b> ' + parkPriceChanges().map(function (t) { return esc(t.name) + ' is now ' + money(PARK_PRICES.prices[t.id]) + ' a night'; }).join(', ') + '.</div>' +
        '<button class="btn sun" data-go="settings">Review Prices</button></div>' : '')) +
      '<div class="hello"><h1>' + greet + '</h1><div class="today">' + esc(niceDate(t)) + '</div></div>' +
      '<div class="big-grid">' +
        '<button class="tile primary" data-new><span class="ico">🏕️</span><span class="t">Check In a Camper</span><span class="d">Write down a new camper and what they paid</span></button>' +
        '<button class="tile" data-go="sheet"><span class="ico">📋</span><span class="t">Today\'s Sheet</span><span class="d">See, fix or print everyone checked in</span></button>' +
        '<button class="tile" data-go="totals"><span class="ico">🧮</span><span class="t">Totals &amp; Deposit</span><span class="d">Add up cash, checks &amp; credit</span></button>' +
        '<button class="tile" data-go="find"><span class="ico">🔍</span><span class="t">Find a Camper</span><span class="d">Look up someone from before</span></button>' +
        '<button class="tile" data-go="feedback"><span class="ico">💬</span><span class="t">Camper Feedback</span><span class="d">Walk around and ask how their stay is going</span></button>' +
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
        '<small>' + esc(t.desc) + ' · ' + money(d.type === t.id ? rateOf(d) : db.settings.prices[t.id]) + '/night</small></button>';
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
        stepper('wood', 'Bundles of wood (' + money(woodRateOf(d)) + ' each)', d.wood, 0) +
      '</div><div class="row2">' +
        '<div><label class="lbl" for="f-cleaning">Cleaning fee</label><div class="money"><input class="txt" id="f-cleaning" inputmode="decimal" value="' + esc(d.cleaning) + '" placeholder="0.00"></div></div>' +
        '<div><label class="lbl" for="f-donation">Donation</label><div class="money"><input class="txt" id="f-donation" inputmode="decimal" value="' + esc(d.donation) + '" placeholder="0.00"></div></div>' +
      '</div></div>' +
      '<div class="card"><div class="step"><span class="num">5</span><h2>How did they pay?</h2></div><div class="choices pay" id="pays">' + payBtns + '</div>' +
        '<div id="checkNoWrap"' + (d.pay === 'check' ? '' : ' hidden') + '><label class="lbl" for="f-checkno">Check number (optional)</label><input class="txt" id="f-checkno" inputmode="numeric" value="' + esc(d.checkNo) + '"></div>' +
      '</div>' +
      '<div class="card"><div class="step"><span class="num">6</span><h2>Check the total</h2></div>' +
        '<table class="breakdown" id="breakdown"></table><p class="hint" id="oldRate" hidden></p>' +
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
    var rows = [[typeName(d.type) + ' — ' + d.nights + ' night' + (d.nights == 1 ? '' : 's') + ' × ' + money(rateOf(d)), c.lodging]];
    if (num(d.wood)) rows.push(['Wood — ' + d.wood + ' × ' + money(woodRateOf(d)), c.wood]);
    var now = num(db.settings.prices[d.type]), nowWood = num(db.settings.wood);
    var old = d.id && (rateOf(d) !== now || (num(d.wood) && woodRateOf(d) !== nowWood));
    var oldNote = $('#oldRate');
    if (oldNote) {
      oldNote.hidden = !old;
      if (old) oldNote.innerHTML = 'This check-in keeps the price from the day it was written down. Today\'s price is ' + money(now) + ' a night' +
        (num(d.wood) ? ' and ' + money(nowWood) + ' a bundle' : '') + '. <button type="button" class="btn ghost" id="useToday">Use today\'s price</button>';
    }
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
      if (b.id === 'useToday') {
        delete d.rate; delete d.woodRate;
        app.querySelectorAll('[data-type] small').forEach(function (x, i) { x.textContent = SITE_TYPES[i].desc + ' · ' + money(db.settings.prices[SITE_TYPES[i].id]) + '/night'; });
        toast('Using today\'s price');
      } else if (b.dataset.type) {
        var was = d.type;
        d.type = b.dataset.type;
        if (was !== d.type) delete d.rate;   // a different kind of site → today's price
        app.querySelectorAll('[data-type]').forEach(function (x) { x.classList.toggle('on', x === b); });
        var cf = $('#f-cleaning'), cc = num(db.settings.cabinCleaning), usual = num(db.settings.cleaning);
        if (cc && CABINS[d.type] && !CABINS[was] && (cf.value.trim() === '' || num(cf.value) === usual)) cf.value = String(cc);
        else if (cc && !CABINS[d.type] && CABINS[was] && num(cf.value) === cc) cf.value = usual ? String(usual) : '';
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
    rec.rate = rateOf(d); rec.woodRate = woodRateOf(d);
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
    var priceRow = function (id, label, val) {
      return '<div class="prow"><label class="lbl" for="p-' + id + '">' + label + '</label><div class="pctl">' +
        '<button type="button" class="sbtn minus" data-pstep="' + id + '" data-d="-1" aria-label="One dollar less">−</button>' +
        '<div class="money"><input class="txt" id="p-' + id + '" inputmode="decimal" value="' + num(val) + '"></div>' +
        '<button type="button" class="sbtn" data-pstep="' + id + '" data-d="1" aria-label="One dollar more">+</button></div></div>';
    };
    var priceRows = SITE_TYPES.map(function (t) { return priceRow(t.id, esc(t.name) + ' — per night', s.prices[t.id]); }).join('');
    var changes = parkPriceChanges();
    var posted = SITE_TYPES.filter(function (t) { return PARK_PRICES.prices[t.id] != null; }).map(function (t) {
      var diff = num(PARK_PRICES.prices[t.id]) !== num(s.prices[t.id]);
      return '<tr><td>' + esc(t.name) + '</td><td class="r"><b>' + money(PARK_PRICES.prices[t.id]) + '</b></td><td>' +
        (diff ? '<span class="bad">you have ' + money(s.prices[t.id]) + '</span>' : '<span class="good">✓ matches</span>') + '</td></tr>';
    }).join('');
    return '<h1>Prices &amp; Backup</h1>' +
      '<div class="card"><h2>The park\'s posted prices</h2>' +
        '<p style="font-size:1.05rem">From ' + esc(PARK_PRICES.source) + '. ' + esc(PARK_PRICES.note) + '</p>' +
        '<table class="breakdown posted">' + posted + '</table>' +
        (changes.length ? '<div class="btns" style="margin-top:12px"><button class="btn sun big" id="useParkPrices">✓ Use the Park\'s Prices</button>' +
          (s.priceListSeen !== PARK_PRICES.version ? '<button class="btn ghost" id="keepPrices">Keep my prices</button>' : '') + '</div>'
          : '<p class="hint">Your prices match what the park posted.</p>') +
      '</div>' +
      '<div class="card"><h2>Your prices</h2><p class="hint" style="margin-top:0">Tap <b>−</b> or <b>+</b> to change by $1, or type a new amount. Changes save by themselves.</p><div class="prices">' + priceRows +
        priceRow('wood', 'Wood — per bundle', s.wood) +
        priceRow('cleaning', 'Usual cleaning fee <span style="font-weight:400;color:var(--muted)">(0 = none)</span>', s.cleaning) +
        priceRow('cabinCleaning', 'Cabin cleaning fee <span style="font-weight:400;color:var(--muted)">(filled in when a cabin is picked)</span>', s.cabinCleaning) +
      '</div><label class="lbl" for="p-park">Campground name</label><input class="txt" id="p-park" value="' + esc(s.park) + '">' +
      '<p class="hint">New prices are used for <b>new</b> check-ins. Old check-ins keep the price they were charged.' +
        (s.pricesChangedAt ? ' Prices last changed ' + esc(new Date(s.pricesChangedAt).toLocaleDateString()) + '.' : '') + '</p>' +
      '<div class="btns" style="margin-top:12px"><button class="btn big" id="savePrices">✓ Save Prices</button></div></div>' +
      '<div class="card"><h2>Tablet modes &amp; PIN</h2><p style="font-size:1.05rem"><b>Cantril Mode</b> is the welcome screen for campers. <b>Personal Mode</b> is your own home screen. The PIN switches from Cantril Mode back to yours.</p>' +
        '<label class="lbl" for="p-pin">PIN (4 numbers)</label><input class="txt" id="p-pin" inputmode="numeric" maxlength="4" value="' + esc(s.pin || '2193') + '" style="max-width:200px">' +
        '<div class="btns" style="margin-top:12px"><button class="btn sun big" data-setmode="cantril">🏞️ Start Cantril Mode</button><button class="btn ghost" data-setmode="personal">🏠 Personal Mode</button></div></div>' +
      (DEMO ? '' : '<div class="card"><h2>Practice</h2><p style="font-size:1.1rem">Want to try things out first? Practice Mode has pretend campers. It never touches the real book.</p><div class="btns"><a class="btn sun big" href="./?demo">🎓 Open Practice Mode</a></div></div>') +
      '<div class="card"><h2>Backup copy</h2><p style="font-size:1.1rem">Everything is kept on this device only. Once a week, tap <b>Save a Backup</b> — it puts a file in your Downloads folder. If the tablet ever breaks, that file brings everything back.</p>' +
        '<div class="btns"><button class="btn sun big" id="backupBtn">💾 Save a Backup</button><button class="btn ghost" id="csvBtn">📊 Spreadsheet (CSV)</button><button class="btn ghost" id="restoreBtn">📂 Restore from Backup</button></div>' +
        '<input type="file" id="restoreFile" accept=".json,application/json" hidden>' +
        '<p class="hint">' + db.entries.length + ' check-ins and ' + db.feedback.length + ' feedback saved on this device.' + (s.lastBackup ? ' Last backup: ' + esc(new Date(s.lastBackup).toLocaleDateString()) + '.' : ' No backup yet.') + '</p></div>';
  }
  function savePriceForm() {
    var s = db.settings, before = JSON.stringify([s.prices, s.wood]);
    SITE_TYPES.forEach(function (t) { s.prices[t.id] = Math.max(0, num($('#p-' + t.id).value)); });
    s.wood = Math.max(0, num($('#p-wood').value)); s.cleaning = Math.max(0, num($('#p-cleaning').value));
    s.cabinCleaning = Math.max(0, num($('#p-cabinCleaning').value));
    s.park = $('#p-park').value.trim() || 'Campground';
    var pin = ($('#p-pin') && $('#p-pin').value || '').replace(/\D/g, ''); if (pin.length === 4) s.pin = pin;
    if (JSON.stringify([s.prices, s.wood]) !== before) markPricesChanged();
    s.pricesConfirmed = true;
    save();
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


  // ---------- Camper feedback ----------
  var FB_LIKES = ['Clean bathrooms', 'Hot showers', 'Friendly hosts', 'Quiet & peaceful', 'Nice sites', 'Good electric', 'Good water', 'Pretty park', 'Fair price', 'Kid friendly'];
  var FB_NEEDS = ['Bathrooms need cleaning', 'Showers', 'Trash pickup', 'Too noisy', 'Bugs', 'Electric problem', 'Water problem', 'Site needs work', 'Mowing', 'Lighting at night', 'Wi-Fi'];
  function blankFb(by) { return { id: null, by: by, date: todayIso(), name: '', site: '', stars: 0, likes: [], needs: [], comment: '', followUp: false }; }
  function starTxt(n) { n = num(n); return n ? new Array(n + 1).join('★') + new Array(6 - n).join('☆') : 'No stars'; }
  function fbSummary(list) {
    var rated = list.filter(function (f) { return num(f.stars) > 0; }), sum = 0, likes = {}, needs = {};
    rated.forEach(function (f) { sum += num(f.stars); });
    list.forEach(function (f) { (f.likes || []).forEach(function (x) { likes[x] = (likes[x] || 0) + 1; }); (f.needs || []).forEach(function (x) { needs[x] = (needs[x] || 0) + 1; }); });
    var top = function (o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).slice(0, 4).map(function (k) { return { k: k, n: o[k] }; }); };
    return { count: list.length, avg: rated.length ? sum / rated.length : 0, likes: top(likes), needs: top(needs), followUps: list.filter(function (f) { return f.followUp && !f.handled; }).length };
  }
  function viewFeedback() {
    var ym = todayIso().slice(0, 7);
    var all = db.feedback.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var month = all.filter(function (f) { return (f.date || '').slice(0, 7) === ym; });
    var s = fbSummary(month);
    var chips = function (arr, cls) { return arr.length ? arr.map(function (x) { return '<span class="fbchip ' + cls + '">' + esc(x.k) + ' <b>' + x.n + '</b></span>'; }).join('') : '<span class="hint">Nothing yet</span>'; };
    var list = all.length ? all.slice(0, 80).map(function (f) {
      return '<button class="guest fbrow" data-fb="' + f.id + '">' +
        '<div class="site"><small>SITE</small>' + esc(f.site || '–') + '</div>' +
        '<div class="main"><div class="nm"><span class="stars">' + starTxt(f.stars) + '</span> ' + esc(f.name || 'A camper') +
        (f.followUp && !f.handled ? ' <span class="tag followup">Wants a call back</span>' : '') + '</div>' +
        '<div class="meta">' + esc(shortDate(f.date)) + ' · ' + (f.by === 'camper' ? 'Camper typed it' : 'Host wrote it') + '</div>' +
        (f.needs && f.needs.length ? '<div class="meta">🔧 ' + esc(f.needs.join(', ')) + '</div>' : '') +
        (f.comment ? '<div class="meta">“' + esc(f.comment.length > 140 ? f.comment.slice(0, 140) + '…' : f.comment) + '”</div>' : '') +
        '</div></button>';
    }).join('') : '<div class="empty">No feedback yet. Tap one of the big buttons above to start.</div>';
    return '<h1>Camper Feedback</h1>' +
      '<p style="font-size:1.1rem;margin-top:-4px">Walk around and ask campers how their stay is going. Write it down yourself, or hand them the tablet.</p>' +
      '<div class="big-grid fbstart">' +
        '<button class="tile primary" data-fbnew="host"><span class="ico">📝</span><span class="t">I\'ll Write It Down</span><span class="d">Ask the camper and tap in what they say</span></button>' +
        '<button class="tile camper" data-fbnew="camper"><span class="ico">🙋</span><span class="t">Hand It to the Camper</span><span class="d">Big, simple screen they fill in themselves</span></button>' +
      '</div>' +
      '<div class="card" style="margin-top:18px"><h2>This month</h2><div class="stats" style="margin:8px 0 14px">' +
        '<div class="stat"><div class="n">' + s.count + '</div><div class="l">Feedback this month</div></div>' +
        '<div class="stat"><div class="n">' + (s.avg ? s.avg.toFixed(1) + ' ★' : '–') + '</div><div class="l">Average stars</div></div>' +
        '<div class="stat"><div class="n">' + s.followUps + '</div><div class="l">Want a call back</div></div>' +
      '</div><h3>What campers like</h3><div class="fbchips">' + chips(s.likes, 'like') + '</div>' +
      '<h3 style="margin-top:14px">What needs work</h3><div class="fbchips">' + chips(s.needs, 'need') + '</div>' +
      '<div class="btns" style="margin-top:16px"><button class="btn ghost" id="fbPrint">🖨 Print this month</button><button class="btn ghost" id="fbCsv">📊 Spreadsheet (CSV)</button></div></div>' +
      '<h2>All feedback</h2>' + (all.length ? '<p class="hint" style="font-size:1.05rem">Tap one to read it all, mark it handled, or delete it.</p>' : '') + list;
  }
  function viewFbForm() {
    var f = state.fb, camper = f.by === 'camper', editing = !!f.id;
    var chipBtns = function (arr, key) {
      return arr.map(function (x) { return '<button type="button" class="choice fbpick' + (f[key].indexOf(x) >= 0 ? ' on' : '') + '" data-fbpick="' + key + '" data-v="' + esc(x) + '">' + esc(x) + '</button>'; }).join('');
    };
    var stars = [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="star' + (num(f.stars) >= n ? ' on' : '') + '" data-star="' + n + '" aria-label="' + n + ' star' + (n > 1 ? 's' : '') + '">★</button>'; }).join('');
    var words = ['', 'Not good', 'Could be better', 'OK', 'Good', 'Great!'];
    return (camper ? '<div class="fbhero"><h1>Thanks for staying with us!</h1><p>Tell us how your stay is going. It only takes a minute.</p></div>'
                   : '<h1>' + (editing ? 'Feedback' : 'Write Down Feedback') + '</h1><p class="hint" style="font-size:1.05rem;margin-top:-4px">Every part is optional. Fill in what the camper tells you.</p>') +
      '<div class="card"><div class="step"><span class="num">1</span><h2>' + (camper ? 'How is your stay?' : 'How do they rate their stay?') + '</h2></div>' +
        '<div class="stars-row">' + stars + '</div><div class="starword" id="starWord">' + (words[num(f.stars)] || (camper ? 'Tap a star' : 'Tap a star')) + '</div></div>' +
      '<div class="card"><div class="step"><span class="num">2</span><h2>' + (camper ? 'What do you like?' : 'What do they like?') + '</h2></div><p class="hint" style="margin-top:-6px">Tap all that fit.</p><div class="choices fbchoices">' + chipBtns(FB_LIKES, 'likes') + '</div></div>' +
      '<div class="card"><div class="step"><span class="num">3</span><h2>What could be better?</h2></div><p class="hint" style="margin-top:-6px">Tap all that fit.</p><div class="choices fbchoices need">' + chipBtns(FB_NEEDS, 'needs') + '</div></div>' +
      '<div class="card"><div class="step"><span class="num">4</span><h2>' + (camper ? 'Anything else you\'d like to tell us?' : 'Anything else they said?') + '</h2></div>' +
        '<textarea class="txt" id="fb-comment" placeholder="' + (camper ? 'Type here, or tap the microphone on the keyboard to talk' : 'Write it in their words') + '">' + esc(f.comment) + '</textarea></div>' +
      '<div class="card"><div class="step"><span class="num">5</span><h2>' + (camper ? 'About you (optional)' : 'Who is it? (optional)') + '</h2></div>' +
        '<div class="row2"><div><label class="lbl" for="fb-name">Name</label><input class="txt" id="fb-name" autocapitalize="words" autocomplete="off" value="' + esc(f.name) + '" placeholder="' + (camper ? 'You can leave this empty' : 'Last name, First name') + '"></div>' +
        '<div><label class="lbl" for="fb-site">Site number</label><input class="txt" id="fb-site" inputmode="numeric" value="' + esc(f.site) + '" placeholder="Site #"></div></div>' +
        '<button type="button" class="choice fbpick followup' + (f.followUp ? ' on' : '') + '" id="fbFollow" style="margin-top:14px">' + (camper ? '🙋 Please have a host come talk to me' : '🙋 They want someone to follow up') + '</button></div>' +
      (editing ? '<div class="card"><p class="hint" style="margin-top:0">Written down ' + esc(niceDate(f.date)) + ' · ' + (f.by === 'camper' ? 'the camper typed it' : 'the host wrote it') + '</p><div class="btns">' +
        (f.followUp ? '<button class="btn ' + (f.handled ? 'ghost' : 'sun') + '" id="fbHandled">' + (f.handled ? '↺ Mark as not handled' : '✓ Mark follow-up handled') + '</button>' : '') +
        '<button class="btn danger" id="fbDel">🗑 Delete this feedback</button></div></div>' : '');
  }
  function readFb() {
    var f = state.fb;
    f.comment = $('#fb-comment').value.trim(); f.name = $('#fb-name').value.trim(); f.site = $('#fb-site').value.trim();
  }
  function bindFbForm() {
    var f = state.fb, camper = f.by === 'camper';
    var bar = document.createElement('div');
    bar.className = 'savebar';
    bar.innerHTML = '<div class="inner"><div class="tot">' + (camper ? 'All done? ' : 'Feedback ') + '<span>' + (camper ? 'Tap Send when you\'re finished' : 'Saved on this tablet only') + '</span></div>' +
      '<div class="btns"><button class="btn ghost" id="fbCancel">' + (camper ? 'Host: go back' : 'Cancel') + '</button><button class="btn sun big" id="fbSave">' + (camper ? '✓ Send' : '✓ Save Feedback') + '</button></div></div>';
    document.body.appendChild(bar);
    var app = $('#app'), words = ['', 'Not good', 'Could be better', 'OK', 'Good', 'Great!'];
    app.oninput = null;
    app.onclick = function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.star) {
        f.stars = num(b.dataset.star) === num(f.stars) ? 0 : num(b.dataset.star);
        app.querySelectorAll('[data-star]').forEach(function (x) { x.classList.toggle('on', num(x.dataset.star) <= num(f.stars)); });
        $('#starWord').textContent = words[f.stars] || 'Tap a star';
      } else if (b.dataset.fbpick) {
        var arr = f[b.dataset.fbpick], v = b.dataset.v, i = arr.indexOf(v);
        if (i >= 0) arr.splice(i, 1); else arr.push(v);
        b.classList.toggle('on', i < 0);
      } else if (b.id === 'fbFollow') {
        f.followUp = !f.followUp; b.classList.toggle('on', f.followUp);
      } else if (b.id === 'fbHandled') {
        readFb(); f.handled = !f.handled; saveFb(true);
      } else if (b.id === 'fbDel') {
        confirmBox('Delete this feedback?', 'It cannot be undone.', 'Yes, delete it', function () {
          db.feedback = db.feedback.filter(function (x) { return x.id !== f.id; }); save(); toast('Feedback deleted'); go('feedback');
        }, true);
      }
    };
    $('#fbCancel').onclick = function () {
      if (!camper) return go(db.settings.mode === 'cantril' ? 'cantril' : 'feedback');
      var has = f.stars || f.likes.length || f.needs.length || $('#fb-comment').value.trim();
      var back = db.settings.mode === 'cantril' ? 'cantril' : 'feedback';
      if (!has) return go(back);
      confirmBox('Go back without saving?', 'What the camper filled in will not be kept.', 'Yes, go back', function () { go(back); }, true);
    };
    $('#fbSave').onclick = function () { readFb(); saveFb(false); };
  }
  function saveFb(stay) {
    var f = state.fb;
    if (!f.stars && !f.likes.length && !f.needs.length && !f.comment && !f.followUp) {
      return alertBox('Nothing filled in yet', f.by === 'camper' ? 'Tap some stars or buttons first, then tap Send.' : 'Tap some stars, buttons, or write what they said first.');
    }
    var rec = JSON.parse(JSON.stringify(f));
    rec.updatedAt = Date.now();
    if (rec.id) db.feedback = db.feedback.map(function (x) { return x.id === rec.id ? Object.assign({}, x, rec) : x; });
    else { rec.id = uid(); rec.createdAt = Date.now(); db.feedback.push(rec); }
    if (!save()) return;
    if (stay) { state.fb = rec; toast(rec.handled ? '✓ Marked handled' : 'Marked not handled'); return render(); }
    if (rec.by === 'camper' && !f.id) return go('fbthanks');
    if (db.settings.mode === 'cantril') { toast('✓ Feedback saved'); return go('cantril'); }
    toast('✓ Feedback saved'); go('feedback');
  }
  function viewFbThanks() {
    return '<div class="fbthanks"><div class="big">🏕️</div><h1>Thank you!</h1><p>We really appreciate you taking the time.<br>Enjoy the rest of your stay!</p>' +
      '<p class="handback">Please hand the tablet back to the host.</p>' +
      '<div class="btns" style="justify-content:center"><button class="btn sun big" id="fbAnother">🙋 Someone else wants to fill one in</button></div>' +
      '<div class="hostback"><button class="btn ghost" id="fbHostBack">Host: hold this button to go back</button></div></div>';
  }
  function bindFbThanks() {
    $('#fbAnother').onclick = function () { state.fb = blankFb('camper'); go('fbform'); };
    if (db.settings.mode === 'cantril') { setTimeout(function () { if (state.view === 'fbthanks') go('cantril'); }, 20000); }
    var hb = $('#fbHostBack'), t = null;
    var start = function (ev) { ev.preventDefault(); hb.classList.add('holding'); t = setTimeout(function () { go(db.settings.mode === 'cantril' ? 'cantril' : 'feedback'); }, 1200); };
    var stop = function () { hb.classList.remove('holding'); clearTimeout(t); };
    hb.addEventListener('pointerdown', start); ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (e) { hb.addEventListener(e, stop); });
  }
  function fbCsv() {
    var q = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var rows = db.feedback.slice().sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); }).map(function (f) {
      return [f.date, f.name, f.site, f.stars || '', (f.likes || []).join('; '), (f.needs || []).join('; '), f.comment, f.followUp ? 'yes' : '', f.handled ? 'yes' : '', f.by].map(q).join(',');
    });
    return ['Date,Name,Site,Stars,Likes,Needs work,Comment,Wants follow-up,Handled,Written by'].concat(rows).join('\r\n');
  }
  function printFeedback() {
    var ym = todayIso().slice(0, 7);
    var list = db.feedback.filter(function (f) { return (f.date || '').slice(0, 7) === ym; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var s = fbSummary(list);
    var title = parseIso(todayIso()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    var rows = list.map(function (f) {
      return '<tr><td>' + esc(shortDate(f.date)) + '</td><td>' + esc(f.name) + '</td><td>' + esc(f.site) + '</td><td>' + starTxt(f.stars) + '</td><td>' + esc((f.likes || []).join(', ')) +
        '</td><td>' + esc((f.needs || []).join(', ')) + '</td><td>' + esc(f.comment) + (f.followUp ? ' <b>[follow up' + (f.handled ? ' — done' : '') + ']</b>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="7">No feedback this month.</td></tr>';
    var html = '<div class="ph"><h1>' + esc(db.settings.park) + ' — Camper Feedback, ' + esc(title) + '</h1><div>' + s.count + ' responses · average ' + (s.avg ? s.avg.toFixed(1) + ' stars' : '–') + '</div></div>' +
      '<p><b>Liked most:</b> ' + (s.likes.map(function (x) { return esc(x.k) + ' (' + x.n + ')'; }).join(', ') || '–') +
      '<br><b>Needs work:</b> ' + (s.needs.map(function (x) { return esc(x.k) + ' (' + x.n + ')'; }).join(', ') || '–') + '</p>' +
      '<table><thead><tr><th>Date</th><th>Name</th><th>Site</th><th>Stars</th><th>Liked</th><th>Needs work</th><th>Comments</th></tr></thead><tbody>' + rows + '</tbody></table>';
    var ps = $('#printSheet'); if (!ps) { ps = document.createElement('div'); ps.id = 'printSheet'; document.body.appendChild(ps); }
    ps.innerHTML = html;
    window.print();
  }


  // ---------- Modes: Cantril (public kiosk) / Personal (the hosts) / Host Book ----------
  var CANTRIL = { lat: 40.6436, lon: -92.0699 };
  var WX = { 0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'],
    51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Drizzle'], 56: ['🌧️', 'Freezing drizzle'], 57: ['🌧️', 'Freezing drizzle'],
    61: ['🌦️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'], 66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'],
    71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['🌨️', 'Snow'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Heavy showers'],
    85: ['🌨️', 'Snow showers'], 86: ['❄️', 'Snow showers'], 95: ['⛈️', 'Thunderstorms'], 96: ['⛈️', 'Storms & hail'], 99: ['⛈️', 'Storms & hail'] };
  function wxCached() { try { return JSON.parse(localStorage.getItem('camphost_wx')); } catch (e) { return null; } }
  function loadWeather() {
    var c = wxCached();
    if (c && Date.now() - c.at < 20 * 60000) return;
    if (!navigator.onLine) return;
    var u = 'https://api.open-meteo.com/v1/forecast?latitude=' + CANTRIL.lat + '&longitude=' + CANTRIL.lon +
      '&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago&forecast_days=4';
    fetch(u).then(function (r) { return r.json(); }).then(function (j) {
      localStorage.setItem('camphost_wx', JSON.stringify({ at: Date.now(), j: j }));
      if (state.view === 'cantril' || state.view === 'personal') render();
    }).catch(function () {});
  }
  function weatherCard() {
    var c = wxCached();
    if (!c) return '<div class="wxcard"><div class="wxnow"><span class="wxico">🌤️</span><div><div class="wxt">Weather</div><div class="wxd">Shows up when the tablet is on Wi-Fi</div></div></div></div>';
    var j = c.j, cur = j.current, d = j.daily, w = WX[cur.weather_code] || ['🌡️', ''];
    var days = d.time.slice(0, 4).map(function (t, i) {
      var ww = WX[d.weather_code[i]] || ['🌡️', ''];
      return '<div class="wxday"><div class="dn">' + (i === 0 ? 'Today' : parseIso(t).toLocaleDateString(undefined, { weekday: 'short' })) + '</div><div class="di">' + ww[0] + '</div>' +
        '<div class="dt"><b>' + Math.round(d.temperature_2m_max[i]) + '°</b> ' + Math.round(d.temperature_2m_min[i]) + '°</div>' +
        (d.precipitation_probability_max[i] >= 30 ? '<div class="dp">💧 ' + d.precipitation_probability_max[i] + '%</div>' : '') + '</div>';
    }).join('');
    var age = Math.round((Date.now() - c.at) / 60000);
    return '<div class="wxcard"><div class="wxnow"><span class="wxico">' + w[0] + '</span><div><div class="wxt">' + Math.round(cur.temperature_2m) + '°</div>' +
      '<div class="wxd">' + esc(w[1]) + ' · wind ' + Math.round(cur.wind_speed_10m) + ' mph</div><div class="wxa">Cantril' + (age > 60 ? ' · updated ' + Math.round(age / 60) + ' h ago' : '') + '</div></div></div>' +
      '<div class="wxdays">' + days + '</div></div>';
  }
  function clockLine() {
    var n = new Date();
    return '<div class="bigclock"><div class="tm" id="bigTime">' + n.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) + '</div><div class="dt">' + esc(niceDate(todayIso())) + '</div></div>';
  }
  setInterval(function () { var t = $('#bigTime'); if (t) t.textContent = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }, 15000);
  setInterval(function () { if (state.view === 'cantril' || state.view === 'personal') loadWeather(); }, 10 * 60000);
  // kiosk idle: after 3 minutes untouched in Cantril mode, go back to the welcome screen
  var idleT = null;
  function idleReset() {
    clearTimeout(idleT);
    if (db.settings.mode !== 'cantril') return;
    idleT = setTimeout(function () { closeModal(); if (state.view !== 'cantril' && state.view !== 'fbform') go('cantril'); }, 180000);
  }
  ['pointerdown', 'keydown'].forEach(function (e) { document.addEventListener(e, idleReset, true); });

  function openExternal(url, pkg) {
    if (window.AndroidKiosk) { try { if (pkg ? window.AndroidKiosk.openApp(pkg, url || '') : window.AndroidKiosk.openUrl(url)) return; } catch (e) {} }
    if (url) window.open(url, '_blank');
  }

  var TODO_PARK = [
    ['🎣', 'Fishing', 'Bring your pole. Ask the hosts where they\'re biting.'],
    ['🥏', 'Disc golf', 'Free to play. Bring your own discs.'],
    ['🧺', 'Picnics & walks', '23 acres of park to stretch your legs.'],
    ['🔥', 'Campfires', 'Firewood bundles are sold by the hosts.']
  ];
  var TODO_NEAR = [
    ['🛒', 'Dutchman\'s Store', 'Amish general store right in Cantril: bulk foods, baking, hardware.'],
    ['🏞️', 'Lacey-Keosauqua State Park', 'Hiking, the Des Moines River and a swimming beach. About 15 minutes.'],
    ['🚣', 'Lake Sugema', 'Big fishing lake with trails, near Keosauqua.'],
    ['🏘️', 'Villages of Van Buren', 'Keosauqua, Bentonsport, Bonaparte and more: old river towns, shops and history.'],
    ['🏨', 'Hotel Manning, Keosauqua', 'Historic 1800s riverboat-style hotel on the river.']
  ];
  function viewCantril() {
    loadWeather();
    return '<div class="khero"><div><h1>Welcome to ' + esc(db.settings.park) + '!</h1><p>Cantril, Iowa · cared for by the Cantril Grass Roots Corporation</p></div>' + clockLine() + '</div>' +
      weatherCard() +
      '<div class="big-grid kgrid">' +
        '<button class="tile primary" data-go="todo"><span class="ico">🗺️</span><span class="t">Things to Do</span><span class="d">In the park and around Van Buren County</span></button>' +
        '<button class="tile" data-go="park"><span class="ico">🏕️</span><span class="t">Park Info &amp; Prices</span><span class="d">Sites, cabins and how to pay</span></button>' +
        '<button class="tile camper" data-fbnew="camper"><span class="ico">💬</span><span class="t">How Are We Doing?</span><span class="d">Tell the hosts about your stay</span></button>' +
        '<button class="tile" data-go="help"><span class="ico">🆘</span><span class="t">Help &amp; Emergency</span><span class="d">Phone numbers and the nearest hospital</span></button>' +
      '</div>' +
      '<div class="kfoot"><button class="btn ghost" data-pin="host">🔒 Hosts</button></div>';
  }
  function todoList(arr) { return arr.map(function (x) { return '<div class="todo"><span class="ico">' + x[0] + '</span><div><div class="t">' + esc(x[1]) + '</div><div class="d">' + esc(x[2]) + '</div></div></div>'; }).join(''); }
  function viewTodo() {
    return '<h1>Things to Do</h1>' +
      '<div class="card"><h2>Right here in the park</h2><div class="todos">' + todoList(TODO_PARK) + '</div></div>' +
      '<div class="card"><h2>Nearby</h2><div class="todos">' + todoList(TODO_NEAR) + '</div><p class="hint">Hours change with the seasons. Call ahead or ask the hosts.</p>' +
      '<div class="btns"><button class="btn sun big" data-ext="https://villagesofvanburen.com/events/">📅 See events in Van Buren County</button></div></div>';
  }
  function viewPark() {
    var s = db.settings;
    var rows = SITE_TYPES.map(function (t) { return '<tr><td>' + esc(t.name) + '<br><small class="hint">' + esc(t.desc) + '</small></td><td class="r"><b>' + money(s.prices[t.id]) + '</b> a night</td></tr>'; }).join('') +
      '<tr><td>Firewood</td><td class="r"><b>' + money(s.wood) + '</b> a bundle</td></tr>';
    return '<h1>Park Info &amp; Prices</h1>' +
      '<div class="card"><h2>Nightly prices</h2><table class="breakdown kprices">' + rows + '</table>' +
      '<p style="font-size:1.1rem">Pay the campground hosts with cash, check or card. The hosts will write you into the book.</p></div>' +
      '<div class="card"><h2>Cabins</h2><p style="font-size:1.15rem">The rustic cabin and the accessible (ADA) cabin are rented by reservation.<br>Call <b>319-397-2193</b>.</p></div>';
  }
  function viewHelp() {
    return '<h1>Help &amp; Emergency</h1>' +
      '<div class="card emerg"><div class="n911">911</div><p style="font-size:1.3rem;margin:0">For a fire, crime or medical emergency, call <b>911</b>.<br>Tell them: <b>' + esc(db.settings.park) + ', Cantril, Iowa</b>.</p></div>' +
      '<div class="card"><h2>Nearest hospital</h2><p style="font-size:1.2rem">Van Buren County Hospital<br>Keosauqua, Iowa (about 15 minutes)</p></div>' +
      '<div class="card"><h2>Campground &amp; cabins</h2><p style="font-size:1.2rem">Reservations and questions: <b>319-397-2193</b><br>Or find the campground hosts in the park.</p></div>';
  }
  function viewPersonal() {
    loadWeather();
    var tile = function (ico, t, d, attrs, cls) { return '<button class="tile ' + (cls || '') + '" ' + attrs + '><span class="ico">' + ico + '</span><span class="t">' + t + '</span><span class="d">' + d + '</span></button>'; };
    var h = new Date().getHours(), greet = h < 12 ? 'Good morning!' : h < 17 ? 'Good afternoon!' : 'Good evening!';
    return '<div class="khero personal"><div><h1>' + greet + '</h1><p>Here\'s your day.</p></div>' + clockLine() + '</div>' + weatherCard() +
      '<div class="big-grid pgrid">' +
        tile('📧', 'Email', 'Read and send email', 'data-app="com.google.android.gm" data-url="https://mail.google.com"') +
        tile('💬', 'Messenger', 'Message and video call family', 'data-app="com.facebook.orca" data-url="https://www.messenger.com"') +
        tile('👍', 'Facebook', 'See what everyone\'s up to', 'data-app="com.facebook.katana" data-url="https://m.facebook.com"') +
        tile('🖼️', 'Photos', 'Your pictures', 'data-app="com.sec.android.gallery3d"') +
        tile('📷', 'Camera', 'Take a picture', 'data-app="com.sec.android.app.camera"') +
        tile('🗺️', 'Things to Do', 'Around Cantril and Van Buren County', 'data-go="todo"') +
        tile('📅', 'Events Nearby', 'What\'s happening this week', 'data-ext="https://villagesofvanburen.com/events/"') +
        tile('🌐', 'Internet', 'Look something up', 'data-app="com.android.chrome" data-url="https://www.google.com"') +
        tile('📒', 'Host Book', 'Check-ins, totals and feedback', 'data-go="home"', 'primary') +
      '</div>' +
      '<div class="card" style="margin-top:18px"><h2>Tablet</h2><div class="btns">' +
        '<button class="btn sun big" data-setmode="cantril">🏞️ Back to Cantril Mode</button>' +
        '<button class="btn ghost" data-app="com.android.settings">⚙️ Tablet settings</button>' +
        '<button class="btn ghost" data-app="com.sec.android.app.launcher">📱 Regular tablet screen</button>' +
      '</div><p class="hint">Cantril Mode is the welcome screen for campers. Your PIN gets you back here.</p></div>';
  }
  function askPin(onOk) {
    var entered = '';
    var m = modal('<h2>Enter your PIN</h2><div class="pindots" id="pinDots"></div><div class="pinpad">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫'].map(function (k) { return '<button class="pk" data-k="' + k + '">' + k + '</button>'; }).join('') +
      '</div><div class="btns" style="justify-content:center"><button class="btn ghost" data-no>Cancel</button></div>');
    var dots = function () { $('#pinDots').innerHTML = [0, 1, 2, 3].map(function (i) { return '<span class="' + (i < entered.length ? 'on' : '') + '"></span>'; }).join(''); };
    dots();
    m.onclick = function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-no')) { m.onclick = null; return closeModal(); }
      var k = b.dataset.k; if (k == null) return;
      if (k === 'C') entered = ''; else if (k === '⌫') entered = entered.slice(0, -1); else if (entered.length < 4) entered += k;
      dots();
      if (entered.length === 4) {
        var dev = false; try { dev = !!(window.AndroidKiosk && window.AndroidKiosk.checkDev(entered)); } catch (e) {}
        if (dev) { m.onclick = null; closeModal(); go('dev'); }
        else if (entered === String(db.settings.pin || '2193')) { m.onclick = null; closeModal(); onOk(); }
        else { $('#pinDots').classList.add('bad'); setTimeout(function () { entered = ''; var d = $('#pinDots'); if (d) { d.classList.remove('bad'); dots(); } }, 700); }
      }
    };
  }
  // Developer mode: only reachable inside the tablet's kiosk app (its login lives in the app, not in this public code)
  function viewDev() {
    var info = {}; try { info = JSON.parse(window.AndroidKiosk ? window.AndroidKiosk.info() : '{}'); } catch (e) {}
    var row = function (k, v) { return '<tr><td>' + esc(k) + '</td><td class="r">' + esc(v) + '</td></tr>'; };
    var used = 0; try { used = (localStorage.getItem(KEY) || '').length; } catch (e) {}
    return '<h1>🛠️ Developer Mode</h1>' +
      '<div class="card"><h2>Tablet</h2><div class="btns">' +
        '<button class="btn sun big" data-devact="exit">📱 Exit kiosk (regular tablet)</button>' +
        '<button class="btn ghost" data-app="com.android.settings">⚙️ Android settings</button>' +
        '<button class="btn ghost" data-devact="devopts">🧰 Developer options</button>' +
        '<button class="btn ghost" data-app="com.tailscale.ipn">🔐 Tailscale</button>' +
        '<button class="btn ghost" data-devact="reload">🔄 Reload app (get updates)</button>' +
      '</div></div>' +
      '<div class="card"><h2>Modes</h2><div class="btns">' +
        '<button class="btn" data-setmode="cantril">🏞️ Cantril Mode</button><button class="btn" data-setmode="personal">🏠 Personal Mode</button><button class="btn" data-setmode="host">📒 Host Book only</button>' +
        '<button class="btn ghost" data-devact="pin">🔑 Reset parents\' PIN to 2193</button>' +
      '</div></div>' +
      '<div class="card"><h2>Info</h2><table class="breakdown">' +
        row('Mode', db.settings.mode) + row('Parents\' PIN', db.settings.pin || '2193') + row('Check-ins / feedback', db.entries.length + ' / ' + db.feedback.length) +
        row('Saved data', Math.round(used / 1024) + ' KB') + row('Online', navigator.onLine ? 'yes' : 'no') + row('Page', location.href) +
        Object.keys(info).map(function (k) { return row(k, info[k]); }).join('') + '</table></div>';
  }
  function setMode(mode) { db.settings.mode = mode; save(); try { if (window.AndroidKiosk) window.AndroidKiosk.modeChanged(mode); } catch (e) {} go(modeHome()); }

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
      if (b.dataset.pin) { return askPin(function () { setMode(b.dataset.pin === 'host' ? 'personal' : b.dataset.pin); }); }
      if (b.dataset.devact) {
        var a = b.dataset.devact;
        if (a === 'exit' && window.AndroidKiosk) return window.AndroidKiosk.exitKiosk();
        if (a === 'devopts' && window.AndroidKiosk) return window.AndroidKiosk.openSettings('android.settings.APPLICATION_DEVELOPMENT_SETTINGS');
        if (a === 'reload') { if (window.AndroidKiosk) return window.AndroidKiosk.reload(); return location.reload(); }
        if (a === 'pin') { db.settings.pin = '2193'; save(); toast('PIN reset to 2193'); return render(); }
        return;
      }
      if (b.dataset.setmode) { return setMode(b.dataset.setmode); }
      if (b.dataset.app) { return openExternal(b.dataset.url || '', b.dataset.app); }
      if (b.dataset.ext) { return openExternal(b.dataset.ext); }
      if (b.dataset.fbnew) { state.fb = blankFb(b.dataset.fbnew); return go('fbform'); }
      if (b.dataset.fb) { var fx = db.feedback.filter(function (x) { return x.id === b.dataset.fb; })[0]; if (fx) { state.fb = JSON.parse(JSON.stringify(fx)); state.fb.likes = state.fb.likes || []; state.fb.needs = state.fb.needs || []; go('fbform'); } return; }
      if (b.id === 'fbPrint') return printFeedback();
      if (b.id === 'fbCsv') { download('campground-feedback-' + todayIso() + '.csv', fbCsv(), 'text/csv'); return toast('Spreadsheet saved to Downloads'); }
      if (b.id === 'savePrices') { savePriceForm(); toast('✓ Prices saved'); return render(); }
      if (b.dataset.pstep) {
        var inp = $('#p-' + b.dataset.pstep);
        inp.value = Math.max(0, Math.round(num(inp.value)) + num(b.dataset.d));
        savePriceForm(); toast('✓ Saved — ' + money(inp.value)); return;
      }
      if (b.id === 'useParkPrices') {
        var ch = parkPriceChanges();
        ch.forEach(function (t) { db.settings.prices[t.id] = num(PARK_PRICES.prices[t.id]); });
        db.settings.priceListSeen = PARK_PRICES.version; markPricesChanged();
        save(); toast('✓ Updated ' + ch.length + ' price' + (ch.length === 1 ? '' : 's')); return render();
      }
      if (b.id === 'keepPrices') { db.settings.priceListSeen = PARK_PRICES.version; db.settings.pricesConfirmed = true; save(); toast('OK — kept your prices'); return render(); }
      if (b.id === 'backupBtn') {
        db.settings.lastBackup = Date.now(); save();
        download('campground-backup-' + todayIso() + '.json', JSON.stringify(db, null, 1), 'application/json');
        toast('Backup saved to Downloads'); return render();
      }
      if (b.id === 'csvBtn') { download('campground-checkins-' + todayIso() + '.csv', csv(), 'text/csv'); return toast('Spreadsheet saved to Downloads'); }
      if (b.id === 'restoreBtn') return $('#restoreFile').click();
    };
    if ($('.prices')) $('#app').onchange = function (ev) { if (ev.target.id && ev.target.id.indexOf('p-') === 0) { savePriceForm(); toast('✓ Saved'); } };
    else $('#app').onchange = null;
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
          if (Array.isArray(data.feedback)) { var fbId = {}; db.feedback.forEach(function (x) { fbId[x.id] = x; }); data.feedback.forEach(function (x) { if (x && x.id) fbId[x.id] = x; }); db.feedback = Object.keys(fbId).map(function (k) { return fbId[k]; }); }
          if (data.settings) { db.settings = Object.assign({}, db.settings, data.settings); db.settings.prices = Object.assign({}, DEFAULTS.settings.prices, data.settings.prices || {}); }
          lockRates(); save(); toast('✓ Backup restored'); render();
        });
      };
      r.readAsText(f);
      rf.value = '';
    };
  }

  load();
  state.view = modeHome();
  render();
  idleReset();
  try { if (window.AndroidKiosk) window.AndroidKiosk.modeChanged(db.settings.mode); } catch (e) {}
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  window.__camp = { db: function () { return db; }, state: state, go: go, calc: calc, summarize: summarize };
})();
