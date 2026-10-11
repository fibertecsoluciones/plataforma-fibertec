// Construye el sidebar + topbar de forma consistente en todas las páginas internas.
// Uso: renderLayout('dashboard', 'Panel general')  -> se llama al cargar cada página.

// ==========================================================
// ICONOS (trazo simple, heredan el color del texto) — estilo SAP Fiori
// ==========================================================
const FT_ICONOS = {
  grafica: '<line x1="5" y1="20" x2="5" y2="12"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="19" y1="20" x2="19" y2="14"/>',
  usuarios: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.4 2.7-6 6-6s6 2.6 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M16.2 14.2c2.8.2 4.8 2.3 4.8 5.3"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>',
  tarjeta: '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="7" y1="15" x2="11" y2="15"/>',
  telefono: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  portapapeles: '<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2.5" width="6" height="3.5" rx="1"/><line x1="8.5" y1="11" x2="15.5" y2="11"/><line x1="8.5" y1="15" x2="13.5" y2="15"/>',
  herramientas: '<path d="M14.5 4a4.5 4.5 0 0 0-4.3 5.9L3.8 16.3a1.8 1.8 0 0 0 0 2.5l1.4 1.4a1.8 1.8 0 0 0 2.5 0l6.4-6.4A4.5 4.5 0 0 0 20 9.5l-2.8 2.8-2.5-.5-.5-2.5L17 6.5A4.5 4.5 0 0 0 14.5 4z"/>',
  caja: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><polyline points="3 7.5 12 12 21 7.5"/><line x1="12" y1="12" x2="12" y2="21"/>',
  dinero: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><circle cx="6.8" cy="12" r=".6"/><circle cx="17.2" cy="12" r=".6"/>',
  cartera: '<path d="M4 8V6a2 2 0 0 1 2-2h11v4"/><rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="16.5" cy="14" r="1.2"/>',
  ajustes: '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2.4"/><circle cx="15" cy="17" r="2.4"/>',
  campana: '<path d="M6 17v-6a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  menu: '<line x1="4" y1="6.5" x2="20" y2="6.5"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17.5" x2="20" y2="17.5"/>',
  cerrar: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  mas: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  buscar: '<circle cx="11" cy="11" r="6.5"/><line x1="16" y1="16" x2="21" y2="21"/>',
  check: '<polyline points="5 12.5 10 17 19 7.5"/>',
  ok: '<circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9.5"/>',
  aviso: '<path d="M12 3.5 2.5 20h19L12 3.5z"/><line x1="12" y1="10" x2="12" y2="14"/><circle cx="12" cy="17" r=".7"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.8" r=".8"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  basura: '<polyline points="4 7 20 7"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><line x1="10" y1="11" x2="10" y2="16"/><line x1="14" y1="11" x2="14" y2="16"/>',
  lapiz: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><line x1="13" y1="7" x2="17" y2="11"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><polyline points="14 3 14 7 18 7"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/>',
  descarga: '<line x1="12" y1="4" x2="12" y2="15"/><polyline points="7.5 10.5 12 15 16.5 10.5"/><line x1="5" y1="20" x2="19" y2="20"/>',
  enlace: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copo: '<line x1="12" y1="3" x2="12" y2="21"/><line x1="4.2" y1="7.5" x2="19.8" y2="16.5"/><line x1="19.8" y1="7.5" x2="4.2" y2="16.5"/>',
  prohibido: '<circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/>',
  deshacer: '<polyline points="9 14 4 9 9 4"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  carpeta: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  regalo: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><line x1="12" y1="9" x2="12" y2="20"/><line x1="3" y1="9" x2="21" y2="9"/><path d="M12 9c-1.5-4-5.5-4-5.5-1.5S10 9 12 9zm0 0c1.5-4 5.5-4 5.5-1.5S14 9 12 9z"/>',
  recibo: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/>',
  enchufe: '<line x1="9" y1="3" x2="9" y2="8"/><line x1="15" y1="3" x2="15" y2="8"/><path d="M6 8h12v4a6 6 0 0 1-12 0z"/><line x1="12" y1="18" x2="12" y2="21"/>',
  sol: '<circle cx="12" cy="12" r="4"/><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="5.3" y1="5.3" x2="7" y2="7"/><line x1="17" y1="17" x2="18.7" y2="18.7"/><line x1="18.7" y1="5.3" x2="17" y2="7"/><line x1="7" y1="17" x2="5.3" y2="18.7"/>',
  salir: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><polyline points="15 8 20 12 15 16"/><line x1="20" y1="12" x2="9" y2="12"/>',
  chevron: '<polyline points="6 9 12 15 18 9"/>'
};
function ftIcono(nombre, tam) {
  const t = tam || 18;
  return `<svg class="ft-i" width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FT_ICONOS[nombre] || ''}</svg>`;
}

