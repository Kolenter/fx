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
