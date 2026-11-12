/* Launcher: the TV's home screen. */
(function () {
  'use strict';
  var T = window.TVH, C = T.cfg, $ = T.$, el = T.el, nav = T.nav;
  var MOONFIN = 'org.moonfin.webos';

  /* ---------- clock ---------- */
  function tick() {
    var d = new Date();
    $('#date').textContent = T.formatDate(d);
    $('#clock').textContent = T.formatTime(d);
  }
  tick(); setInterval(tick, 5000);

  /* ---------- background follows focus ---------- */
  var bgFront = 'A', bgUrl = '';
  function setBackdrop(url, color) {
    if (color) $('#bgColor').style.backgroundColor = color;
    if (url === bgUrl) return;
    bgUrl = url;
    var cur = $('#bg' + bgFront), next = $('#bg' + (bgFront === 'A' ? 'B' : 'A'));
    if (!url) { cur.classList.remove('show'); next.classList.remove('show'); return; }
    var img = new Image();
    img.onload = function () {
      if (bgUrl !== url) return;
      next.style.backgroundImage = 'url("' + url + '")';
      next.classList.add('show'); cur.classList.remove('show');
      bgFront = bgFront === 'A' ? 'B' : 'A';
    };
    img.src = url;
  }

  /* ---------- status chips (Home Assistant) ---------- */
  var chips = {};
  function chip(key, icon, label, focusable) {
    var c = el(focusable ? 'button' : 'div', 'chip' + (focusable ? ' f' : ''));
    c.innerHTML = T.icon(icon, 26, focusable ? '#F2F4F7' : '#9AA3B2', 1.8) + '<span class="lbl"></span><span class="val"></span>';
    c.querySelector('.lbl').textContent = label;
    $('#chips').appendChild(c);
    chips[key] = c;
    return c;
  }
  var wifiChip = chip('wifi', 'wifi', 'Share WiFi', true);
  T.onAction(wifiChip, openWifi);
  wifiChip.dataset.color = '#1f3550';
  var H = C.home || {};
  if (T.ha) {
    chip('temp', 'thermo', H.roomName || 'Living room');
    chip('lights', 'bulb', '');
    chip('door', 'lock', 'Flat door');
    T.ha.watch([H.temperature, H.lock].concat(H.lights || []));
    T.ha.onChange(renderChips);
    T.ha.onStatus(renderChips);
    T.ha.connect();
  }
  function setChip(key, val, label, warn, iconName) {
    var c = chips[key]; if (!c) return;
    if (label !== undefined) c.querySelector('.lbl').textContent = label;
    c.querySelector('.val').textContent = val || '';
    c.classList.toggle('warn', !!warn);
    if (iconName) c.querySelector('svg').outerHTML = T.icon(iconName, 26, warn ? '#FFB547' : '#9AA3B2', 1.8);
    c.style.display = (val || label) ? '' : 'none';
  }
  function renderChips() {
    var ha = T.ha;
    if (!ha.connected && !Object.keys(ha.states).length) { setChip('temp', '…'); setChip('lights', '', ''); setChip('door', '…'); return; }
    var t = ha.state(H.temperature);
    setChip('temp', t && !isNaN(parseFloat(t.state)) ? parseFloat(t.state).toFixed(1) + '°' : '–');
    var on = (H.lights || []).filter(function (id) { var s = ha.state(id); return s && s.state === 'on'; }).length;
    setChip('lights', '', on === 0 ? 'All lights off' : on === 1 ? '1 light on' : on + ' lights on', on > 0, 'bulb');
    var l = ha.state(H.lock), ls = l ? l.state : 'unknown';
    var txt = { locked: 'Locked', unlocked: 'Unlocked', open: 'Open', opening: 'Opening', unlocking: 'Unlocking', locking: 'Locking', jammed: 'Jammed' }[ls] || '–';
    setChip('door', txt, 'Flat door', ls !== 'locked' && ls !== 'unknown' && ls !== 'unavailable', ls === 'locked' ? 'lock' : 'unlock');
  }

  /* ---------- Moonfin rail ---------- */
  var cards = [], heroCard = null;
  function setHero(card) {
    heroCard = card;
    $('#heroTitle').textContent = card ? card.title : 'Moonfin';
    var meta = card ? [card.subtitle, card.meta].filter(Boolean).join(' · ') : 'Nothing in progress right now';
    $('#heroMeta').textContent = meta;
    $('#heroEyebrow').textContent = card && card.nextUp ? 'Next up · Moonfin' : 'Continue watching · Moonfin';
  }
  function renderRail(list) {
    var rail = $('#rail'), keepId = nav.current && nav.current.dataset.id;
    rail.innerHTML = '';
    cards = list;
    if (!list.length) {
      var empty = el('button', 'poster empty f');
      empty.innerHTML = T.icon('moon', 34, '#C9CED6') + '<span>Open Moonfin</span>';
      T.onAction(empty, function () { T.launch(MOONFIN); });
      empty.dataset.color = '#2b2450';
      rail.appendChild(empty);
      setHero(null);
      if (!nav.current || !document.body.contains(nav.current)) nav.focus(empty);
      return;
    }
    list.forEach(function (c) {
      var p = el('button', 'poster f');
      p.dataset.id = c.id; p.dataset.scroll = 'x';
      if (c.thumb) p.style.backgroundImage = 'url("' + c.thumb + '")';
      p.innerHTML = '<div class="shade"></div><div class="play">' + '<svg width="28" height="28" viewBox="0 0 24 24" fill="#F2F4F7"><path d="M8 5v14l11-7z"/></svg></div>' +
        (c.nextUp ? '<div class="tag">Next up</div>' : '') + '<div class="label"></div>' +
        (c.progress ? '<div class="bar"><i style="width:' + Math.max(3, Math.round(c.progress)) + '%"></i></div>' : '');
      p.querySelector('.label').textContent = c.title + (c.meta ? ' · ' + c.meta : '');
      p._card = c;
      T.onAction(p, function () { T.launch(MOONFIN, { itemId: c.id }); });
      rail.appendChild(p);
    });
    setHero(list[0]);
    if (keepId) {
      var again = rail.querySelector('[data-id="' + keepId + '"]');
      if (again) nav.focus(again, true);
    }
    if (!nav.current || !document.body.contains(nav.current)) nav.focus(rail.firstChild);
  }
  function loadMoonfin() {
    if (!T.jellyfin) { renderRail([]); return; }
    T.jellyfin.continueWatching(8).then(renderRail).catch(function () { if (!cards.length) renderRail([]); });
  }

  /* ---------- dock ---------- */
  var DOCK = C.dock || [];
  function buildDock() {
    var dock = $('#dock');
    Promise.all(DOCK.map(function (a) { return a.id && !a.action ? T.appExists(a.id) : Promise.resolve(true); }))
      .then(function (present) {
        DOCK.forEach(function (a, i) {
          if (!present[i]) return;
          var t = el('button', 'tile f' + (a.accent ? ' accent' : ''));
          t.innerHTML = T.icon(a.icon, 40, a.accent ? '#FFB547' : '#F2F4F7', 1.6) + '<span></span>';
          t.querySelector('span').textContent = a.title;
          t.dataset.color = a.color || '#22324A';
          T.onAction(t, function () {
            if (a.action === 'inputs') openInputs();
            else T.launch(a.id, a.params).catch(function () { T.toast('Could not open ' + a.title, 'error'); });
          });
          dock.appendChild(t);
        });
      });
    var hint = $('#hint');
    if (C.panelKey) hint.innerHTML = 'Hold <span class="key">' + C.panelKey + '</span> for smart home';
  }

  /* ---------- overlays ---------- */
  var overlay = null, lastFocus = null;
  function openOverlay(id, preferred) {
    lastFocus = nav.current;
    overlay = $(id);
    overlay.classList.remove('hidden');
    nav.setScope(overlay, preferred);
  }
  function closeOverlay() {
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay = null;
    nav.scope = null;
    nav.focus(lastFocus && document.body.contains(lastFocus) ? lastFocus : nav.items()[0]);
  }
  function openWifi() {
    var w = C.wifi || {};
    $('#wifiEyebrow').innerHTML = T.icon('wifi', 26, '#FFB547', 1.8) + '<span style="margin-left:12px">Share WiFi</span>';
    $('#wifiEyebrow').style.display = 'flex'; $('#wifiEyebrow').style.alignItems = 'center';
    $('#wifiSsid').textContent = w.ssid || '[not configured]';
    $('#wifiPw').textContent = '••••••••••';
    $('#wifiShow').textContent = 'Show password';
    var qr = $('#qr');
    qr.setAttribute('viewBox', '0 0 ' + (w.qrSize || 37) + ' ' + (w.qrSize || 37));
    qr.querySelector('path').setAttribute('d', w.qrPath || '');
    openOverlay('#wifiOverlay', $('#wifiShow'));
  }
  T.onAction($('#wifiShow'), function (b) {
    var shown = b.textContent === 'Hide password';
    $('#wifiPw').textContent = shown ? '••••••••••' : ((C.wifi && C.wifi.password) || '');
    b.textContent = shown ? 'Show password' : 'Hide password';
  });
  T.onAction($('#wifiBack'), closeOverlay);

  function openInputs() {
    var list = $('#inputsList');
    list.innerHTML = '';
    T.listInputs().then(function (inputs) {
      inputs.forEach(function (i) {
        var b = el('button', 'list-item f');
        b.innerHTML = '<span></span><span class="sub"></span>';
        b.firstChild.textContent = i.label;
        b.lastChild.textContent = i.port ? 'HDMI ' + i.port + (i.connected ? '' : ' · nothing connected') : '';
        T.onAction(b, function () { closeOverlay(); T.launch(i.appId); });
        list.appendChild(b);
      });
      openOverlay('#inputsOverlay');
    });
  }

  T.onAction($('#menuLg'), function () {
    closeOverlay();
    var go = function () { T.launch('com.webos.app.home'); };
    if (T.ha && C.lgHomePass) T.ha.call('input_boolean', 'turn_on', {}, { entity_id: C.lgHomePass }).then(go, go);
    else go();
  });
  T.onAction($('#menuReload'), function () { location.reload(); });
  T.onAction($('#menuClose'), closeOverlay);

  nav.handlers.back = function () {
    if (overlay) closeOverlay();
    else openOverlay('#menuOverlay');
  };
  nav.handlers.focus = function (f) {
    if (overlay) return;
    if (f._card) { setHero(f._card); setBackdrop(f._card.backdrop, '#1A2230'); }
    else if (f.dataset.color) setBackdrop('', f.dataset.color);
  };

  /* ---------- start ---------- */
  buildDock();
  loadMoonfin();
  setInterval(loadMoonfin, 5 * 60 * 1000);
  T.onRelaunch(function () {
    if (overlay) closeOverlay();
    loadMoonfin();
    var first = $('#rail').firstChild;
    if (first) nav.focus(first);
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) loadMoonfin(); });
})();
