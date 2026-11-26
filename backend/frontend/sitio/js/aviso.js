// Aviso de fallas generales: lo publica el admin desde Ajustes del sistema
(function () {
  fetch('/api/publico/aviso', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.aviso || !d.aviso.mensaje) return;
      var caja = document.createElement('div');
      caja.className = 'aviso aviso--' + (d.aviso.tipo === 'info' ? 'info' : 'falla');
      caja.setAttribute('role', 'status');
      var texto = document.createElement('p');
      texto.className = 'wrap aviso__texto';
      texto.textContent = d.aviso.mensaje;
      caja.appendChild(texto);
      var skip = document.querySelector('.skip');
      document.body.insertBefore(caja, skip ? skip.nextSibling : document.body.firstChild);
    })
    .catch(function () { /* sin aviso: el sitio sigue normal */ });
})();
