// Datos de cobertura y buscador "¿Ya llegamos a tu colonia?"
window.FT_COLONIAS = [{"id": "popotla", "nombre": "Popotla", "estado": "activa", "coords": [18.0190556, -94.3173333], "alias": ["popotla"]}, {"id": "san-pedro", "nombre": "San Pedro Mezcalapa", "estado": "activa", "coords": [17.893544, -94.309767], "alias": ["san pedro", "mezcalapa", "san pedro mezcalapa"]}, {"id": "km40", "nombre": "El KM40", "estado": "activa", "coords": [17.937933, -94.237106], "alias": ["km40", "km 40", "kilometro 40", "el km40"]}, {"id": "pajaral", "nombre": "Pajaral", "estado": "activa", "coords": [17.889722, -94.220825], "alias": ["pajaral"]}, {"id": "filisola", "nombre": "Filisola", "estado": "proxima", "coords": [17.854458, -94.356069], "alias": ["filisola"]}, {"id": "pueblo-viejo", "nombre": "Pueblo Viejo", "estado": "activa", "coords": [17.898905, -94.299016], "alias": ["pueblo viejo"]}, {"id": "zapotal", "nombre": "Zapotal", "estado": "proxima", "coords": null, "alias": ["zapotal"]}, {"id": "la-concepcion", "nombre": "La Concepción", "estado": "proxima", "coords": null, "alias": ["la concepcion", "concepcion"]}];

(function () {
  var D = window.FT_COLONIAS;
  var norm = function (t) {
    return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  };

  function buscar(q) {
    q = norm(q);
    if (q.length < 3) return null;
    return D.find(function (c) {
      return [c.nombre].concat(c.alias || []).some(function (n) { n = norm(n); return n === q || n.indexOf(q) !== -1 || q.indexOf(n) !== -1; });
    }) || null;
  }

  function resaltar(c) {
    document.querySelectorAll('.pin').forEach(function (p) {
      p.classList.remove('pin--hit');
      if (c && p.getAttribute('data-id') === c.id) { void p.getBoundingClientRect(); p.classList.add('pin--hit'); }
    });
  }

  function enlace(texto, href) { var a = document.createElement('a'); a.textContent = texto; a.href = href; return a; }

  function mostrar(caja, tipo, partes) {
    caja.className = 'checker__result is-shown checker__result--' + tipo;
    caja.textContent = '';
    partes.forEach(function (p) { caja.appendChild(typeof p === 'string' ? document.createTextNode(p) : p); });
  }

  document.querySelectorAll('[data-checker]').forEach(function (form) {
    var input = form.querySelector('.checker__input'), caja = form.querySelector('.checker__result');

    function revisar() {
      var texto = input.value.trim();
      if (texto.length < 3) { mostrar(caja, 'no', ['Escribe el nombre de tu colonia o comunidad.']); resaltar(null); return; }
      var c = buscar(texto);
      if (!c) {
        resaltar(null);
        mostrar(caja, 'no', ['No encontramos «' + texto + '» en nuestra lista. ', enlace('Escríbenos por WhatsApp', 'https://wa.me/529211509583'), ' y revisamos si podemos llegar.']);
      } else if (c.estado === 'activa') {
        resaltar(c);
        mostrar(caja, 'activa', ['Sí llegamos a ' + c.nombre + '. ', enlace('Contrata tu plan', '/contacto.html'), ' y agendamos tu instalación.']);
      } else {
        resaltar(c);
        mostrar(caja, 'proxima', ['Todavía no llegamos a ' + c.nombre + ', pero está en nuestros planes. ', enlace('Déjanos tus datos', '/cobertura.html#avisar'), ' y te avisamos.']);
      }
      if (c) document.dispatchEvent(new CustomEvent('ft:colonia', { detail: c }));
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); revisar(); });
    form.querySelectorAll('[data-colonia]').forEach(function (b) {
      b.addEventListener('click', function () { input.value = b.getAttribute('data-colonia'); revisar(); });
    });
  });

  // Botones de la lista de colonias (página de cobertura)
  document.querySelectorAll('.colonias [data-colonia]').forEach(function (b) {
    b.addEventListener('click', function () {
      var c = buscar(b.getAttribute('data-colonia'));
      if (c) document.dispatchEvent(new CustomEvent('ft:colonia', { detail: c }));
    });
  });
})();
