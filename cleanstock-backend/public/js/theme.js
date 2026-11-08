// Se carga en el <head>: aplica el tema guardado (o el del sistema) antes de pintar la página
(function () {
  var saved = null;
  try { saved = localStorage.getItem('cleanstock_theme'); } catch (e) { /* sin almacenamiento */ }
  var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  document.documentElement.setAttribute('data-theme', saved || (prefersLight ? 'light' : 'dark'));
})();
