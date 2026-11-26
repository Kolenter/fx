// Playback speed for the Filmix TV player, injected by TizenBrew.
// Adds a speed button next to translation and quality that opens a list in Filmix's own panel.
// CH+/CH- change speed right away; the yellow key opens the list.
// If Filmix changes its player markup, a standalone menu in the same style takes over.
// ES5 only, no CSS variables: the Tizen 3.0 web engine is old.
// TizenBrew injects this into every new page context, often before <body> exists.
(function () {
  if (window.__filmixSpeedLoaded) return;
  window.__filmixSpeedLoaded = true;

  var SPEEDS = [2, 1.75, 1.5, 1];
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

// Sound at higher speed. The TV mutes its own player at any speed but 1x, so this part downloads
// the movie's audio-only pieces itself, speeds them up without changing pitch (WSOLA) and plays
// them through Web Audio in step with the video. It only watches video.playbackRate.
// Audio-only pieces are cut every ~10 s, not where the video pieces are, so each piece is placed
// by the timestamp (PTS) inside it, counted from the first piece's timestamp.
(function () {
  if (window.__filmixSpeedAudioLoaded) return;
  window.__filmixSpeedAudioLoaded = true;

  var AudioContextClass = window.AudioContext || window.webkitAudioContext;
  var IS_TIZEN = /Tizen/.test(navigator.userAgent);
  var SEGMENT = /seg-\d+-v1-a1\.ts/;
  var PIECE_SECONDS = 10;
  var AHEAD_SECONDS = 25;
  var START_LEAD = 0.05;
  var MAX_DRIFT = 0.15;
  var FRAME = 1920;
  var HOP = 960;
  var SEARCH = 480;
  var SLICE_MS = 25;

  var context = null;
  var hookedPlaylistUrl = null;
  var playlistUrl = null;
  var playlistLoading = null;
  var pieceTemplate = null;
  var basePts = null;
  var pieces = {};
  var missing = {};
  var busy = false;
  var scheduled = [];
  var activeRate = 1;
  var generation = 0;
  var failed = false;
  var driftStrikes = 0;
  var videoGain = null;
  var notice = null;

  // With hls.js the <video> holds a blob, so the playlist URL is taken from its request.
  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (/\.m3u8/.test(String(url))) hookedPlaylistUrl = String(url);
    return originalOpen.apply(this, arguments);
  };

  // Shows a short message at the top right, for problems only.
  function showNotice(text) {
    if (!notice) {
      notice = document.createElement('div');
      notice.style.cssText = 'position:fixed;top:48px;right:60px;z-index:2147483647;padding:12px 26px;border-radius:12px;' +
        'background:#252422;border:2px solid #eb5e28;color:#fffcf2;font:600 26px "Euclid Circular A",sans-serif';
      document.body.appendChild(notice);
    }
    notice.textContent = text;
    notice.style.display = 'block';
    setTimeout(function () { notice.style.display = 'none'; }, 6000);
  }

  // Returns the movie <video>, or null outside the player.
  function findVideo() {
    return document.getElementById('video-player');
  }

  // Returns the URL of the playlist that lists the movie's pieces.
  function findPlaylistUrl(video) {
    var source = video.currentSrc || video.src || '';
    if (/\.m3u8/.test(source)) return source;
    if (hookedPlaylistUrl || !window.performance || !performance.getEntriesByType) return hookedPlaylistUrl;
    var entries = performance.getEntriesByType('resource');
    for (var i = entries.length - 1; i >= 0; i--) {
      if (/\.m3u8/.test(entries[i].name)) return entries[i].name;
    }
    return null;
  }

  // Downloads a URL; type is 'text' or 'arraybuffer'. Calls done(result) or done(null, status).
  function download(url, type, done) {
    var xhr = new XMLHttpRequest();
    originalOpen.call(xhr, 'GET', url);
    xhr.responseType = type;
    xhr.onload = function () { done(xhr.status === 200 ? xhr.response : null, xhr.status); };
    xhr.onerror = function () { done(null, 0); };
    xhr.send();
  }

  // URL of audio-only piece number k (1-based), built from any video piece URL.
  function pieceUrl(k) {
    return pieceTemplate.replace(SEGMENT, 'seg-' + k + '-a1.ts');
  }

  // Reads the playlist for a piece URL to build on, then the first audio piece for the base timestamp.
  function loadSource(url) {
    playlistLoading = url;
    download(url, 'text', function (text) {
      var match = text && text.match(/^[^#\s].*seg-\d+-v1-a1\.ts.*$/m);
      if (!match) {
        playlistLoading = null;
        return giveUp('незнакомый формат потока');
      }
      var line = match[0].trim();
      var template = /^https?:/.test(line) ? line : url.slice(0, url.lastIndexOf('/') + 1) + line;
      download(template.replace(SEGMENT, 'seg-1-a1.ts'), 'arraybuffer', function (data) {
        playlistLoading = null;
        var first = data && extractAudio(new Uint8Array(data));
        if (!first || first.pts === null) return;
        reset();
        pieceTemplate = template;
        basePts = first.pts;
        playlistUrl = url;
      });
    });
  }

  // Reads a 33-bit MPEG timestamp (in seconds) from 5 bytes of a PES header.
  function readPts(bytes, at) {
    return ((bytes[at] & 0x0e) * 536870912 + (bytes[at + 1] << 22) + ((bytes[at + 2] >> 1) << 15) +
      (bytes[at + 3] << 7) + (bytes[at + 4] >> 1)) / 90000;
  }

  // Takes the AAC (ADTS) audio and its first timestamp out of an MPEG-TS piece.
  function extractAudio(bytes) {
    var audioPid = -1;
    var pts = null;
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
        if (pid === audioPid) {
          if (pts === null && (bytes[offset + 7] & 0x80)) pts = readPts(bytes, offset + 9);
          offset += 9 + bytes[offset + 8];
        }
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
    return { adts: adts, pts: pts };
  }

  // Mixes decoded audio (mono, stereo or 5.1) down to stereo, with silence padding at the end.
  function mixToStereo(buffer, padding) {
    var length = buffer.length;
    var channels = [];
    for (var c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
    var left = new Float32Array(length + padding);
    var right = new Float32Array(length + padding);
    var hasSurround = channels.length >= 6;
    for (var i = 0; i < length; i++) {
      if (hasSurround) {
        var center = channels[2][i] * 0.707;
        left[i] = (channels[0][i] + center + channels[4][i] * 0.5) * 0.55;
        right[i] = (channels[1][i] + center + channels[5][i] * 0.5) * 0.55;
      } else {
        left[i] = channels[0][i];
        right[i] = (channels[1] || channels[0])[i];
      }
    }
    return { left: left, right: right, length: length };
  }

  // Speeds audio up by rate without changing pitch (WSOLA), in small slices so the remote stays responsive.
  function stretch(buffer, rate, isCurrent, done) {
    var input = mixToStereo(buffer, FRAME + 2 * SEARCH);
    var out = context.createBuffer(2, Math.ceil(input.length / rate) + FRAME, buffer.sampleRate);
    var outLeft = out.getChannelData(0);
    var outRight = out.getChannelData(1);
    var outPosition = 0;
    var previousEnd = 0;

    function slice() {
      if (!isCurrent()) return;
      var until = Date.now() + SLICE_MS;
      while (Date.now() < until) {
        var target = Math.round(outPosition * rate);
        if (target >= input.length) return done(out);
        var best = target;
        if (outPosition > 0) {
          var bestScore = -Infinity;
          for (var shift = -SEARCH; shift <= SEARCH; shift += 8) {
            var candidate = target + shift;
            if (candidate < 0) continue;
            var score = 0;
            for (var j = 0; j < HOP; j += 4) {
              score += (input.left[candidate + j] + input.right[candidate + j]) *
                (input.left[previousEnd + j] + input.right[previousEnd + j]);
            }
            if (score > bestScore) {
              bestScore = score;
              best = candidate;
            }
          }
        }
        for (j = 0; j < FRAME; j++) {
          var weight = 0.5 - 0.5 * Math.cos(2 * Math.PI * j / FRAME);
          outLeft[outPosition + j] += input.left[best + j] * weight;
          outRight[outPosition + j] += input.right[best + j] * weight;
        }
        previousEnd = best + HOP;
        outPosition += HOP;
      }
      setTimeout(slice, 0);
    }
    slice();
  }

  // Downloads, decodes and speeds up audio piece k; its movie time comes from its timestamp.
  function prepare(k) {
    var myGeneration = generation;
    var rate = activeRate;
    var isCurrent = function () { return myGeneration === generation; };
    busy = true;
    download(pieceUrl(k), 'arraybuffer', function (data, status) {
      if (!isCurrent()) return;
      busy = false;
      if (!data) {
        if (status === 404) missing[k] = true;
        return;
      }
      var audio = extractAudio(new Uint8Array(data));
      if (!audio.adts.length || audio.pts === null) return giveUp('звук в потоке не найден');
      busy = true;
      context.decodeAudioData(audio.adts.buffer, function (decoded) {
        if (!isCurrent()) return;
        stretch(decoded, rate, isCurrent, function (buffer) {
          pieces[k] = { start: audio.pts - basePts, duration: decoded.duration, buffer: buffer };
          busy = false;
        });
      }, function () {
        if (isCurrent()) giveUp('телевизор не смог декодировать звук');
      });
    });
  }

  // Number of the audio piece that should contain movie time t, corrected by pieces already known.
  function pieceIndexAt(t) {
    var k = Math.floor(t / PIECE_SECONDS) + 1;
    var piece = pieces[k];
    if (piece && t < piece.start && k > 1) return k - 1;
    if (piece && t >= piece.start + piece.duration) return k + 1;
    return k;
  }

  // Stops trying for this page and says why; the speed itself keeps working.
  function giveUp(reason) {
    failed = true;
    deactivate();
    showNotice('Звук на скорости недоступен: ' + reason);
  }

  // Starts every prepared piece from the current one onward that is not playing yet.
  function schedule(video) {
    var now = context.currentTime;
    var t = video.currentTime;
    for (var k = pieceIndexAt(t); pieces[k] && pieces[k].start < t + AHEAD_SECONDS; k++) {
      if (isScheduled(k)) continue;
      var piece = pieces[k];
      var when = Math.max(now + START_LEAD, now + (piece.start - t) / activeRate);
      var movieOffset = t + (when - now) * activeRate - piece.start;
      if (movieOffset >= piece.duration) continue;
      var node = context.createBufferSource();
      node.buffer = piece.buffer;
      node.connect(context.destination);
      node.start(when, movieOffset / activeRate, (piece.duration - movieOffset) / activeRate);
      scheduled.push({ index: k, node: node, when: when, movieStart: piece.start + movieOffset,
        end: when + (piece.duration - movieOffset) / activeRate });
    }
  }

  // True if a piece is already queued to play.
  function isScheduled(k) {
    for (var i = 0; i < scheduled.length; i++) {
      if (scheduled[i].index === k) return true;
    }
    return false;
  }

  // Stops all queued sound.
  function stopAll() {
    for (var i = 0; i < scheduled.length; i++) {
      try { scheduled[i].node.stop(0); } catch (error) { /* already stopped */ }
    }
    scheduled = [];
  }

  // How far the sound playing now is from the picture, in movie seconds (null if silent).
  function currentDrift(video) {
    var now = context.currentTime;
    for (var i = 0; i < scheduled.length; i++) {
      var item = scheduled[i];
      if (item.when <= now && item.end > now) return item.movieStart + (now - item.when) * activeRate - video.currentTime;
    }
    return null;
  }

  // Re-syncs when the sound has drifted away from the picture (seek, stall, clock drift).
  function checkDrift(video) {
    var now = context.currentTime;
    scheduled = scheduled.filter(function (item) { return item.end > now; });
    var drift = currentDrift(video);
    if (drift === null) return;
    driftStrikes = Math.abs(drift) > MAX_DRIFT ? driftStrikes + 1 : 0;
    if (driftStrikes >= 2 || Math.abs(drift) > 1) {
      driftStrikes = 0;
      stopAll();
    }
  }

  // Silences the video's own sound in browsers that do not mute it themselves (Filmix keeps unmuting it).
  function silenceVideo(video, silent) {
    if (IS_TIZEN || !context) return;
    if (!videoGain) {
      if (!silent || context.state !== 'running' || !/^blob:/.test(video.currentSrc)) return;
      var source = context.createMediaElementSource(video);
      videoGain = context.createGain();
      source.connect(videoGain);
      videoGain.connect(context.destination);
    }
    videoGain.gain.value = silent ? 0 : 1;
  }

  // Forgets all prepared sound, e.g. after a speed or source change.
  function reset() {
    generation++;
    stopAll();
    pieces = {};
    missing = {};
    busy = false;
  }

  // Turns our sound off and gives the video its own sound back.
  function deactivate() {
    if (activeRate !== 1) {
      reset();
      activeRate = 1;
    }
    var video = findVideo();
    if (video) silenceVideo(video, false);
  }

  // Prepares the nearest piece ahead that has no sound yet, one at a time.
  function prepareAhead(video) {
    if (busy) return;
    var t = video.currentTime;
    for (var k = pieceIndexAt(t); (k - 1) * PIECE_SECONDS < t + AHEAD_SECONDS; k++) {
      if (missing[k]) return;
      if (!pieces[k]) return prepare(k);
    }
  }

  // Drops sound of pieces already played, to keep memory low.
  function dropOld(video) {
    for (var key in pieces) {
      if (pieces[key].start + pieces[key].duration < video.currentTime - 5) delete pieces[key];
    }
  }

  // Four times a second: follow the video's speed, state and position.
  function tick() {
    var video = findVideo();
    if (!video || !AudioContextClass || failed || video.playbackRate === 1 || video.playbackRate <= 0) {
      deactivate();
      return;
    }
    if (!context) context = new AudioContextClass();
    if (context.state === 'suspended' && context.resume) context.resume();
    if (video.playbackRate !== activeRate) {
      reset();
      activeRate = video.playbackRate;
    }
    silenceVideo(video, true);
    var url = findPlaylistUrl(video);
    if (!url) return;
    if (url !== playlistUrl) {
      if (playlistLoading !== url) loadSource(url);
      return;
    }
    prepareAhead(video);
    if (video.paused || video.seeking || video.readyState < 3) {
      stopAll();
      return;
    }
    checkDrift(video);
    schedule(video);
    dropOld(video);
  }

  // For checking from the developer console: what the sound part is doing right now.
  window.__filmixSpeedAudioState = function () {
    var video = findVideo();
    return { rate: activeRate, failed: failed, basePts: basePts, prepared: Object.keys(pieces),
      scheduled: scheduled.map(function (item) { return item.index; }), busy: busy,
      drift: context && video ? currentDrift(video) : null };
  };

  setInterval(tick, 250);
})();