// Reemplaza los emojis del texto de la pantalla por iconos de línea (estilo SAP Fiori). Se aplica a todo lo que
// las pantallas dibujan, ahora y después (cada vez que cambian su contenido), sin tocar el código de cada una.
const FT_EMOJI = {
  '✅': 'ok', '✓': 'check', '⚠': 'aviso', '🗑': 'basura', '✏': 'lapiz', '📍': 'pin', '📌': 'pin', '📞': 'telefono', '🔧': 'herramientas', '🛠': 'herramientas',
  '💰': 'dinero', '💵': 'dinero', '🧊': 'copo', '⬇': 'descarga', '📥': 'descarga', '📋': 'portapapeles', '🚫': 'prohibido', '👥': 'usuarios', '👷': 'usuario',
  '📄': 'doc', '🔗': 'enlace', '🔌': 'enchufe', '🌴': 'sol', '🗂': 'carpeta', '↩': 'deshacer', '📊': 'grafica', '💳': 'tarjeta', '📦': 'caja', '🤝': 'cartera',
  '⚙': 'ajustes', '🔔': 'campana', '🎁': 'regalo', '🧾': 'recibo', 'ℹ': 'info', '✕': 'cerrar', '🎉': '',
  '🔴': 'dot-rojo', '🟠': 'dot-naranja', '🟡': 'dot-amarillo', '🟢': 'dot-verde'
};
const FT_EMOJI_RE = new RegExp('(' + Object.keys(FT_EMOJI).join('|') + ')\\uFE0F?', 'g');
const FT_SALTAR = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT', 'TITLE', 'SVG', 'CANVAS']);

function ftReemplazarEmojisEn(nodoTexto) {
  const texto = nodoTexto.nodeValue;
  FT_EMOJI_RE.lastIndex = 0;
  if (!texto || !FT_EMOJI_RE.test(texto)) return;
  FT_EMOJI_RE.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let ultimo = 0, m;
  while ((m = FT_EMOJI_RE.exec(texto)) !== null) {
    if (m.index > ultimo) frag.appendChild(document.createTextNode(texto.slice(ultimo, m.index)));
    const nombre = FT_EMOJI[m[1]];
    if (nombre) {
      const span = document.createElement('span');
      if (nombre.startsWith('dot-')) { span.className = 'ft-dot ft-' + nombre; }
      else { span.className = 'ft-ico'; span.innerHTML = ftIcono(nombre, 16); }
      frag.appendChild(span);
    }
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) frag.appendChild(document.createTextNode(texto.slice(ultimo)));
  nodoTexto.parentNode.replaceChild(frag, nodoTexto);
}
function ftReemplazarEmojis(raiz) {
  if (!raiz) return;
  if (raiz.nodeType === 3) { if (raiz.parentNode && !FT_SALTAR.has(raiz.parentNode.nodeName.toUpperCase())) ftReemplazarEmojisEn(raiz); return; }
  if (raiz.nodeType !== 1 || FT_SALTAR.has(raiz.nodeName.toUpperCase())) return;
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentNode && FT_SALTAR.has(n.parentNode.nodeName.toUpperCase()) || (n.parentNode && n.parentNode.closest && n.parentNode.closest('[data-sin-iconos]'))) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const nodos = []; while (walker.nextNode()) nodos.push(walker.currentNode);
  nodos.forEach(ftReemplazarEmojisEn);
}
document.addEventListener('DOMContentLoaded', () => {
  ftReemplazarEmojis(document.body);
  new MutationObserver((muts) => { muts.forEach(m => m.addedNodes.forEach(n => ftReemplazarEmojis(n))); }).observe(document.body, { childList: true, subtree: true });
});

