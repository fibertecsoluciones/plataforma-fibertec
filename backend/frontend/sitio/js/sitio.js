// Menú móvil
(function () {
  var btn = document.querySelector('.nav-toggle'), nav = document.getElementById('menu');
  if (!btn || !nav) return;
  function alternar(abrir) {
    nav.classList.toggle('is-open', abrir);
    btn.setAttribute('aria-expanded', String(abrir));
    btn.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú');
  }
  btn.addEventListener('click', function () { alternar(!nav.classList.contains('is-open')); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) { alternar(false); btn.focus(); }
  });
})();
