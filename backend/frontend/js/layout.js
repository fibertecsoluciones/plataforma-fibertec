// Construye el sidebar + topbar de forma consistente en todas las páginas internas.
// Uso: renderLayout('dashboard', 'Panel general')  -> se llama al cargar cada página.

const NAV_ITEMS = [
  { grupo: 'Operación', items: [
    { id: 'dashboard', href: '/dashboard.html', icono: '📊', label: 'Panel general' },
    { id: 'clientes',  href: '/clientes.html',  icono: '👥', label: 'Clientes' },
    { id: 'pagos',     href: '/pagos.html',     icono: '💳', label: 'Pagos' },
  ]},
  { grupo: 'Campo', items: [
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
}

// Formatea moneda MXN
function mxn(valor) {
  const n = Number(valor || 0);
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

// Formatea fecha corta legible
function fechaCorta(f) {
  if (!f) return '—';
  const d = new Date(f);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

const ETIQUETA_SEMAFORO = {
  verde: 'Al corriente',
  amarillo: 'Por vencer',
  naranja: 'En tolerancia',
  rojo: 'Vencido'
};
