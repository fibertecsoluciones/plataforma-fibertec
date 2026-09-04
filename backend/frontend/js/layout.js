// Construye el sidebar + topbar de forma consistente en todas las páginas internas.
// Uso: renderLayout('dashboard', 'Panel general')  -> se llama al cargar cada página.

const NAV_ITEMS = [
  { grupo: 'Operación', items: [
    { id: 'dashboard', href: '/dashboard.html', icono: '📊', label: 'Panel general', soloAdmin: true },
    { id: 'clientes',  href: '/clientes.html',  icono: '👥', label: 'Clientes', soloAdmin: true },
    { id: 'pagos',     href: '/pagos.html',     icono: '💳', label: 'Pagos', soloAdmin: true },
  ]},
  { grupo: 'Campo', items: [
    { id: 'solicitudes', href: '/solicitudes.html', icono: '📞', label: 'Solicitudes' },
    { id: 'actividades', href: '/actividades.html', icono: '📋', label: 'Actividades' },
    { id: 'tecnicos',   href: '/tecnicos.html',   icono: '🛠️', label: 'Instalaciones' },
    { id: 'inventario', href: '/inventario.html', icono: '📦', label: 'Inventario' },
  ]},
  { grupo: 'Administración', items: [
    { id: 'finanzas', href: '/finanzas.html', icono: '💰', label: 'Finanzas', soloAdmin: true },
    { id: 'ajustes',  href: '/ajustes.html',  icono: '⚙️', label: 'Ajustes', soloAdmin: true },
  ]}
];

