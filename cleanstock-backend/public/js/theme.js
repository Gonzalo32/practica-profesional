(function () {
  var saved = null;
  try { saved = localStorage.getItem('cleanstock_theme'); } catch (e) {}
  var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  document.documentElement.setAttribute('data-theme', saved || (prefersLight ? 'light' : 'dark'));
})();
