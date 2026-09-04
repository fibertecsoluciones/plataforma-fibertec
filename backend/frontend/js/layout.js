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