// ==========================================================
// MENÚ LATERAL
// ==========================================================
const NAV_ITEMS = [
  { grupo: 'Operación', items: [
    { id: 'dashboard', href: '/dashboard.html', icono: 'grafica', label: 'Panel general', soloAdmin: true },
    { id: 'clientes',  href: '/clientes.html',  icono: 'usuarios', label: 'Clientes', soloAdmin: true },
    { id: 'pagos',     href: '/pagos.html',     icono: 'tarjeta', label: 'Pagos', soloAdmin: true },
  ]},
  { grupo: 'Campo', items: [
    { id: 'solicitudes', href: '/solicitudes.html', icono: 'telefono', label: 'Solicitudes' },
    { id: 'actividades', href: '/actividades.html', icono: 'portapapeles', label: 'Actividades' },
    { id: 'tecnicos',   href: '/tecnicos.html',   icono: 'herramientas', label: 'Instalaciones' },
    { id: 'inventario', href: '/inventario.html', icono: 'caja', label: 'Inventario' },
  ]},
  { grupo: 'Administración', items: [
    { id: 'finanzas', href: '/finanzas.html', icono: 'dinero', label: 'Finanzas', soloAdmin: true },
    { id: 'pagos-tecnicos', href: '/pagos-tecnicos.html', icono: 'cartera', label: 'Pago a técnicos', soloAdmin: true },
    { id: 'ajustes',  href: '/ajustes.html',  icono: 'ajustes', label: 'Ajustes', soloAdmin: true },
  ]}
];

function renderLayout(paginaActiva, tituloTopbar) {
  const usuario = API.usuario();
  if (!usuario) return;

  const gruposHtml = NAV_ITEMS.map(grupo => {
    const items = grupo.items
      .filter(it => !it.soloAdmin || usuario.rol === 'admin')
      .map(it => `
        <a class="nav-link ${it.id === paginaActiva ? 'activo' : ''}" href="${it.href}" ${it.id === paginaActiva ? 'aria-current="page"' : ''}>
          <span class="icono">${ftIcono(it.icono, 19)}</span><span>${it.label}</span>
        </a>`).join('');
    if (!items) return '';
    return `<div class="nav-grupo"><div class="nav-titulo">${grupo.grupo}</div>${items}</div>`;
  }).join('');

  const iniciales = String(usuario.nombre || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const rolTexto = usuario.rol === 'admin' ? 'Administrador' : (usuario.rol === 'tecnico' ? 'Técnico' : usuario.rol);

  const shell = document.getElementById('app-shell');
  shell.innerHTML = `
    <header class="ft-shell">
      <button class="btn-menu" id="btn-menu" aria-label="Abrir menú">${ftIcono('menu', 22)}</button>
      <a class="ft-logo" href="${usuario.rol === 'tecnico' ? '/actividades.html' : '/dashboard.html'}" aria-label="FiberTec — inicio"><img src="/img/logo.png" alt="FiberTec" /></a>
      <div class="ft-shell__sep"></div>
      <div class="ft-shell__title">Gestión de red</div>
      <div class="ft-shell__right">
        <div class="notif-envoltura">
          <button class="btn-notif" id="btn-notif" title="Notificaciones" aria-label="Notificaciones">
            ${ftIcono('campana', 20)}
            <span class="notif-badge oculto" id="notif-badge">0</span>
          </button>
          <div class="notif-panel oculto" id="notif-panel">
            <div class="notif-panel-cabecera">Clientes con adeudo</div>
            <div id="notif-panel-cuerpo" class="cargando">Cargando…</div>
          </div>
        </div>
        <div class="ft-usuario">
          <button class="ft-usuario__btn" id="btn-usuario" aria-haspopup="true" aria-expanded="false">
            <span class="ft-avatar">${iniciales}</span>
            <span class="ft-usuario__nombre">${usuario.nombre}</span>
            ${ftIcono('chevron', 14)}
          </button>
          <div class="ft-usuario__menu oculto" id="menu-usuario">
            <div class="ft-usuario__datos"><b>${usuario.nombre}</b><span>${rolTexto}</span></div>
            <a href="#" class="ft-usuario__salir" id="btn-salir">${ftIcono('salir', 17)} Cerrar sesión</a>
          </div>
        </div>
      </div>
    </header>
    <div class="ft-backdrop" id="ft-backdrop"></div>
    <aside class="sidebar" id="sidebar" aria-label="Menú principal">
      ${gruposHtml}
    </aside>
    <div class="contenido">
      <div class="ft-pageheader">
        <div>
          <h1 id="ft-titulo">${tituloTopbar}</h1>
          <div class="ft-ph-sub" id="ft-ph-sub"></div>
        </div>
        <div class="ft-ph-acciones" id="ft-ph-acciones"></div>
      </div>
      <main class="pagina" id="pagina-contenido"></main>
    </div>
  `;

  document.getElementById('btn-salir').addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm('¿Cerrar sesión?')) API.cerrarSesion();
  });

  // menú lateral en celular: se abre con ☰ y se cierra tocando fuera
  const sidebar = document.getElementById('sidebar'), backdrop = document.getElementById('ft-backdrop');
  const alternarMenu = (abrir) => { sidebar.classList.toggle('abierta', abrir); backdrop.classList.toggle('visible', sidebar.classList.contains('abierta')); };
  document.getElementById('btn-menu').addEventListener('click', () => alternarMenu());
  backdrop.addEventListener('click', () => alternarMenu(false));

  // menú de usuario
  const btnUsuario = document.getElementById('btn-usuario'), menuUsuario = document.getElementById('menu-usuario');
  btnUsuario.addEventListener('click', (e) => { e.stopPropagation(); const abierto = menuUsuario.classList.toggle('oculto') === false; btnUsuario.setAttribute('aria-expanded', abierto); });
  document.addEventListener('click', (e) => { if (!menuUsuario.contains(e.target)) { menuUsuario.classList.add('oculto'); btnUsuario.setAttribute('aria-expanded', 'false'); } });

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

