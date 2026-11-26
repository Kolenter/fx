// Playback speed menu for the Filmix TV player, injected by TizenBrew.
// CH+/CH- or the yellow key opens it; up/down or CH+/CH- change speed; OK/Back close it.
// ES5 only, no CSS variables: the Tizen 3.0 web engine is old.
// TizenBrew injects this into every new page context, often before <body> exists.
(function () {
  if (window.__filmixSpeedLoaded) return;
  window.__filmixSpeedLoaded = true;

  var SPEEDS = [2.5, 2.25, 2, 1.75, 1.5, 1];
  var STORAGE_KEY = 'filmixSpeed';
  var AUTO_CLOSE_MS = 4000;
  var KEY = { up: 38, down: 40, enter: 13, back: 10009, chUp: 427, chDown: 428, yellow: 405 };

  var speed = loadSpeed();
  var panel = null;
  var items = [];
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

  // Formats a speed for display: 1 becomes "Обычная", others like "1.5×".
  function label(value) {
    return value === 1 ? 'Обычная' : value + '\u00d7';
  }

  // Tells background and screensaver trailers apart from the movie player.
  function isTrailer(video) {
    for (var node = video, depth = 0; node && depth < 4; node = node.parentNode, depth++) {
      if (/trailer|screensaver/i.test((node.id || '') + ' ' + (node.className || ''))) return true;
    }
    return false;
  }

  // Returns the movie player's <video>, or null when no movie is open.
  function findMainVideo() {
    var videos = document.getElementsByTagName('video');
    for (var i = 0; i < videos.length; i++) {
      if (!isTrailer(videos[i])) return videos[i];
    }
    return null;
  }

  // Adds the menu styles once, using the Filmix palette and font.
  function addStyles() {
    var style = document.createElement('style');
    style.textContent =
      '.fxs-panel{position:fixed;top:50%;right:60px;z-index:2147483647;width:360px;margin-top:-260px;' +
      'padding:24px 0;border-radius:18px;background:rgba(37,36,34,0.94);border:2px solid #403d39;' +
      'font-family:"Euclid Circular A",sans-serif;color:#fffcf2;opacity:0;transform:translateX(40px);' +
      'transition:opacity .2s,transform .2s;pointer-events:none}' +
      '.fxs-panel--open{opacity:1;transform:translateX(0)}' +
      '.fxs-title{padding:0 32px 14px;font-size:30px;font-weight:600;color:#ccc5b9}' +
      '.fxs-item{margin:4px 16px;padding:12px 18px;border-radius:12px;font-size:34px;transition:background .15s}' +
      '.fxs-item--active{background:#eb5e28;font-weight:600}' +
      '.fxs-hint{padding:14px 32px 0;font-size:20px;color:#ccc5b9}' +
      '.fxs-toast{position:fixed;top:48px;right:60px;z-index:2147483647;padding:12px 26px;border-radius:12px;' +
      'background:rgba(37,36,34,0.94);border:2px solid #eb5e28;color:#fffcf2;font:600 30px "Euclid Circular A",sans-serif;' +
      'opacity:0;transition:opacity .2s;pointer-events:none}' +
      '.fxs-toast--show{opacity:1}';
    document.head.appendChild(style);
  }

  // Builds the speed menu on first use.
  function buildPanel() {
    addStyles();
    panel = document.createElement('div');
    panel.className = 'fxs-panel';
    panel.innerHTML = '<div class="fxs-title">Скорость</div>';
    for (var i = 0; i < SPEEDS.length; i++) {
      var item = document.createElement('div');
      item.className = 'fxs-item';
      item.textContent = label(SPEEDS[i]);
      panel.appendChild(item);
      items.push(item);
    }
    var hint = document.createElement('div');
    hint.className = 'fxs-hint';
    hint.textContent = '\u25b2\u25bc выбрать \u00b7 OK закрыть';
    panel.appendChild(hint);
    toast = document.createElement('div');
    toast.className = 'fxs-toast';
    document.body.appendChild(panel);
    document.body.appendChild(toast);
  }

  function isOpen() {
    return panel !== null && panel.className.indexOf('fxs-panel--open') >= 0;
  }

  // Highlights the current speed in the menu.
  function renderPanel() {
    for (var i = 0; i < items.length; i++) {
      items[i].className = SPEEDS[i] === speed ? 'fxs-item fxs-item--active' : 'fxs-item';
    }
  }

  // Opens the menu (or keeps it open) and restarts the auto-close timer.
  function openPanel() {
    if (!panel) buildPanel();
    renderPanel();
    panel.className = 'fxs-panel fxs-panel--open';
    clearTimeout(closeTimer);
    closeTimer = setTimeout(closePanel, AUTO_CLOSE_MS);
  }

  function closePanel() {
    clearTimeout(closeTimer);
    if (panel) panel.className = 'fxs-panel';
  }

  // Shows a short "Скорость 2×" note, used when a new video starts at a saved speed.
  function showToast() {
    if (!panel) buildPanel();
    toast.textContent = 'Скорость ' + label(speed);
    toast.className = 'fxs-toast fxs-toast--show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.className = 'fxs-toast'; }, 2500);
  }

  // Moves one step faster (+1) or slower (-1), saves it and applies it right away.
  function stepSpeed(direction) {
    var index = SPEEDS.indexOf(speed) - direction;
    speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, index))];
    localStorage.setItem(STORAGE_KEY, String(speed));
    applySpeed();
    openPanel();
  }

  // Keeps the chosen speed on the movie player; it may reset it on a new episode or a seek.
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
      if (speed !== 1 && !isOpen()) showToast();
    }
  }

  // Returns what a key should do, or null to leave it to Filmix.
  function actionFor(keyCode) {
    if (isOpen()) {
      if (keyCode === KEY.up || keyCode === KEY.chUp) return function () { stepSpeed(1); };
      if (keyCode === KEY.down || keyCode === KEY.chDown) return function () { stepSpeed(-1); };
      if (keyCode === KEY.enter || keyCode === KEY.back || keyCode === KEY.yellow) return closePanel;
      return null;
    }
    if (!findMainVideo()) return null;
    if (keyCode === KEY.chUp) return function () { stepSpeed(1); };
    if (keyCode === KEY.chDown) return function () { stepSpeed(-1); };
    if (keyCode === KEY.yellow) return openPanel;
    return null;
  }

  window.addEventListener('keydown', function (event) {
    var action = actionFor(event.keyCode);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    swallowKeyUp[event.keyCode] = true;
    action();
  }, true);

  // Filmix also reacts to some key releases (Back, OK), so hide the matching keyup too.
  window.addEventListener('keyup', function (event) {
    if (!swallowKeyUp[event.keyCode]) return;
    delete swallowKeyUp[event.keyCode];
    event.preventDefault();
    event.stopPropagation();
  }, true);

  setInterval(applySpeed, 500);
})();
