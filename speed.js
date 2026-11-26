// Playback speed for the Filmix TV player, injected by TizenBrew.
// Adds a speed button next to translation and quality that opens a list in Filmix's own panel.
// CH+/CH- change speed right away; the yellow key opens the list.
// If Filmix changes its player markup, a standalone menu in the same style takes over.
// ES5 only, no CSS variables: the Tizen 3.0 web engine is old.
// TizenBrew injects this into every new page context, often before <body> exists.
(function () {
  if (window.__filmixSpeedLoaded) return;
  window.__filmixSpeedLoaded = true;

  var SPEEDS = [2.5, 2.25, 2, 1.75, 1.5, 1];
  var STORAGE_KEY = 'filmixSpeed';
  var AUTO_CLOSE_MS = 4000;
  var PANEL_NAME = 'speed-panel';
  var BUTTON_ID = 'player-bottom-speed';
  var KEY = { left: 37, up: 38, right: 39, down: 40, enter: 13, back: 10009, chUp: 427, chDown: 428, yellow: 405 };
  var CHECK_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EB5E28" stroke-width="2.5" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  var speed = loadSpeed();
  var focusIndex = 0;
  var ownPanel = null;
  var toast = null;
  var closeTimer = null;
  var toastTimer = null;
  var lastVideoSrc = null;
  var swallowKeyUp = {};

  // Returns the saved speed, or 1x if nothing valid is saved.
  function loadSpeed() {
    var saved = parseFloat(localStorage.getItem(STORAGE_KEY));
    return SPEEDS.indexOf(saved) >= 0 ? saved : 1;
  }

  // Short label for the button ("2×"), long one for the list ("Обычная" for 1x).
  function shortLabel(value) {
    return value + '\u00d7';
  }

  function longLabel(value) {
    return value === 1 ? 'Обычная' : shortLabel(value);
  }

  // Returns the movie player's <video>, skipping background and screensaver trailers.
  function findMainVideo() {
    var player = document.getElementById('video-player');
    if (player) return player;
    var videos = document.getElementsByTagName('video');
    for (var i = 0; i < videos.length; i++) {
      if (!/trailer|screensaver/i.test(videos[i].id + ' ' + videos[i].className)) return videos[i];
    }
    return null;
  }

  // Returns Filmix's own player panel parts, or null if its markup has changed.
  function nativeParts() {
    var panel = document.getElementById('player-panel');
    var inner = document.getElementById('player-panel-inner');
    var buttons = document.querySelector('.player-bottom__buttons--right');
    if (!panel || !inner || !buttons || !window.SpatialNavigation) return null;
    return { panel: panel, inner: inner, buttons: buttons, container: document.getElementById('m-video-container') };
  }

  // Adds the speed button after the quality button, styled like the "Рус" button.
  function ensureSpeedButton(parts) {
    var button = document.getElementById(BUTTON_ID);
    if (!button) {
      var wrapper = document.createElement('div');
      wrapper.className = 'player-bottom__button';
      wrapper.innerHTML = '<button title="Скорость" id="' + BUTTON_ID + '" class="button focusable icon-settings ' +
        'icon-settings--translations button-empty-primary button-large button-icon-only"><span class="button-icon ' +
        'button-icon-left"><span class="f-icon"><span class="f-icon__text"></span></span></span></button>';
      var quality = document.getElementById('player-bottom-quality');
      var anchor = quality && quality.parentNode.parentNode === parts.buttons ? quality.parentNode.nextSibling : null;
      parts.buttons.insertBefore(wrapper, anchor);
      button = wrapper.firstChild;
      button.addEventListener('click', function () { openMenu(false); });
    }
    var text = button.querySelector('.f-icon__text');
    if (text.textContent !== shortLabel(speed)) text.textContent = shortLabel(speed);
  }

  // Adds the styles for the standalone menu and the speed note, once.
  function addOwnStyles() {
    var style = document.createElement('style');
    style.textContent =
      '.fxs-panel{position:fixed;top:50%;right:60px;z-index:2147483647;width:360px;margin-top:-260px;padding:24px 0;' +
      'border-radius:24px;background:#252422;font-family:"Euclid Circular A",sans-serif;color:#ccc5b9;display:none}' +
      '.fxs-panel--open{display:block}' +
      '.fxs-item{margin:6px 20px;padding:12px 20px;border:2px solid transparent;border-radius:12px;font-size:30px;font-weight:600}' +
      '.fxs-item--active{color:#fffcf2}' +
      '.fxs-item--focused{background:#fffcf2;color:#252422;border-color:#eb5e28}' +
      '.fxs-item svg{float:right;margin-top:6px}' +
      '.fxs-toast{position:fixed;top:48px;right:60px;z-index:2147483647;padding:12px 26px;border-radius:12px;' +
      'background:#252422;border:2px solid #eb5e28;color:#fffcf2;font:600 30px "Euclid Circular A",sans-serif;' +
      'opacity:0;transition:opacity .2s;pointer-events:none}' +
      '.fxs-toast--show{opacity:1}';
    document.head.appendChild(style);
    ownPanel = document.createElement('div');
    ownPanel.className = 'fxs-panel';
    toast = document.createElement('div');
    toast.className = 'fxs-toast';
    document.body.appendChild(ownPanel);
    document.body.appendChild(toast);
  }

  // True while our list is on screen, in Filmix's panel or in the standalone one.
  function isMenuOpen() {
    var parts = nativeParts();
    if (parts && parts.panel.getAttribute('data-open') === 'true' &&
        parts.panel.getAttribute('data-panel-name') === PANEL_NAME) return true;
    return ownPanel !== null && ownPanel.className.indexOf('fxs-panel--open') >= 0;
  }

  // Draws the list: the current speed gets a check mark, the focused one is highlighted.
  function renderMenu() {
    var parts = nativeParts();
    var html = '';
    for (var i = 0; i < SPEEDS.length; i++) {
      var active = SPEEDS[i] === speed;
      var icon = active ? '<span class="button-icon button-icon-right"><div class="player-panel-item-custom-icon">' +
        CHECK_ICON + '</div></span>' : '';
      if (parts) {
        html += '<button data-custom-key="' + SPEEDS[i] + '" class="button focusable button-player-panel-item-lang ' +
          'button-player-panel-item button-large' + (active ? ' button-active' : '') + '"><span class="button-label">' +
          longLabel(SPEEDS[i]) + '</span>' + icon + '</button>';
      } else {
        html += '<div class="fxs-item' + (active ? ' fxs-item--active' : '') + (i === focusIndex ? ' fxs-item--focused' : '') +
          '">' + longLabel(SPEEDS[i]) + (active ? CHECK_ICON : '') + '</div>';
      }
    }
    if (parts) {
      parts.inner.innerHTML = html;
      focusItem(parts);
    } else {
      ownPanel.innerHTML = html;
    }
  }

  // Moves the remote focus to the highlighted item in Filmix's panel.
  function focusItem(parts) {
    var item = parts.inner.children[focusIndex];
    if (item && document.activeElement !== item) window.SpatialNavigation.focus(item);
  }

  // Opens the list; autoClose hides it again after a quick CH+/CH- change.
  function openMenu(autoClose) {
    var parts = nativeParts();
    if (!ownPanel) addOwnStyles();
    focusIndex = SPEEDS.indexOf(speed);
    if (parts) {
      parts.panel.setAttribute('data-open', 'true');
      parts.panel.setAttribute('data-panel-name', PANEL_NAME);
      if (parts.container) parts.container.className += /focus-within/.test(parts.container.className) ? '' : ' focus-within';
    } else {
      ownPanel.className = 'fxs-panel fxs-panel--open';
    }
    renderMenu();
    clearTimeout(closeTimer);
    if (autoClose) closeTimer = setTimeout(closeMenu, AUTO_CLOSE_MS);
  }

  // Closes the list and puts the remote focus back on the speed button.
  function closeMenu() {
    clearTimeout(closeTimer);
    var parts = nativeParts();
    if (parts && parts.panel.getAttribute('data-panel-name') === PANEL_NAME) {
      parts.inner.innerHTML = '';
      parts.panel.setAttribute('data-open', 'false');
      parts.panel.setAttribute('data-panel-name', '');
      if (document.getElementById(BUTTON_ID)) window.SpatialNavigation.focus('#' + BUTTON_ID);
    }
    if (ownPanel) ownPanel.className = 'fxs-panel';
  }

  // Saves and applies a new speed.
  function setSpeed(value) {
    speed = value;
    localStorage.setItem(STORAGE_KEY, String(speed));
    applySpeed();
  }

  // Shows a short "Скорость 2×" note, used when a new video starts at a saved speed.
  function showToast() {
    if (!ownPanel) addOwnStyles();
    toast.textContent = 'Скорость ' + shortLabel(speed);
    toast.className = 'fxs-toast fxs-toast--show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.className = 'fxs-toast'; }, 2500);
  }

  // Keeps the speed on the player (it resets it on a new episode or a seek) and the button label up to date.
  function applySpeed() {
    var video = findMainVideo();
    if (!video) {
      lastVideoSrc = null;
      return;
    }
    if (video.playbackRate !== speed) video.playbackRate = speed;
    var src = video.currentSrc || video.src;
    if (src && src !== lastVideoSrc) {
      lastVideoSrc = src;
      if (speed !== 1 && !isMenuOpen()) showToast();
    }
  }

  // Every half second: keep the speed, keep the button, and keep an open list visible and focused.
  function tick() {
    applySpeed();
    var parts = nativeParts();
    if (!parts || !findMainVideo()) return;
    ensureSpeedButton(parts);
    if (isMenuOpen() && parts.inner.children.length) {
      if (parts.container && !/focus-within/.test(parts.container.className)) parts.container.className += ' focus-within';
      focusItem(parts);
    }
  }

  // Steps focus through the open list (+1 down, -1 up) and redraws it.
  function moveFocus(step) {
    focusIndex = Math.max(0, Math.min(SPEEDS.length - 1, focusIndex + step));
    renderMenu();
  }

  // Changes speed one step right away: +1 faster, -1 slower.
  function stepSpeed(direction) {
    var index = Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) - direction));
    setSpeed(SPEEDS[index]);
  }

  // Returns what a key should do, or null to leave it to Filmix.
  function actionFor(keyCode) {
    if (isMenuOpen()) {
      if (keyCode === KEY.up) return function () { moveFocus(-1); };
      if (keyCode === KEY.down) return function () { moveFocus(1); };
      if (keyCode === KEY.chUp) return function () { stepSpeed(1); openMenu(true); };
      if (keyCode === KEY.chDown) return function () { stepSpeed(-1); openMenu(true); };
      if (keyCode === KEY.enter) return function () { setSpeed(SPEEDS[focusIndex]); closeMenu(); };
      if (keyCode === KEY.back || keyCode === KEY.yellow) return closeMenu;
      if (keyCode === KEY.left || keyCode === KEY.right) return function () {};
      return null;
    }
    if (!findMainVideo()) return null;
    if (keyCode === KEY.chUp) return function () { stepSpeed(1); openMenu(true); };
    if (keyCode === KEY.chDown) return function () { stepSpeed(-1); openMenu(true); };
    if (keyCode === KEY.yellow) return function () { openMenu(false); };
    return null;
  }

  // Our keys must not reach Filmix: it does not know about our list, so Back there would close the movie.
  window.addEventListener('keydown', function (event) {
    var action = actionFor(event.keyCode);
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    swallowKeyUp[event.keyCode] = true;
    action();
  }, true);

  window.addEventListener('keyup', function (event) {
    if (!swallowKeyUp[event.keyCode]) return;
    delete swallowKeyUp[event.keyCode];
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  setInterval(tick, 500);
})();

