// Mapa real de cobertura (Leaflet): satélite por defecto, con opción de mapa de calles
document.addEventListener('DOMContentLoaded', function () {
  var el = document.getElementById('mapa-real');
  if (!el || !window.L || !window.FT_COLONIAS) return;

  var map = L.map(el, { scrollWheelZoom: false });

  // Satélite (como en la página anterior) con los nombres de lugares encima; o mapa de calles
  var satelite = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], maxZoom: 20, attribution: 'Imágenes &copy; Google'
  });
  var nombres = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', opacity: 0.9, attribution: 'Nombres &copy; OpenStreetMap, CARTO'
  });
  var calles = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
  });
  var vistaSatelite = L.layerGroup([satelite, nombres]).addTo(map);
  L.control.layers({ 'Satélite': vistaSatelite, 'Mapa': calles }, null, { collapsed: false, position: 'topright' }).addTo(map);

  var marcadores = {};
  window.FT_COLONIAS.forEach(function (c) {
    var m = L.marker(c.coords, {
      title: c.nombre,
      icon: L.divIcon({ className: '', iconSize: [0, 0],
        html: '<div class="mk mk--' + c.estado + '"><div class="mk__pin"></div><div class="mk__label">' + c.nombre + '</div></div>' })
    }).addTo(map);
    var cuerpo = document.createElement('div');
    var t = document.createElement('strong'); t.textContent = c.nombre; cuerpo.appendChild(t);
    cuerpo.appendChild(document.createTextNode(c.estado === 'activa' ? 'Ya tenemos cobertura. ' : 'Próximamente. '));
    var a = document.createElement('a');
    a.href = c.estado === 'activa' ? '/contacto.html' : '#avisar';
    a.textContent = c.estado === 'activa' ? 'Contratar' : 'Avísame';
    cuerpo.appendChild(a);
    m.bindPopup(cuerpo);
    marcadores[c.id] = m;
  });

  map.fitBounds(window.FT_COLONIAS.map(function (c) { return c.coords; }), { padding: [60, 60] });

  document.addEventListener('ft:colonia', function (e) {
    var c = e.detail; if (!c) return;
    map.flyTo(c.coords, 14, { duration: 1.1 });
    if (marcadores[c.id]) marcadores[c.id].openPopup();
  });
});
