// Runs before first paint so a saved theme never flashes the wrong colours.
// Loaded as a classic blocking script on purpose; keep it tiny.
(function () {
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.dataset.theme = saved;
    }
  } catch (_) {
    // Storage is blocked (private mode, strict settings): follow the system.
  }
})();
