/* Smart home panel: living room, scenes, music and doors, live from Home Assistant. */
(function () {
  'use strict';
  var T = window.TVH, C = T.cfg, P = C.panel || {}, $ = T.$, el = T.el, nav = T.nav, ha = T.ha;
  var returnTo = null, doorTimer = null, P_APP_ID = T.get(C, 'appIds.panel', '');

  function call(domain, service, data, target, okText) {
    if (!ha) { T.toast('Home Assistant is not configured', 'error'); return Promise.resolve(); }
    return ha.call(domain, service, data, target)
      .then(function () { if (okText) T.toast(okText); })
      .catch(function (e) { T.toast('Didn\'t work: ' + e.message, 'error'); });
  }
  function st(id) { return ha ? ha.state(id) : null; }
  function available(id) { var s = st(id); return !!s && s.state !== 'unavailable' && s.state !== 'unknown'; }

  /* ---------- side navigation ---------- */
  function sideItem(id, icon, text, target) {
    var b = $(id);
    b.innerHTML = T.icon(icon, 30, '#C9CED6', 1.8) + '<span></span>';
    b.querySelector('span').textContent = text;
    T.onAction(b, function () {
      var first = T.$$('.f', $(target))[0];
      if (first) nav.focus(first);
    });
  }
  sideItem('#navRoom', 'sofa', P.roomName || 'Living room', '#tiles');
  sideItem('#navDoors', 'door', 'Doors', '#doors');
  sideItem('#navScenes', 'star', 'Scenes', '#scenes');
  $('#roomName').textContent = P.roomName || 'Living room';

  /* ---------- tiles ---------- */
  var TILES = P.tiles || [];
  TILES.forEach(function (t) {
    var interactive = t.type === 'light' || t.type === 'cover' || t.type === 'fan';
    var d = el(interactive ? 'button' : 'div', 'tile' + (interactive ? ' f' : ' static'));
    d.innerHTML = '<div class="t-top"><span class="t-icon"></span>' + (t.badge ? '<span class="badge"></span>' : '') + '</div>' +
      '<div><div class="t-name"></div><div class="t-state"></div>' + (t.type === 'light' || t.type === 'cover' ? '<div class="t-bar"><i></i></div>' : '') + '</div>';
    d.querySelector('.t-name').textContent = t.title;
    if (t.badge) d.querySelector('.badge').textContent = t.badge;
    t.node = d;
    if (interactive) T.onAction(d, function () { tileAction(t); });
    $('#tiles').appendChild(d);
  });
  function tileAction(t) {
    var s = st(t.entity);
    if (!s || s.state === 'unavailable') { T.toast(t.title + ' is not available'); return; }
    if (t.type === 'light') call('light', 'toggle', {}, { entity_id: t.entity });
    else if (t.type === 'fan') call('fan', 'toggle', {}, { entity_id: t.entity });
    else if (t.type === 'cover') {
      if (s.state === 'opening' || s.state === 'closing') call('cover', 'stop_cover', {}, { entity_id: t.entity });
      else if (s.state === 'closed') call('cover', 'open_cover', {}, { entity_id: t.entity });
      else call('cover', 'close_cover', {}, { entity_id: t.entity });
    }
  }
  function renderTile(t) {
    var s = st(t.entity), d = t.node, on = false, text = '–', bar = null, icon = t.icon;
    if (t.hideWhenMissing) d.style.display = available(t.entity) ? '' : 'none';
    if (s && s.state === 'unavailable') text = 'Not available';
    else if (s) {
      var a = s.attributes;
      if (t.type === 'light') {
        on = s.state === 'on';
        var pct = on && a.brightness ? Math.round(a.brightness / 2.55) : 0;
        text = on ? 'On · ' + pct + '%' : 'Off'; bar = on ? pct : 0;
      } else if (t.type === 'cover') {
        var pos = a.current_position;
        text = { open: 'Open', closed: 'Closed', opening: 'Opening…', closing: 'Closing…' }[s.state] || s.state;
        if (s.state === 'open' && typeof pos === 'number' && pos < 100) text = pos + '% open';
        bar = typeof pos === 'number' ? pos : (s.state === 'closed' ? 0 : 100);
      } else if (t.type === 'binary') {
        on = s.state === 'on';
        text = on ? (t.onText || 'Open') : (t.offText || 'Closed');
      } else if (t.type === 'climate') {
        var cur = a.current_temperature, target = a.temperature;
        var mode = { auto: 'Auto', heat: 'Heating', off: 'Off', cool: 'Cooling' }[s.state] || s.state;
        text = mode + (typeof cur === 'number' ? ' · ' + cur.toFixed(1) + '°' : '') + (typeof target === 'number' ? ' → ' + target + '°' : '');
        on = a.hvac_action === 'heating';
      } else if (t.type === 'fan') {
        on = s.state === 'on';
        text = on ? 'On' + (typeof a.percentage === 'number' ? ' · ' + a.percentage + '%' : '') : 'Off';
      }
    }
    d.classList.toggle('on', on);
    d.querySelector('.t-icon').innerHTML = T.icon(icon, 44, on ? '#FFB547' : '#C9CED6', 1.6);
    d.querySelector('.t-state').textContent = text;
    var b = d.querySelector('.t-bar i');
    if (b) { b.parentNode.style.display = bar === null ? 'none' : ''; b.style.width = (bar || 0) + '%'; b.style.background = t.type === 'cover' ? '#C9CED6' : ''; }
  }

  /* ---------- scenes ---------- */
  (P.scenes || []).forEach(function (sc) {
    var b = el('button', 'scene f' + (sc.primary ? ' primary' : ''));
    b.innerHTML = T.icon(sc.icon, 30, sc.primary ? '#FFB547' : '#F2F4F7', 1.8) + '<span><span class="s-title"></span>' + (sc.sub ? '<span class="s-sub"></span>' : '') + '</span>';
    b.querySelector('.s-title').textContent = sc.title;
    if (sc.sub) b.querySelector('.s-sub').textContent = sc.sub;
    T.onAction(b, function () { call(sc.domain, sc.service, sc.data || {}, sc.target, sc.title + ' ✓'); });
    $('#scenes').appendChild(b);
  });

  /* ---------- music ---------- */
  var M = P.media || {}, mediaEntity = null;
  function mbtn(icon, label, fn, main) {
    var b = el('button', 'mbtn f' + (main ? ' main' : ''));
    b.setAttribute('aria-label', label);
    b.innerHTML = T.icon(icon, main ? 32 : 28, main ? '#0A0C10' : '#F2F4F7', 2);
    T.onAction(b, fn);
    return b;
  }
  function renderMedia() {
    var ctl = $('#mediaCtl'), cands = (M.players || []).map(st).filter(function (s) { return s && (s.state === 'playing' || s.state === 'paused'); });
    var playing = cands.filter(function (s) { return s.state === 'playing'; })[0] || cands[0] || null;
    var key = playing ? playing.entity_id + playing.state : 'idle';
    mediaEntity = playing;
    if (playing) {
      var a = playing.attributes;
      $('#mediaEyebrow').textContent = (playing.state === 'playing' ? 'Now playing' : 'Paused') + (a.source ? ' · ' + a.source : (M.groupName ? ' · ' + M.groupName : ''));
      $('#mediaTitle').textContent = a.media_title || a.app_name || 'Music';
      $('#mediaSub').textContent = [a.media_artist, a.media_album_name].filter(Boolean).join(' · ') || (a.app_name || '');
      var pic = a.entity_picture ? ha.picture(a.entity_picture) : '';
      $('#mediaArt').style.backgroundImage = pic ? 'url("' + pic + '")' : '';
      $('#mediaArt').innerHTML = pic ? '' : T.icon('music', 40, '#C9CED6', 1.6);
    } else {
      $('#mediaEyebrow').textContent = M.groupName ? 'Speakers · ' + M.groupName : 'Speakers';
      $('#mediaTitle').textContent = 'Nothing playing';
      $('#mediaSub').textContent = M.groupMembers || '';
      $('#mediaArt').style.backgroundImage = '';
      $('#mediaArt').innerHTML = T.icon('music', 40, '#C9CED6', 1.6);
    }
    if (ctl.dataset.key === key) {
      var pp = ctl.querySelector('.main');
      if (pp) pp.innerHTML = T.icon(playing && playing.state === 'playing' ? 'pause' : 'play', 32, '#0A0C10', 2);
      return;
    }
    var hadFocus = nav.current && ctl.contains(nav.current);
    ctl.dataset.key = key; ctl.innerHTML = '';
    if (playing) {
      var id = playing.entity_id;
      ctl.appendChild(mbtn('prev', 'Previous', function () { call('media_player', 'media_previous_track', {}, { entity_id: id }); }));
      ctl.appendChild(mbtn(playing.state === 'playing' ? 'pause' : 'play', 'Play or pause', function () { call('media_player', 'media_play_pause', {}, { entity_id: mediaEntity ? mediaEntity.entity_id : id }); }, true));
      ctl.appendChild(mbtn('next', 'Next', function () { call('media_player', 'media_next_track', {}, { entity_id: id }); }));
    } else if (M.resume) {
      var r = el('button', 'mbtn wide f');
      r.innerHTML = T.icon('play', 26, '#F2F4F7', 2) + '<span></span>';
      r.querySelector('span').textContent = M.resumeLabel || 'Resume Spotify';
      T.onAction(r, function () { call('script', 'turn_on', {}, { entity_id: M.resume }, 'Starting music…'); });
      ctl.appendChild(r);
    }
    if (M.volume) {
      ctl.appendChild(mbtn('volDown', 'Volume down', function () { call('media_player', 'volume_down', {}, { entity_id: M.volume }); }));
      ctl.appendChild(mbtn('volUp', 'Volume up', function () { call('media_player', 'volume_up', {}, { entity_id: M.volume }); }));
    }
    if (hadFocus) nav.focus(ctl.querySelector('.f'));
  }

  /* ---------- doors ---------- */
  var D = P.doors || {}, F = D.front || {}, L = D.flat || {};
  $('#frontIcon').innerHTML = T.icon('bell', 36, '#C9CED6', 1.6);
  $('#frontName').textContent = F.title || 'Front door';
  $('#frontOpen').innerHTML = T.icon('door', 28, '#F2F4F7', 1.8) + '<span>Buzz front door open</span>';
  $('#flatIcon').innerHTML = T.icon('lock', 36, '#C9CED6', 1.6);
  $('#flatName').textContent = L.title || 'Flat door';
  function buzz() { return call('script', 'turn_on', {}, { entity_id: F.openScript }, 'Front door buzzed open'); }
  T.onAction($('#frontOpen'), buzz);
  T.onAction($('#flatLock'), function () {
    var s = st(L.lock);
    if (s && s.state === 'locked') call('lock', 'unlock', {}, { entity_id: L.lock }, 'Unlocking flat door…');
    else call('lock', 'lock', {}, { entity_id: L.lock }, 'Locking flat door…');
  });
  T.onAction($('#flatUnlatch'), function () { call('script', 'turn_on', {}, { entity_id: L.unlatchScript }, 'Flat door unlatched'); });
  function renderDoors() {
    var ring = st(F.lastRing);
    var when = ring && ring.state && ring.state !== 'unknown' ? T.formatWhen(ring.state) : '';
    $('#frontSub').textContent = (F.subtitle || 'Intercom') + (when ? ' · last ring ' + when : '');
    var l = st(L.lock), ls = l ? l.state : 'unknown';
    var label = { locked: 'Locked', unlocked: 'Unlocked', open: 'Open', opening: 'Opening…', unlocking: 'Unlocking…', locking: 'Locking…', jammed: 'Jammed!' }[ls] || 'Unknown';
    $('#flatSub').textContent = label + (L.subtitle ? ' · ' + L.subtitle : '');
    $('#flatSub').classList.toggle('warn', ls !== 'locked');
    $('#flatIcon').innerHTML = T.icon(ls === 'locked' ? 'lock' : 'unlock', 36, ls === 'locked' ? '#C9CED6' : '#FFB547', 1.6);
    $('#flatIcon').classList.toggle('alert', ls !== 'locked');
    $('#flatLock').innerHTML = T.icon(ls === 'locked' ? 'unlock' : 'lock', 26, '#F2F4F7', 1.8) + '<span>' + (ls === 'locked' ? 'Unlock' : 'Lock') + '</span>';
    $('#bellFlat').innerHTML = T.icon(ls === 'locked' ? 'unlock' : 'lock', 30, '#F2F4F7', 1.8) +
      '<span>' + (ls === 'locked' ? 'Unlock flat door' : 'Lock flat door') + '</span>';
  }

  /* ---------- header ---------- */
  function renderHeader() {
    var parts = [], t = st(P.temperature), h = st(P.humidity);
    if (t && !isNaN(parseFloat(t.state))) parts.push(parseFloat(t.state).toFixed(1) + '°');
    if (h && !isNaN(parseFloat(h.state))) parts.push(Math.round(parseFloat(h.state)) + '% humidity');
    var lights = (P.roomLights || []).filter(function (id) { var s = st(id); return s && s.state === 'on'; }).length;
    parts.push(lights === 0 ? 'lights off' : lights === 1 ? '1 light on' : lights + ' lights on');
    $('#roomSub').textContent = parts.join(' · ');
  }

  /* ---------- doorbell view ---------- */
  $('#bellIcon').innerHTML = T.icon('bell', 80, '#FFB547', 1.5);
  $('#bellBuzz').innerHTML = T.icon('door', 30, '#FFB547', 1.8) + '<span>Buzz front door open</span>';
  T.onAction($('#bellBuzz'), function () { buzz().then(function () { setTimeout(leaveDoorView, 1500); }); });
  T.onAction($('#bellFlat'), function () {
    var s = st(L.lock);
    if (s && s.state === 'locked') call('lock', 'unlock', {}, { entity_id: L.lock }, 'Unlocking flat door…');
    else call('lock', 'lock', {}, { entity_id: L.lock }, 'Locking flat door…');
  });
  T.onAction($('#bellBack'), leaveDoorView);
  function showDoorView(params) {
    returnTo = params && params.returnTo && params.returnTo !== P_APP_ID ? params.returnTo : null;
    var d = new Date();
    $('#bellSub').textContent = (F.subtitle || 'Intercom') + ' · ' + T.formatTime(d) + (returnTo ? ' · your show is paused' : '');
    $('#doorView').classList.remove('hidden');
    nav.setScope($('#doorView'), $('#bellBuzz'));
    clearTimeout(doorTimer);
    doorTimer = setTimeout(leaveDoorView, (P.doorViewSeconds || 120) * 1000);
  }
  function leaveDoorView() {
    clearTimeout(doorTimer);
    if ($('#doorView').classList.contains('hidden')) return;
    $('#doorView').classList.add('hidden');
    nav.scope = null;
    if (returnTo) { var r = returnTo; returnTo = null; T.launch(r); }
    else nav.focus(T.$$('.f', $('#tiles'))[0]);
  }

  /* ---------- wiring ---------- */
  function renderAll() {
    TILES.forEach(renderTile);
    renderHeader(); renderMedia(); renderDoors();
  }
  function renderConn(ok) {
    var c = $('#conn');
    c.className = 'conn' + (ok ? '' : ' off');
    c.innerHTML = '<i></i><span></span>';
    c.querySelector('span').textContent = ok ? 'Home Assistant connected' : 'Connecting to Home Assistant…';
  }
  nav.handlers.back = function () {
    if (!$('#doorView').classList.contains('hidden')) { leaveDoorView(); return; }
    if (returnTo) { var r = returnTo; returnTo = null; T.launch(r); return; }
    T.exitApp();
  };
  if (ha) {
    var ids = [P.temperature, P.humidity, L.lock, F.lastRing].concat(P.roomLights || [], M.players || [], M.volume ? [M.volume] : []);
    TILES.forEach(function (t) { ids.push(t.entity); });
    ha.watch(ids);
    ha.onChange(renderAll);
    ha.onStatus(renderConn);
    renderConn(false);
    ha.connect();
  } else renderConn(false);
  renderAll();
  nav.focus(T.$$('.f', $('#tiles'))[0] || nav.items()[0]);

  function handleParams(p) {
    if (p && p.view === 'door') showDoorView(p);
    else if (!$('#doorView').classList.contains('hidden')) leaveDoorView();
  }
  handleParams(T.launchParams());
  T.onRelaunch(handleParams);
})();
