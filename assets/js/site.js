/* Somnia landing page. No dependencies, no cookies, no storage, no tracking.
   Only network call: the public GitHub releases list, to show the current downloads. */
(function () {
  'use strict';
  var REPO = 'philppplik/somnia';
  var API = 'https://api.github.com/repos/' + REPO + '/releases?per_page=12';
  var RELEASES = 'https://github.com/' + REPO + '/releases';

  /* header: mobile menu + border on scroll */
  var btn = document.getElementById('menu-btn');
  var nav = document.getElementById('site-nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
    });
  }
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* downloads */
  var root = document.getElementById('dl-root');
  if (!root) return;
  var statusEl = document.getElementById('dl-status');

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function mb(bytes) { return (bytes / 1048576).toFixed(bytes > 104857600 ? 0 : 1) + ' MB'; }

  function classify(a) {
    var n = a.name;
    var arm = /arm64|aarch64/i.test(n);
    if (/\.(sig|txt|json)$/i.test(n) || /\.app\.tar\.gz$/i.test(n) || /^somnia-cli-/i.test(n)) return null;
    if (/\.exe$/i.test(n)) return { os: 'win', arch: arm ? 'arm64' : 'x64', kind: 'Setup (.exe)', rank: 0 };
    if (/\.msi$/i.test(n)) return { os: 'win', arch: arm ? 'arm64' : 'x64', kind: 'MSI', rank: 1 };
    if (/\.dmg$/i.test(n)) return { os: 'mac', arch: 'arm64', kind: 'DMG', rank: 0 };
    if (/\.AppImage$/i.test(n)) return { os: 'linux', arch: arm ? 'arm64' : 'x64', kind: 'AppImage', rank: 0 };
    if (/\.deb$/i.test(n)) return { os: 'linux', arch: arm ? 'arm64' : 'x64', kind: '.deb', rank: 1 };
    return null;
  }
  var OS_LABEL = { win: 'Windows', mac: 'macOS', linux: 'Linux' };
  var ARCH_LABEL = { x64: 'x64', arm64: 'ARM64' };
  var OS_NOTE = {
    win: 'Unsigned installer: SmartScreen may warn on first run.',
    mac: 'Apple Silicon only. Ad-hoc signed, not notarized: right-click, Open on first launch.',
    linux: 'AppImage or .deb. ARM64 is .deb only.'
  };

  function detectOS() {
    var ua = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    var u = navigator.userAgent || '';
    if (/android|iphone|ipad|ipod/i.test(u)) return 'mobile';
    if (/win/i.test(ua) || /windows/i.test(u)) return 'win';
    if (/mac/i.test(ua) || /macintosh/i.test(u)) return 'mac';
    if (/linux|x11|cros/i.test(ua + u)) return 'linux';
    return 'other';
  }

  function build(rel) {
    var items = [];
    rel.assets.forEach(function (a) {
      var c = classify(a);
      if (c) items.push({ a: a, c: c });
    });
    return items;
  }

  function pickPrimary(items, os) {
    var best = null;
    items.forEach(function (i) {
      if (i.c.os !== os) return;
      if (i.c.arch !== 'x64' && os !== 'mac') return;
      if (!best || i.c.rank < best.c.rank) best = i;
    });
    return best;
  }

  function render(newest, stable) {
    var os = detectOS();
    var items = build(newest);
    root.textContent = '';

    var main = el('div', 'dl-main');
    var card = el('div', 'card dl-primary');
    var isPre = newest.prerelease;
    var h = el('h3', null, 'Somnia ' + newest.tag_name.replace(/^v/, ''));
    card.appendChild(h);
    var when = new Date(newest.published_at);
    var meta = el('p', 'dl-meta', 'Published ' + (isNaN(when) ? '' : when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })));
    meta.appendChild(el('span', 'tag', isPre ? 'Beta (pre-release)' : 'Release'));
    card.appendChild(meta);

    var prim = (os === 'win' || os === 'mac' || os === 'linux') ? pickPrimary(items, os) : null;
    if (prim) {
      var a = el('a', 'btn');
      a.href = prim.a.browser_download_url;
      a.appendChild(document.createTextNode('Download for ' + OS_LABEL[os] + (os === 'mac' ? ' (Apple Silicon)' : ' (' + ARCH_LABEL[prim.c.arch] + ')')));
      card.appendChild(a);
      card.appendChild(el('p', 'dl-sub', prim.a.name + ' \u00b7 ' + mb(prim.a.size) + '. ' + OS_NOTE[os]));
    } else if (os === 'mobile') {
      card.appendChild(el('p', 'status', 'Somnia is a desktop app for Windows, macOS and Linux. Open this page on your computer to download it.'));
    } else {
      card.appendChild(el('p', 'status', 'Pick your platform in the list.'));
    }
    var notes = el('a', null, 'Release notes and checksums on GitHub');
    notes.href = newest.html_url;
    var np = el('p', 'dl-sub'); np.appendChild(notes);
    card.appendChild(np);
    if (stable && stable.id !== newest.id) {
      var sp = el('p', 'dl-sub');
      sp.appendChild(document.createTextNode('Prefer a non-beta build? The last full release is '));
      var sl = el('a', null, stable.tag_name); sl.href = stable.html_url;
      sp.appendChild(sl); sp.appendChild(document.createTextNode('.'));
      card.appendChild(sp);
    }

    var sums = newest.assets.filter(function (a) { return /^SHA256SUMS/i.test(a.name); })[0];
    var withDigest = items.filter(function (i) { return i.a.digest; });
    if (sums || withDigest.length) {
      var d = el('details', 'sha');
      d.appendChild(el('summary', null, 'Verify your download (SHA-256)'));
      if (sums) {
        var p = el('p', null, 'Checksums for every file: ');
        var sa = el('a', null, sums.name); sa.href = sums.browser_download_url; p.appendChild(sa);
        d.appendChild(p);
      }
      withDigest.forEach(function (i) {
        var line = el('div');
        line.appendChild(el('span', null, i.a.name));
        line.appendChild(el('code', null, String(i.a.digest).replace(/^sha256:/, '')));
        d.appendChild(line);
      });
      card.appendChild(d);
    }
    main.appendChild(card);

    var all = el('div', 'card plat');
    ['win', 'mac', 'linux'].forEach(function (k) {
      var rows = items.filter(function (i) { return i.c.os === k; });
      if (!rows.length) return;
      var row = el('div', 'plat-row');
      var t = el('h4', null, OS_LABEL[k]);
      t.appendChild(el('span', 'sm', OS_NOTE[k]));
      row.appendChild(t);
      var files = el('div', 'files');
      rows.sort(function (x, y) { return (x.c.arch === 'x64' ? 0 : 1) - (y.c.arch === 'x64' ? 0 : 1) || x.c.rank - y.c.rank; });
      rows.forEach(function (i) {
        var l = el('a');
        l.href = i.a.browser_download_url;
        l.appendChild(document.createTextNode((k === 'mac' ? '' : ARCH_LABEL[i.c.arch] + ' ') + i.c.kind));
        l.appendChild(el('span', null, mb(i.a.size)));
        l.appendChild(el('span', 'sr-only', ' for ' + OS_LABEL[k] + (k === 'mac' ? ' Apple Silicon' : '')));
        files.appendChild(l);
      });
      row.appendChild(files);
      all.appendChild(row);
    });
    main.appendChild(all);
    root.appendChild(main);
  }

  function fail() {
    root.textContent = '';
    var p = el('p', 'status');
    p.appendChild(document.createTextNode('Could not load the current downloads from GitHub right now. '));
    var a = el('a', null, 'Open the releases page'); a.href = RELEASES;
    p.appendChild(a); p.appendChild(document.createTextNode(' to get the installers.'));
    root.appendChild(p);
  }

  var ctrl = ('AbortController' in window) ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
  fetch(API, { headers: { Accept: 'application/vnd.github+json' }, signal: ctrl ? ctrl.signal : undefined })
    .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(function (list) {
      clearTimeout(timer);
      var usable = list.filter(function (r) { return !r.draft && build(r).length > 0; });
      if (!usable.length) return fail();
      usable.sort(function (a, b) { return new Date(b.published_at) - new Date(a.published_at); });
      var stable = usable.filter(function (r) { return !r.prerelease; })[0] || null;
      render(usable[0], stable);
    })
    .catch(function () { clearTimeout(timer); fail(); });
})();
