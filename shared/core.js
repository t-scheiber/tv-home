/* TV Home – shared runtime for the launcher and the smart home panel.
 * Targets webOS 6 (Chromium 79): no optional chaining, no ??, no flex gap.
 * Everything hangs off window.TVH so both apps can load it as a classic script. */
(function () {
  'use strict';
  var TVH = window.TVH = window.TVH || {};
  var CFG = window.TVH_CONFIG || {};
  TVH.cfg = CFG;

  /* ---------- small helpers ---------- */
  TVH.$ = function (sel, root) { return (root || document).querySelector(sel); };
  TVH.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  TVH.el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  };
  TVH.pad = function (n) { return n < 10 ? '0' + n : String(n); };
  TVH.get = function (obj, path, fallback) {
    var parts = path.split('.'), cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return fallback;
      cur = cur[parts[i]];
    }
    return (cur === null || cur === undefined) ? fallback : cur;
  };
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  TVH.formatDate = function (d) { return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; };
  TVH.formatTime = function (d) { return TVH.pad(d.getHours()) + ':' + TVH.pad(d.getMinutes()); };
  TVH.formatWhen = function (iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    if (d.toDateString() === now.toDateString()) return TVH.formatTime(d);
    var y = new Date(now.getTime() - 86400000);
    if (d.toDateString() === y.toDateString()) return 'yesterday ' + TVH.formatTime(d);
    return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3);
  };

  var toastTimer = null;
  TVH.toast = function (text, kind) {
    var t = TVH.$('#toast');
    if (!t) { t = TVH.el('div', 'toast'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = text;
    t.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2600);
  };

  /* ---------- Luna (webOS system services) ---------- */
  TVH.isWebOS = function () { return typeof window.PalmServiceBridge === 'function'; };
  TVH.luna = function (uri, params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!TVH.isWebOS()) { reject(new Error('not on webOS')); return; }
      var bridge = new window.PalmServiceBridge(), done = false;
      var timer = setTimeout(function () { finish(reject, new Error('timeout ' + uri)); }, timeoutMs || 4000);
      function finish(fn, value) {
        if (done) return;
        done = true; clearTimeout(timer);
        try { if (bridge.cancel) bridge.cancel(); } catch (e) { /* ignore */ }
        fn(value);
      }
      bridge.onservicecallback = function (msg) {
        var data;
        try { data = JSON.parse(msg); } catch (e) { finish(reject, e); return; }
        if (data.returnValue === false) finish(reject, new Error(data.errorText || 'failed'));
        else finish(resolve, data);
      };
      try { bridge.call(uri, JSON.stringify(params || {})); } catch (e) { finish(reject, e); }
    });
  };
  TVH.launch = function (id, params) {
    if (!TVH.isWebOS()) { console.log('launch', id, params); return Promise.resolve(); }
    return TVH.luna('luna://com.webos.applicationManager/launch', { id: id, params: params || {} });
  };
  TVH.appExists = function (id) {
    if (!TVH.isWebOS()) return Promise.resolve(true);
    return TVH.luna('luna://com.webos.applicationManager/getAppLoadStatus', { appId: id })
      .then(function (r) { return r.exist === true; })
      .catch(function () { return false; });
  };
  TVH.listInputs = function () {
    var liveTv = { appId: 'com.webos.app.livetv', label: 'Live TV', port: 0, connected: true };
    if (!TVH.isWebOS()) {
      return Promise.resolve([liveTv,
        { appId: 'com.webos.app.hdmi1', label: 'HDMI 1', port: 1, connected: true },
        { appId: 'com.webos.app.hdmi2', label: 'HDMI 2', port: 2, connected: true }]);
    }
    return TVH.luna('luna://com.webos.service.eim/getAllInputStatus', {})
      .then(function (r) {
        var list = (r.devices || []).filter(function (d) { return d.appId && d.label; })
          .sort(function (a, b) { return a.port - b.port; })
          .map(function (d) { return { appId: d.appId, label: d.label, port: d.port, connected: d.connected !== false }; });
        return [liveTv].concat(list);
      })
      .catch(function () { return [liveTv]; });
  };
  /* Launch parameters: first launch via PalmSystem, relaunches via the webOSRelaunch event. */
  TVH.launchParams = function () {
    try {
      var raw = window.PalmSystem && window.PalmSystem.launchParams;
      return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    } catch (e) { return {}; }
  };
  TVH.onRelaunch = function (fn) {
    document.addEventListener('webOSRelaunch', function (ev) {
      var p = (ev && ev.detail) || {};
      fn(p);
    });
  };
  TVH.exitApp = function () {
    try { if (window.PalmSystem && window.PalmSystem.platformBack) { window.PalmSystem.platformBack(); return; } } catch (e) { /* ignore */ }
    try { window.close(); } catch (e2) { /* ignore */ }
  };

  /* ---------- Remote control and focus (spatial navigation) ---------- */
  var KEY = TVH.KEY = { left: 37, up: 38, right: 39, down: 40, ok: 13, back: 461, esc: 27, red: 403, green: 404, yellow: 405, blue: 406 };
  var nav = TVH.nav = { scope: null, current: null, cursor: false, handlers: {} };

  function visible(el) {
    if (!el || el.disabled) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }
  nav.items = function () {
    var root = nav.scope || document;
    return TVH.$$('.f', root).filter(visible);
  };
  nav.focus = function (el, quiet) {
    if (!el) return;
    if (nav.current && nav.current !== el) nav.current.classList.remove('focused');
    nav.current = el;
    el.classList.add('focused');
    if (el.scrollIntoView && el.dataset.scroll === 'x') {
      var p = el.parentNode, r = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
      if (r.right > pr.right) p.scrollLeft += r.right - pr.right + 60;
      if (r.left < pr.left) p.scrollLeft -= pr.left - r.left + 60;
    }
    if (!quiet && nav.handlers.focus) nav.handlers.focus(el);
  };
  nav.setScope = function (root, preferred) {
    nav.scope = root;
    var items = nav.items();
    nav.focus(preferred && items.indexOf(preferred) !== -1 ? preferred : items[0]);
  };
  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  nav.move = function (dir) {
    var items = nav.items();
    if (!nav.current || items.indexOf(nav.current) === -1) { nav.focus(items[0]); return; }
    var from = nav.current.getBoundingClientRect(), c = center(from), best = null, bestScore = Infinity;
    items.forEach(function (el) {
      if (el === nav.current) return;
      var r = el.getBoundingClientRect(), p = center(r), dx = p.x - c.x, dy = p.y - c.y, main, cross;
      if (dir === 'left') { if (r.right > from.left + 4) return; main = -dx; cross = Math.abs(dy); }
      else if (dir === 'right') { if (r.left < from.right - 4) return; main = dx; cross = Math.abs(dy); }
      else if (dir === 'up') { if (r.bottom > from.top + 4) return; main = -dy; cross = Math.abs(dx); }
      else { if (r.top < from.bottom - 4) return; main = dy; cross = Math.abs(dx); }
      var score = main + cross * ((dir === 'up' || dir === 'down') ? 0.6 : 2.2);
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) nav.focus(best);
  };

  /* Hold-to-confirm: elements with data-hold="ms" fire only after being held. */
  var hold = { el: null, start: 0, raf: 0, fired: false };
  function holdStart(el) {
    if (hold.el) return;
    hold.el = el; hold.start = Date.now(); hold.fired = false;
    el.classList.add('holding');
    var ms = parseInt(el.dataset.hold, 10) || 1500;
    (function tick() {
      if (hold.el !== el) return;
      var p = Math.min(1, (Date.now() - hold.start) / ms);
      el.style.setProperty('--hold', p.toFixed(3));
      if (p >= 1) { hold.fired = true; holdEnd(); activate(el); return; }
      hold.raf = requestAnimationFrame(tick);
    })();
  }
  function holdEnd() {
    var el = hold.el;
    if (!el) return;
    cancelAnimationFrame(hold.raf);
    el.classList.remove('holding');
    el.style.setProperty('--hold', '0');
    if (!hold.fired && el.dataset.holdHint) TVH.toast(el.dataset.holdHint);
    hold.el = null;
  }
  function activate(el) {
    if (!el) return;
    var fn = el._action;
    if (typeof fn === 'function') fn(el);
  }
  TVH.onAction = function (el, fn) { el._action = fn; return el; };

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (nav.handlers.key && nav.handlers.key(e) === true) { e.preventDefault(); return; }
    if (k === KEY.left) nav.move('left');
    else if (k === KEY.right) nav.move('right');
    else if (k === KEY.up) nav.move('up');
    else if (k === KEY.down) nav.move('down');
    else if (k === KEY.ok) {
      if (nav.cursor) return; /* the pointer click handles it */
      var el = nav.current;
      if (!el) return;
      if (el.dataset.hold) { if (!e.repeat) holdStart(el); }
      else if (!e.repeat) activate(el);
    } else if (k === KEY.back || k === KEY.esc) {
      if (nav.handlers.back) nav.handlers.back();
    } else return;
    e.preventDefault();
  });
  document.addEventListener('keyup', function (e) {
    if (e.keyCode === KEY.ok) holdEnd();
  });
  /* Magic Remote pointer: hovering focuses, clicking activates. */
  document.addEventListener('cursorStateChange', function (e) {
    nav.cursor = !!(e.detail && e.detail.visibility);
  });
  document.addEventListener('mouseover', function (e) {
    var el = e.target.closest ? e.target.closest('.f') : null;
    if (el && nav.items().indexOf(el) !== -1) { nav.cursor = true; nav.focus(el); }
  });
  document.addEventListener('mousedown', function (e) {
    var el = e.target.closest ? e.target.closest('.f') : null;
    if (el && el.dataset.hold) holdStart(el);
  });
  document.addEventListener('mouseup', function () { holdEnd(); });
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('.f') : null;
    if (!el || el.dataset.hold) return;
    if (nav.items().indexOf(el) === -1) return;
    activate(el);
  });

  /* ---------- Home Assistant (WebSocket API, live states) ---------- */
  function HA(url, token) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
    this.states = {};
    this.listeners = [];
    this.statusListeners = [];
    this.pending = {};
    this.nextId = 1;
    this.entityIds = [];
    this.connected = false;
    this.backoff = 2000;
  }
  HA.prototype.onChange = function (fn) { this.listeners.push(fn); };
  HA.prototype.onStatus = function (fn) { this.statusListeners.push(fn); };
  HA.prototype._status = function (ok) {
    this.connected = ok;
    this.statusListeners.forEach(function (fn) { fn(ok); });
  };
  HA.prototype.watch = function (ids) {
    var self = this;
    ids.forEach(function (id) { if (id && self.entityIds.indexOf(id) === -1) self.entityIds.push(id); });
  };
  HA.prototype.connect = function () {
    var self = this;
    if (!self.token) { self._status(false); return; }
    var ws;
    try { ws = new WebSocket(self.url.replace(/^http/, 'ws') + '/api/websocket'); }
    catch (e) { self._retry(); return; }
    self.ws = ws;
    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: self.token }));
      else if (m.type === 'auth_ok') {
        self.backoff = 2000;
        self._status(true);
        self._subscribe();
      } else if (m.type === 'auth_invalid') { self._status(false); ws.close(); }
      else if (m.type === 'event' && m.id === self.subId) self._applyEntities(m.event);
      else if (m.type === 'result' && self.pending[m.id]) {
        var p = self.pending[m.id]; delete self.pending[m.id];
        if (m.success) p.resolve(m.result); else p.reject(new Error((m.error && m.error.message) || 'failed'));
      }
    };
    ws.onclose = function () {
      self._status(false);
      Object.keys(self.pending).forEach(function (id) { self.pending[id].reject(new Error('disconnected')); });
      self.pending = {};
      self._retry();
    };
    ws.onerror = function () { try { ws.close(); } catch (e) { /* ignore */ } };
  };
  HA.prototype._retry = function () {
    var self = this;
    clearTimeout(self.retryTimer);
    self.retryTimer = setTimeout(function () { self.connect(); }, self.backoff);
    self.backoff = Math.min(self.backoff * 2, 30000);
  };
  HA.prototype._send = function (msg) {
    var self = this;
    return new Promise(function (resolve, reject) {
      if (!self.ws || self.ws.readyState !== 1) { reject(new Error('Home Assistant not connected')); return; }
      msg.id = self.nextId++;
      self.pending[msg.id] = { resolve: resolve, reject: reject };
      self.ws.send(JSON.stringify(msg));
    });
  };
  HA.prototype._subscribe = function () {
    var self = this, msg = { type: 'subscribe_entities', entity_ids: self.entityIds };
    msg.id = self.nextId++;
    self.subId = msg.id;
    self.ws.send(JSON.stringify(msg));
  };
  /* subscribe_entities sends compressed states: a = added, c = changed, r = removed. */
  HA.prototype._applyEntities = function (ev) {
    var self = this, touched = {};
    if (ev.a) Object.keys(ev.a).forEach(function (id) {
      var s = ev.a[id];
      self.states[id] = { entity_id: id, state: s.s, attributes: s.a || {}, last_changed: s.lc ? new Date(s.lc * 1000).toISOString() : null };
      touched[id] = 1;
    });
    if (ev.c) Object.keys(ev.c).forEach(function (id) {
      var cur = self.states[id]; if (!cur) return;
      var plus = ev.c[id]['+'], minus = ev.c[id]['-'];
      if (plus) {
        if (plus.s !== undefined) cur.state = plus.s;
        if (plus.a) Object.keys(plus.a).forEach(function (k) { cur.attributes[k] = plus.a[k]; });
        if (plus.lc) cur.last_changed = new Date(plus.lc * 1000).toISOString();
      }
      if (minus && minus.a) minus.a.forEach(function (k) { delete cur.attributes[k]; });
      touched[id] = 1;
    });
    if (ev.r) ev.r.forEach(function (id) { delete self.states[id]; touched[id] = 1; });
    var ids = Object.keys(touched);
    self.listeners.forEach(function (fn) { fn(ids); });
  };
  HA.prototype.state = function (id) { return this.states[id] || null; };
  HA.prototype.call = function (domain, service, data, target) {
    var msg = { type: 'call_service', domain: domain, service: service, service_data: data || {} };
    if (target) msg.target = target;
    return this._send(msg);
  };
  HA.prototype.picture = function (path) {
    if (!path) return '';
    return /^https?:/.test(path) ? path : this.url + path;
  };
  TVH.HA = HA;
  TVH.ha = (CFG.ha && CFG.ha.token) ? new HA(CFG.ha.url, CFG.ha.token) : null;

  /* ---------- Jellyfin (Continue watching / Next up) ---------- */
  function Jellyfin(conf) { this.url = (conf.url || '').replace(/\/$/, ''); this.key = conf.apiKey; this.userId = conf.userId; }
  Jellyfin.prototype._get = function (path) {
    var self = this;
    return fetch(self.url + path, {
      headers: { 'Authorization': 'MediaBrowser Client="TV Home", Device="LG TV", DeviceId="tvhome-lg", Version="1.0.0", Token="' + self.key + '"' }
    }).then(function (r) { if (!r.ok) throw new Error('Jellyfin ' + r.status); return r.json(); });
  };
  Jellyfin.prototype.image = function (id, type, width) {
    return this.url + '/Items/' + id + '/Images/' + type + '?maxWidth=' + (width || 640) + '&quality=85';
  };
  Jellyfin.prototype.continueWatching = function (limit) {
    var self = this, fields = '&fields=Overview&enableImageTypes=Primary,Backdrop,Thumb&imageTypeLimit=1';
    var resume = self._get('/UserItems/Resume?userId=' + self.userId + '&limit=12&mediaTypes=Video' + fields)
      .catch(function () { return self._get('/Users/' + self.userId + '/Items/Resume?limit=12&mediaTypes=Video' + fields); })
      .then(function (r) { return r.Items || []; })
      .catch(function () { return []; });
    var nextUp = self._get('/Shows/NextUp?userId=' + self.userId + '&limit=10&enableResumable=false' + fields)
      .then(function (r) { return r.Items || []; })
      .catch(function () { return []; });
    return Promise.all([resume, nextUp]).then(function (lists) {
      var out = [], seenSeries = {};
      lists[0].forEach(function (it) { out.push(self._card(it, false)); if (it.SeriesId) seenSeries[it.SeriesId] = 1; });
      lists[1].forEach(function (it) { if (!it.SeriesId || !seenSeries[it.SeriesId]) { out.push(self._card(it, true)); seenSeries[it.SeriesId] = 1; } });
      return out.slice(0, limit || 8);
    });
  };
  Jellyfin.prototype._card = function (it, nextUp) {
    var self = this, isEp = it.Type === 'Episode';
    var thumb, backdrop;
    if (isEp) {
      if (it.ParentThumbItemId) thumb = self.image(it.ParentThumbItemId, 'Thumb', 720);
      else if (it.ParentBackdropItemId) thumb = self.image(it.ParentBackdropItemId, 'Backdrop', 720);
      else if (it.ImageTags && it.ImageTags.Primary) thumb = self.image(it.Id, 'Primary', 720);
    } else {
      if (it.ImageTags && it.ImageTags.Thumb) thumb = self.image(it.Id, 'Thumb', 720);
      else if (it.BackdropImageTags && it.BackdropImageTags.length) thumb = self.image(it.Id, 'Backdrop', 720);
      else if (it.ImageTags && it.ImageTags.Primary) thumb = self.image(it.Id, 'Primary', 720);
    }
    if (it.BackdropImageTags && it.BackdropImageTags.length) backdrop = self.image(it.Id, 'Backdrop', 1920);
    else if (it.ParentBackdropItemId) backdrop = self.image(it.ParentBackdropItemId, 'Backdrop', 1920);
    var ud = it.UserData || {}, pct = ud.PlayedPercentage || 0, meta = [];
    if (isEp) meta.push('S' + (it.ParentIndexNumber || '?') + ' · E' + (it.IndexNumber || '?'));
    else if (it.ProductionYear) meta.push(String(it.ProductionYear));
    if (!nextUp && it.RunTimeTicks && ud.PlaybackPositionTicks) {
      var left = Math.max(1, Math.round((it.RunTimeTicks - ud.PlaybackPositionTicks) / 6e8));
      meta.push(left >= 60 ? Math.floor(left / 60) + ' h ' + (left % 60) + ' min left' : left + ' min left');
    }
    return {
      id: it.Id,
      title: isEp ? (it.SeriesName || it.Name) : it.Name,
      subtitle: isEp ? it.Name : '',
      meta: meta.join(' · '),
      nextUp: nextUp,
      progress: nextUp ? 0 : pct,
      thumb: thumb || '',
      backdrop: backdrop || thumb || ''
    };
  };
  TVH.Jellyfin = Jellyfin;
  TVH.jellyfin = (CFG.jellyfin && CFG.jellyfin.apiKey && CFG.jellyfin.userId) ? new Jellyfin(CFG.jellyfin) : null;
})();
