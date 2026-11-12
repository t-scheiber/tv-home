/* Stroke icons (24x24 grid), drawn inline so they take any colour. */
(function () {
  'use strict';
  var P = {
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    youtube: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9v6l5-3z"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    tv: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M8 2l4 4 4-4M8 22h8"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    inputs: '<path d="M5 8h14l-2 8H7z"/><path d="M9 11v2M12 11v2M15 11v2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><path d="M12 19.5h.01"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
    blind: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 8h16M4 12h16"/>',
    window: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18M4 12h16"/>',
    thermo: '<path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0z"/>',
    fan: '<circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-7 4-7 2 0 3 2 1 4l-3 3M14 12c4 0 7 1 7 4 0 2-2 3-4 1l-3-3M12 14c0 4-1 7-4 7-2 0-3-2-1-4l3-3M10 12c-4 0-7-1-7-4 0-2 2-3 4-1l3 3"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M3 21h18M14 12h.01"/>',
    movie: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 7l3-4M9 7l3-4M15 7l3-4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    sofa: '<path d="M4 18v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6"/><path d="M2 18h20M6 10V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/>',
    power: '<path d="M12 3v9"/><path d="M6.3 7.5a8 8 0 1 0 11.4 0"/>',
    prev: '<path d="M6 5v14M19 5L9 12l10 7z"/>',
    next: '<path d="M18 5v14M5 5l10 7-10 7z"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    pause: '<path d="M7 5h3v14H7zM14 5h3v14h-3z"/>',
    volDown: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M16 12h5"/>',
    volUp: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M16 12h5M18.5 9.5v5"/>',
    back: '<path d="M10 6l-6 6 6 6M4 12h16"/>',
    star: '<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/>',
    camera: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>'
  };
  window.TVH = window.TVH || {};
  window.TVH.icon = function (name, size, color, width) {
    var s = size || 32;
    return '<svg class="icon" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="' + (color || 'currentColor') +
      '" stroke-width="' + (width || 1.7) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  };
})();