// Para timestamps reales (con hora), como cuándo se completó algo — a diferencia de
// fechaCorta(), aquí SÍ queremos la conversión normal de zona horaria porque la hora
// exacta del evento sí importa (no es una fecha "de calendario" como el día de pago).
function fechaHoraCorta(f) {
  if (!f) return '—';
  const d = new Date(f);
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

// Crea un mapa interactivo (Leaflet, gratis, sin necesidad de clave ni facturación)
// en modo SATÉLITE (imágenes de Esri) dentro del elemento con id `${prefijo}-mapa`.
// El usuario puede hacer clic en cualquier parte del mapa o arrastrar el pin para
// marcar la ubicación; también puede pegar un link de Maps o usar su propio GPS, si
// esos campos existen en el formulario (son opcionales). Llama a onCambio(lat, lng)
// cada vez que se mueve. Centro por defecto: zona donde opera el ISP.
function activarSelectorUbicacion(prefijo, latInicial, lngInicial, onCambio) {
  const lat = latInicial || 17.98069;
  const lng = lngInicial || -94.34921;

  const mapa = L.map(`${prefijo}-mapa`).setView([lat, lng], latInicial ? 17 : 13);

  // Satélite (Esri World Imagery) — gratis, no necesita clave ni facturación.
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri',
    maxZoom: 19
  }).addTo(mapa);

  // Etiquetas de calles/lugares encima de la imagen satelital, para ubicarse mejor.
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    opacity: 0.9
  }).addTo(mapa);

  const marcador = L.marker([lat, lng], { draggable: true }).addTo(mapa);

  function actualizar(la, ln) {
    onCambio(la, ln);
    const preview = document.getElementById(`${prefijo}-preview`);
    if (preview) {
      preview.innerHTML = `📍 ${la.toFixed(5)}, ${ln.toFixed(5)} — <a href="${linkGoogleMaps(la, ln)}" target="_blank">Ver en Google Maps</a>`;
      preview.classList.remove('oculto');
    }
  }

  marcador.on('dragend', () => {
    const pos = marcador.getLatLng();
    actualizar(pos.lat, pos.lng);
  });

  mapa.on('click', (e) => {
    marcador.setLatLng(e.latlng);
    actualizar(e.latlng.lat, e.latlng.lng);
  });

  const inputTexto = document.getElementById(`${prefijo}-texto`);
  if (inputTexto) {
    inputTexto.addEventListener('input', (e) => {
      const coords = extraerCoordenadasDeTexto(e.target.value);
      if (coords) {
        marcador.setLatLng([coords.lat, coords.lng]);
        mapa.setView([coords.lat, coords.lng], 17);
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
          marcador.setLatLng([pos.coords.latitude, pos.coords.longitude]);
          mapa.setView([pos.coords.latitude, pos.coords.longitude], 17);
          actualizar(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => alert('No se pudo obtener tu ubicación: ' + err.message)
      );
    });
  }

  if (latInicial && lngInicial) actualizar(latInicial, lngInicial);

  // El mapa se crea a veces dentro de un modal recién abierto (todavía sin su tamaño
  // final calculado); esto obliga a Leaflet a recalcular su tamaño un instante después.
  setTimeout(() => mapa.invalidateSize(), 250);

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