// Test build only: the blue key checks whether this TV can play sped-up sound through Web Audio.
// It downloads the audio of the current 10 s piece, speeds it up without pitch change, plays 5 s
// and shows on screen how long each stage took.
(function () {
  if (window.__filmixProbeLoaded) return;
  window.__filmixProbeLoaded = true;

  var BLUE = 406;
  var SEGMENT = /seg-\d+-v1-a1\.ts/;
  var lastSegmentUrl = null;
  var report = null;
  var lines = [];

  // Remembers the last movie piece hls.js asked for.
  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (SEGMENT.test(String(url))) lastSegmentUrl = String(url);
    return originalOpen.apply(this, arguments);
  };

  // Returns the last movie piece URL: from the hook, else from the browser's load list.
  function findSegmentUrl() {
    if (lastSegmentUrl || !window.performance || !performance.getEntriesByType) return lastSegmentUrl;
    var entries = performance.getEntriesByType('resource');
    for (var i = entries.length - 1; i >= 0; i--) {
      if (SEGMENT.test(entries[i].name)) return entries[i].name;
    }
    return null;
  }

  // Adds a line to the on-screen report.
  function log(text) {
    lines.push(text);
    if (!report) {
      report = document.createElement('div');
      report.id = 'fxs-probe';
      report.style.cssText = 'position:fixed;left:60px;top:60px;z-index:2147483647;max-width:1100px;padding:24px 32px;' +
        'border-radius:20px;background:rgba(22,22,22,0.95);border:2px solid #eb5e28;color:#fffcf2;' +
        'font:500 26px/1.45 "Euclid Circular A",sans-serif;white-space:pre-wrap';
      document.body.appendChild(report);
    }
    report.textContent = lines.join('\n');
  }

  // Milliseconds since start, as text.
  function since(start) {
    return (Date.now() - start) + ' мс';
  }

  // Downloads a URL as bytes; calls done(bytes) or done(null, error).
  function download(url, done) {
    var xhr = new XMLHttpRequest();
    originalOpen.call(xhr, 'GET', url);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function () {
      if (xhr.status === 200) done(new Uint8Array(xhr.response));
      else done(null, 'HTTP ' + xhr.status);
    };
    xhr.onerror = function () { done(null, 'сеть'); };
    xhr.send();
  }

  // Takes the AAC (ADTS) audio out of an MPEG-TS piece.
  function extractAdts(bytes) {
    var audioPid = -1;
    var parts = [];
    var total = 0;
    for (var i = 0; i + 188 <= bytes.length; i += 188) {
      if (bytes[i] !== 0x47) continue;
      var pid = ((bytes[i + 1] & 31) << 8) | bytes[i + 2];
      var start = (bytes[i + 1] & 64) !== 0;
      var adaptation = (bytes[i + 3] >> 4) & 3;
      var offset = i + 4;
      if (adaptation & 2) offset += 1 + bytes[offset];
      if (!(adaptation & 1) || offset >= i + 188) continue;
      if (start && bytes[offset] === 0 && bytes[offset + 1] === 0 && bytes[offset + 2] === 1) {
        if (audioPid < 0 && bytes[offset + 3] >= 0xc0 && bytes[offset + 3] <= 0xdf) audioPid = pid;
        if (pid === audioPid) offset += 9 + bytes[offset + 8];
      }
      if (pid !== audioPid) continue;
      parts.push(bytes.subarray(offset, i + 188));
      total += i + 188 - offset;
    }
    var adts = new Uint8Array(total);
    var position = 0;
    for (var p = 0; p < parts.length; p++) {
      adts.set(parts[p], position);
      position += parts[p].length;
    }
    return adts;
  }

  // Speeds up decoded audio by rate without changing pitch (WSOLA), mixed down to stereo.
  function stretch(context, buffer, rate) {
    var length = buffer.length;
    var channels = [];
    for (var c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
    var left = new Float32Array(length);
    var right = new Float32Array(length);
    for (var i = 0; i < length; i++) {
      var center = channels.length > 2 ? channels[2][i] * 0.707 : 0;
      left[i] = (channels[0][i] + center + (channels.length > 4 ? channels[4][i] * 0.5 : 0)) * 0.6;
      right[i] = ((channels[1] || channels[0])[i] + center + (channels.length > 5 ? channels[5][i] * 0.5 : 0)) * 0.6;
    }
    var frame = 1920;
    var hop = frame / 2;
    var search = 480;
    var out = context.createBuffer(2, Math.floor(length / rate) + frame, buffer.sampleRate);
    var outLeft = out.getChannelData(0);
    var outRight = out.getChannelData(1);
    var outPosition = 0;
    var previousEnd = 0;
    while (true) {
      var target = Math.round(outPosition * rate);
      if (target + frame + search >= length) break;
      var best = target;
      var bestScore = -Infinity;
      if (outPosition > 0) {
        for (var shift = -search; shift <= search; shift += 8) {
          var candidate = target + shift;
          if (candidate < 0) continue;
          var score = 0;
          for (var j = 0; j < hop; j += 4) {
            score += (left[candidate + j] + right[candidate + j]) * (left[previousEnd + j] + right[previousEnd + j]);
          }
          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        }
      }
      for (j = 0; j < frame; j++) {
        var weight = 0.5 - 0.5 * Math.cos(2 * Math.PI * j / frame);
        outLeft[outPosition + j] += left[best + j] * weight;
        outRight[outPosition + j] += right[best + j] * weight;
      }
      previousEnd = best + hop;
      outPosition += hop;
    }
    return out;
  }

  // Runs the whole check and reports each stage on screen.
  function runProbe() {
    lines = [];
    var video = document.getElementById('video-player') || document.getElementsByTagName('video')[0];
    var rate = video && video.playbackRate > 1 ? video.playbackRate : 2;
    var match = navigator.userAgent.match(/Chrome\/[\d.]+/);
    log('ПРОВЕРКА ЗВУКА (синяя кнопка ещё раз - закрыть)');
    log('Браузер: ' + (match ? match[0] : navigator.userAgent.slice(0, 60)) + ', ядер: ' + (navigator.hardwareConcurrency || '?'));
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return log('ОШИБКА: нет Web Audio');
    var segmentUrl = findSegmentUrl();
    if (!segmentUrl) return log('ОШИБКА: фильм ещё не загрузился, подождите 10 сек и нажмите снова');
    var context = window.__filmixProbeContext || new AudioContextClass();
    window.__filmixProbeContext = context;
    log('Web Audio: есть, состояние ' + (context.state || '?') + ', ' + context.sampleRate + ' Гц');
    var started = Date.now();
    download(segmentUrl.replace('-v1-a1.ts', '-a1.ts'), function (bytes, error) {
      if (!bytes) return log('ОШИБКА скачивания звука: ' + error);
      log('1. Скачан звук: ' + Math.round(bytes.length / 1024) + ' КБ за ' + since(started));
      var adts = extractAdts(bytes);
      if (!adts.length) return log('ОШИБКА: звук в куске не найден');
      var decodeStart = Date.now();
      context.decodeAudioData(adts.buffer, function (buffer) {
        log('2. Декодирован: ' + buffer.duration.toFixed(1) + ' сек, ' + buffer.numberOfChannels + ' кан., ' +
          buffer.sampleRate + ' Гц за ' + since(decodeStart));
        var stretchStart = Date.now();
        var fast = stretch(context, buffer, rate);
        log('3. Ускорен до ' + rate + 'x за ' + since(stretchStart) + ' (на 10 сек фильма)');
        if (context.resume) context.resume();
        var source = context.createBufferSource();
        source.buffer = fast;
        source.connect(context.destination);
        source.onended = function () { log('5. Готово. Сфотографируйте этот экран.'); };
        source.start(0, 0, Math.min(5, fast.duration));
        log('4. ИГРАЕТ 5 сек ускоренного звука. Слышно?');
      }, function () {
        log('ОШИБКА: телевизор не смог декодировать звук');
      });
    });
  }

  window.addEventListener('keydown', function (event) {
    if (event.keyCode !== BLUE) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (report && report.parentNode) {
      report.parentNode.removeChild(report);
      report = null;
      return;
    }
    try {
      runProbe();
    } catch (error) {
      log('ОШИБКА: ' + error.message);
    }
  }, true);
})();