function renderLayout(paginaActiva, tituloTopbar) {
  const usuario = API.usuario();
  if (!usuario) return;

  const gruposHtml = NAV_ITEMS.map(grupo => {
    const items = grupo.items
      .filter(it => !it.soloAdmin || usuario.rol === 'admin')
      .map(it => `
        <a class="nav-link ${it.id === paginaActiva ? 'activo' : ''}" href="${it.href}">
          <span class="icono">${it.icono}</span> ${it.label}
        </a>`).join('');
    if (!items) return '';
    return `<div class="nav-grupo"><div class="nav-titulo">${grupo.grupo}</div>${items}</div>`;
  }).join('');

  const shell = document.getElementById('app-shell');
  shell.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="marca">
        <img src="/img/logo.png" alt="FiberTec" />
      </div>
      ${gruposHtml}
      <div class="sidebar-pie">
        <div class="usuario-nombre">${usuario.nombre}</div>
        <div class="usuario-rol">${usuario.rol}</div>
        <a href="#" class="link-salir" id="btn-salir">Cerrar sesión</a>
      </div>
    </aside>
    <div class="contenido">
      <header class="topbar">
        <div class="flex-gap">
          <button class="btn-menu" id="btn-menu">☰</button>
          <h2>${tituloTopbar}</h2>
        </div>
        <div class="notif-envoltura">
          <button class="btn-notif" id="btn-notif" title="Clientes con adeudo">
            🔔
            <span class="notif-badge oculto" id="notif-badge">0</span>
          </button>
          <div class="notif-panel oculto" id="notif-panel">
            <div class="notif-panel-cabecera">Clientes con adeudo</div>
            <div id="notif-panel-cuerpo" class="cargando">Cargando…</div>
          </div>
        </div>
      </header>
      <main class="pagina" id="pagina-contenido"></main>
    </div>
  `;

  document.getElementById('btn-salir').addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm('¿Cerrar sesión?')) API.cerrarSesion();
  });

  const btnMenu = document.getElementById('btn-menu');
  if (btnMenu) {
    btnMenu.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('abierta');
    });
  }

  configurarNotificaciones();
}

// Campanita de notificaciones en la barra superior: avisa de clientes con adeudo
// (a partir de 1 mes) en cualquier página, sin tener que entrar a Clientes a revisar.
async function configurarNotificaciones() {
  const btn = document.getElementById('btn-notif');
  const panel = document.getElementById('notif-panel');
  if (!btn || !panel) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('oculto');
  });
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== btn) panel.classList.add('oculto');
  });

  const usuarioActual = API.usuario();
  const esAdminNotif = usuarioActual && usuarioActual.rol === 'admin';

  try {
    // La lista de clientes con adeudo es información financiera — solo para admin.
    let conAdeudo = [];
    if (esAdminNotif) {
      const lista = await API.get('/api/clientes');
      conAdeudo = lista
        .filter(c => c.meses_adeudados > 0)
        .sort((a, b) => b.meses_adeudados - a.meses_adeudados);
    }

    let solicitudesNuevas = [];
    if (esAdminNotif) {
      try { solicitudesNuevas = await API.get('/api/solicitudes?estado=nueva'); } catch (e) { /* no crítico */ }
    }

    const totalNotif = conAdeudo.length + solicitudesNuevas.length;
    const badge = document.getElementById('notif-badge');
    if (totalNotif > 0) {
      badge.textContent = totalNotif > 99 ? '99+' : totalNotif;
      badge.classList.remove('oculto');
    }

    const cuerpo = document.getElementById('notif-panel-cuerpo');
    if (!totalNotif) {
      cuerpo.innerHTML = `<div class="notif-vacio">🎉 No hay nada pendiente por ahora.</div>`;
      return;
    }

    let html = '';

    if (solicitudesNuevas.length) {
      html += `<div class="notif-panel-cabecera" style="position:static; border-bottom:none; padding-bottom:0;">📞 Solicitudes nuevas</div>`;
      html += solicitudesNuevas.slice(0, 8).map(s => `
        <a class="notif-item" href="/solicitudes.html">
          <div class="flex-entre">
            <span><b>${s.nombre}</b></span>
            <span class="texto-gris" style="font-size:11px;">${s.telefono || 'sin teléfono'}</span>
          </div>
          <div class="texto-gris" style="font-size:11.5px; margin-top:2px;">${s.zona_nombre || 'Sin zona'} · capturada por ${s.capturado_por_nombre || '—'}</div>
        </a>
      `).join('');
    }

    if (conAdeudo.length) {
      html += `<div class="notif-panel-cabecera" style="position:static; border-bottom:none; padding-bottom:0;">💰 Clientes con adeudo</div>`;
      html += conAdeudo.slice(0, 15).map(c => `
        <a class="notif-item" href="/pagos.html?cliente=${c.cliente_id_pk}">
          <div class="flex-entre">
            <span><b>${c.nombre}</b> <span class="texto-gris" style="font-size:11px;">(${c.cliente_id})</span></span>
            <span class="notif-item-meses">${c.meses_adeudados} mes${c.meses_adeudados > 1 ? 'es' : ''}</span>
          </div>
          <div class="texto-gris" style="font-size:11.5px; margin-top:2px;">${c.zona} · debe ${mxn(c.saldo_pendiente)}</div>
        </a>
      `).join('');
      html += `<div class="notif-panel-pie"><a href="/clientes.html?adeudo=1">Ver todos los ${conAdeudo.length} clientes con adeudo →</a></div>`;
    }

    cuerpo.innerHTML = html;
  } catch (err) {
    console.error('No se pudieron cargar las notificaciones:', err);
  }
}

// Formatea moneda MXN
function mxn(valor) {
  const n = Number(valor || 0);
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

// Formatea fecha corta legible
// IMPORTANTE: las fechas que vienen de PostgreSQL (columnas DATE, sin hora) llegan como
// texto tipo "2026-09-07T00:00:00.000Z". Si se le pasan tal cual a `new Date(...)`,
// JavaScript las interpreta como medianoche en UTC y, al mostrarlas en una zona horaria
// negativa (como México, UTC-6), se recorren un día hacia atrás. Por eso se arma la fecha
// a mano con año/mes/día locales, sin pasar por esa conversión de huso horario.
function fechaLocalDesdeTexto(f) {
  if (!f) return null;
  const soloFecha = String(f).slice(0, 10); // "2026-09-07"
  const partes = soloFecha.split('-');
  if (partes.length !== 3) return new Date(f);
  const [anio, mes, dia] = partes.map(Number);
  return new Date(anio, mes - 1, dia);
}

function fechaCorta(f) {
  const d = fechaLocalDesdeTexto(f);
  if (!d) return '—';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

const ETIQUETA_SEMAFORO = {
  verde: 'Al corriente',
  amarillo: 'Por vencer',
  naranja: 'En tolerancia',
  rojo: 'Vencido'
};

// Intenta sacar latitud/longitud de un link de Google Maps pegado, o de un texto
// escrito directo como "16.7500, -93.1167". Cubre los formatos más comunes de Maps.
function extraerCoordenadasDeTexto(texto) {
  if (!texto) return null;
  const patrones = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,          // .../@16.75,-93.11,15z
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,     // ?q=16.75,-93.11
    /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,    // ?ll=16.75,-93.11
    /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/ // "16.75, -93.11" tal cual
  ];
  for (const patron of patrones) {
    const match = texto.match(patron);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
  }
  return null;
}

function linkGoogleMaps(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

// Crea un mapa interactivo (Google Maps) dentro del elemento con id `${prefijo}-mapa`.
// El usuario puede hacer clic en cualquier parte del mapa o arrastrar el pin para
// marcar la ubicación; también puede pegar un link de Maps o usar su propio GPS, si
// esos campos existen en el formulario (son opcionales). Llama a onCambio(lat, lng)
// cada vez que se mueve. Centro por defecto: zona donde opera el ISP.
function activarSelectorUbicacion(prefijo, latInicial, lngInicial, onCambio) {
  const lat = latInicial || 17.98069;
  const lng = lngInicial || -94.34921;

  const mapa = new google.maps.Map(document.getElementById(`${prefijo}-mapa`), {
    center: { lat, lng },
    zoom: latInicial ? 16 : 13,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false
  });

  const marcador = new google.maps.Marker({
    position: { lat, lng },
    map: mapa,
    draggable: true
  });

  function actualizar(la, ln) {
    onCambio(la, ln);
    const preview = document.getElementById(`${prefijo}-preview`);
    if (preview) {
      preview.innerHTML = `📍 ${la.toFixed(5)}, ${ln.toFixed(5)} — <a href="${linkGoogleMaps(la, ln)}" target="_blank">Ver en Google Maps</a>`;
      preview.classList.remove('oculto');
    }
  }

  marcador.addListener('dragend', () => {
    const pos = marcador.getPosition();
    actualizar(pos.lat(), pos.lng());
  });

  mapa.addListener('click', (e) => {
    marcador.setPosition(e.latLng);
    actualizar(e.latLng.lat(), e.latLng.lng());
  });

  const inputTexto = document.getElementById(`${prefijo}-texto`);
  if (inputTexto) {
    inputTexto.addEventListener('input', (e) => {
      const coords = extraerCoordenadasDeTexto(e.target.value);
      if (coords) {
        const posicion = { lat: coords.lat, lng: coords.lng };
        marcador.setPosition(posicion);
        mapa.setCenter(posicion);
        mapa.setZoom(16);
        actualizar(coords.lat, coords.lng);
      }
    });
  }

  const btnMiUbicacion = document.getElementById(`${prefijo}-usar-mi-ubicacion`);
  if (btnMiUbicacion) {
    btnMiUbicacion.addEventListener('click', () => {
      if (!navigator.geolocation) { alert('Este dispositivo no soporta ubicación.'); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const posicion = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          marcador.setPosition(posicion);
          mapa.setCenter(posicion);
          mapa.setZoom(16);
          actualizar(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => alert('No se pudo obtener tu ubicación: ' + err.message)
      );
    });
  }

  if (latInicial && lngInicial) actualizar(latInicial, lngInicial);

  // Si el mapa se crea dentro de un modal recién mostrado, a veces Google Maps no
  // calcula bien el tamaño hasta que se le avisa que el contenedor ya está visible.
  setTimeout(() => {
    google.maps.event.trigger(mapa, 'resize');
    mapa.setCenter({ lat, lng });
  }, 250);

  return mapa;
}

// Presionar Escape cierra cualquier modal/formulario abierto, en cualquier página
// (todas usan el mismo patrón: un contenedor #modal-contenedor donde se inyecta el modal).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const modalCont = document.getElementById('modal-contenedor');
  if (modalCont && modalCont.innerHTML.trim()) {
    modalCont.innerHTML = '';
  }
});
