(async function () {
  const usuario = protegerPagina();
  if (!usuario) return;

  renderLayout('actividades', 'Actividades');
  const cont = document.getElementById('pagina-contenido');
  cont.classList.add('sap-host');
  const esAdmin = usuario.rol === 'admin';

  // ==========================================================
  // CATÁLOGOS Y UTILIDADES
  // ==========================================================
  const TIPOS = { instalacion: 'Instalación', mantenimiento: 'Mantenimiento', falla: 'Falla', libranza: 'Libranza', gestion: 'Gestión' };
  const PRIORIDADES = { alta: 'Alta', media: 'Media', baja: 'Baja' };
  const ESTADOS = { pendiente: 'Pendiente', en_proceso: 'En proceso', completada: 'Completada' };
  const RANGO_PRIORIDAD = { alta: 0, media: 1, baja: 2 };
  const RANGO_ESTADO = { pendiente: 0, en_proceso: 1, completada: 2 };

  // Iconos de trazo simple (heredan el color del texto)
  const ICONOS = {
    check: '<polyline points="5 12.5 10 17 19 7.5"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    ciclo: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><polyline points="20 4 20 9 15 9"/>',
    ok: '<circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9.5"/>',
    aviso: '<path d="M12 3.5 2.5 20h19L12 3.5z"/><line x1="12" y1="10" x2="12" y2="14"/><circle cx="12" cy="17" r=".7"/>',
    error: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="7.5" x2="12" y2="13"/><circle cx="12" cy="16.5" r=".7"/>',
    menos: '<circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/>',
    lapiz: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><line x1="13" y1="7" x2="17" y2="11"/>',
    basura: '<polyline points="4 7 20 7"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><line x1="10" y1="11" x2="10" y2="16"/><line x1="14" y1="11" x2="14" y2="16"/>',
    mas: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    cerrar: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
    buscar: '<circle cx="11" cy="11" r="6.5"/><line x1="16" y1="16" x2="21" y2="21"/>',
    arriba: '<polyline points="6 15 12 9 18 15"/>',
    abajo: '<polyline points="6 9 12 15 18 9"/>',
    pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    nota: '<path d="M5 4h10l4 4v12H5z"/><polyline points="15 4 15 8 19 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="16.5" x2="14" y2="16.5"/>',
    lista: '<line x1="9" y1="7" x2="20" y2="7"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="17" x2="20" y2="17"/><polyline points="4 7 5.2 8.2 7 6"/><polyline points="4 12 5.2 13.2 7 11"/><polyline points="4 17 5.2 18.2 7 16"/>',
    vacio: '<rect x="4" y="5" width="16" height="14" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="9" y1="14" x2="15" y2="14"/>',
    grip: '<circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/>'
  };
  const ico = (n, tam = 16) => `<svg class="sap-ico" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n]}</svg>`;

  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const normalizar = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const hoyLocal = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const esVencida = (a) => !!a.fecha_limite && a.estado !== 'completada' && fechaLocalDesdeTexto(a.fecha_limite) < hoyLocal();
  const guion = '<span class="sap-subtle" style="margin:0;">—</span>';

  const estadoHtml = (e) => {
    const m = { pendiente: ['neutral', 'reloj'], en_proceso: ['info', 'ciclo'], completada: ['positive', 'ok'] }[e] || ['neutral', 'reloj'];
    return `<span class="sap-status sap-status--${m[0]}">${ico(m[1])}${esc(ESTADOS[e] || e)}</span>`;
  };
  const prioridadHtml = (p) => {
    const m = { alta: ['negative', 'error'], media: ['critical', 'aviso'], baja: ['neutral', 'menos'] }[p] || ['neutral', 'menos'];
    return `<span class="sap-status sap-status--${m[0]}">${ico(m[1])}${esc(PRIORIDADES[p] || p)}</span>`;
  };
  const pinHtml = (a) => (a.latitud && a.longitud)
    ? `<a href="${linkGoogleMaps(a.latitud, a.longitud)}" target="_blank" rel="noopener" class="sap-pin ${a.ubicacion_confirmada ? 'sap-pin--ok' : 'sap-pin--est'}" title="${a.ubicacion_confirmada ? 'Ubicación confirmada en sitio' : 'Ubicación estimada'} — abrir en el mapa" data-sin-abrir>${ico('pin', 15)}</a>` : '';
  const progresoHtml = (a) => {
    const total = a.total_puntos || 0, hechos = a.puntos_completados || 0;
    if (!total) return guion;
    const pct = Math.round((hechos / total) * 100);
    return `<span class="sap-progress" title="${hechos} de ${total} puntos"><span class="sap-progress__bar"><span class="sap-progress__fill ${pct === 100 ? 'is-done' : ''}" style="width:${pct}%"></span></span><span class="sap-progress__txt">${hechos}/${total}</span></span>`;
  };
  const fechaLimiteHtml = (a) => {
    if (!a.fecha_limite) return guion;
    return esVencida(a)
      ? `<span class="sap-status sap-status--negative" title="Vencida">${ico('aviso')}${fechaCorta(a.fecha_limite)}</span>`
      : `<span class="sap-nowrap">${fechaCorta(a.fecha_limite)}</span>`;
  };
  const clienteHtml = (a) => a.cliente_folio ? `<span class="sap-folio">${esc(a.cliente_folio)}</span>${esc(a.cliente_nombre)}` : guion;

  // ==========================================================
  // ESTADO DE LA PANTALLA
  // ==========================================================
  let tecnicos = [];
  let todas = [];                       // todas las actividades que devuelve el servidor
  let filtros = { tecnico: '', tipo: '', prioridad: '', texto: '', estado: '' };
  let orden = { col: 'orden', dir: 'asc' };
  let drawer = { id: null, tab: 'general', datos: null };
  let puedeReordenar = false;
  let tempToast;

  if (esAdmin) {
    try { tecnicos = await API.get('/api/catalogos/tecnicos'); } catch (e) { /* no es crítico */ }
  }

  // ==========================================================
  // ESQUELETO DE LA PÁGINA
  // ==========================================================
  const opciones = (obj, vacio) => `<option value="">${vacio}</option>` + Object.entries(obj).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  cont.innerHTML = `
    <div class="sap-app">
      <header class="sap-pageheader">
        <div>
          <h1>Actividades</h1>
          <div class="sap-subtle" id="sap-resumen">Cargando…</div>
        </div>
        <div class="sap-pageheader__actions">
          <button class="sap-btn" id="sap-actualizar" title="Volver a consultar">${ico('ciclo')} Actualizar</button>
          ${esAdmin ? `<button class="sap-btn sap-btn--emphasized" id="sap-crear">${ico('mas')} Crear actividad</button>` : ''}
        </div>
      </header>

      <section class="sap-filterbar" aria-label="Filtros">
        ${esAdmin ? `<div class="sap-field"><label for="sap-f-tecnico">Técnico</label>
          <select class="sap-select" id="sap-f-tecnico"><option value="">Todos</option>${tecnicos.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('')}</select></div>` : ''}
        <div class="sap-field"><label for="sap-f-tipo">Categoría</label>
          <select class="sap-select" id="sap-f-tipo">${opciones(TIPOS, 'Todas')}</select></div>
        <div class="sap-field"><label for="sap-f-prioridad">Prioridad</label>
          <select class="sap-select" id="sap-f-prioridad">${opciones(PRIORIDADES, 'Todas')}</select></div>
        <div class="sap-field sap-field--search"><label for="sap-f-texto">Buscar</label>
          <div class="sap-searchbox">${ico('buscar')}<input class="sap-input" id="sap-f-texto" type="search" placeholder="${esAdmin ? 'Actividad, cliente, folio, técnico…' : 'Actividad, cliente, folio…'}" autocomplete="off" /></div></div>
        <div class="sap-filterbar__buttons">
          <button class="sap-btn sap-btn--emphasized" id="sap-ir">Ir</button>
          <button class="sap-btn" id="sap-restablecer">Restablecer</button>
        </div>
      </section>

      <nav class="sap-tabs" id="sap-tabs" aria-label="Estado"></nav>

      <div class="sap-content">
        <div class="sap-card">
          <div class="sap-toolbar">
            <div class="sap-toolbar__title" id="sap-titulo-tabla">Actividades</div>
            <div class="sap-toolbar__hint" id="sap-ayuda-orden"></div>
            <label class="sap-sortmovil">Ordenar por
              <select class="sap-select" id="sap-orden-movil">
                <option value="orden">Orden manual (#)</option><option value="prioridad">Prioridad</option><option value="estado">Estado</option>
                <option value="limite">Fecha límite</option><option value="titulo">Título (A-Z)</option>
              </select></label>
          </div>
          <div class="sap-tablewrap" id="sap-tabla"><div class="sap-empty">Cargando…</div></div>
        </div>
      </div>

      <div id="sap-drawer-host"></div>
      <div id="modal-contenedor"></div>
      <div class="sap-toast" id="sap-toast" hidden></div>
    </div>
  `;

  const $ = (id) => document.getElementById(id);
  const drawerHost = $('sap-drawer-host');
  const modalCont = $('modal-contenedor');

  // ---------- mensaje flotante ----------
  function toast(texto, tipo) {
    const t = $('sap-toast');
    t.textContent = texto;
    t.className = 'sap-toast' + (tipo === 'error' ? ' sap-toast--error' : '');
    t.hidden = false;
    clearTimeout(tempToast);
    tempToast = setTimeout(() => { t.hidden = true; }, tipo === 'error' ? 6000 : 3200);
  }

  // ==========================================================
  // CARGA Y FILTRADO
  // ==========================================================
  async function cargar() {
    try {
      todas = await API.get('/api/actividades');
      renderTabla();
      return true;
    } catch (err) {
      $('sap-tabla').innerHTML = `<div class="sap-error">${esc(err.message)}</div>`;
      $('sap-resumen').textContent = 'No se pudieron cargar las actividades';
      return false;
    }
  }

  function baseFiltrada() {
    const q = normalizar(filtros.texto);
    return todas.filter(a =>
      (!filtros.tecnico || String(a.tecnico_id) === filtros.tecnico) &&
      (!filtros.tipo || a.tipo === filtros.tipo) &&
      (!filtros.prioridad || a.prioridad === filtros.prioridad) &&
      (!q || normalizar([a.titulo, a.descripcion, a.cliente_folio, a.cliente_nombre, a.tecnico_nombre, a.notas_tecnico].join(' ')).includes(q))
    );
  }
  const hayFiltros = () => !!(filtros.tecnico || filtros.tipo || filtros.prioridad || filtros.texto || filtros.estado);

  const porOrdenManual = (a, b) => ((a.orden ?? 1e9) - (b.orden ?? 1e9)) || (a.id - b.id);
  const COMPARADORES = {
    orden: porOrdenManual,
    titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'es'),
    tipo: (a, b) => (TIPOS[a.tipo] || '').localeCompare(TIPOS[b.tipo] || '', 'es'),
    prioridad: (a, b) => RANGO_PRIORIDAD[a.prioridad] - RANGO_PRIORIDAD[b.prioridad],
    estado: (a, b) => RANGO_ESTADO[a.estado] - RANGO_ESTADO[b.estado],
    tecnico: (a, b) => String(a.tecnico_nombre || '').localeCompare(String(b.tecnico_nombre || ''), 'es'),
    limite: (a, b) => String(a.fecha_limite || '').localeCompare(String(b.fecha_limite || '')),
    avance: (a, b) => ((a.total_puntos ? a.puntos_completados / a.total_puntos : -1) - (b.total_puntos ? b.puntos_completados / b.total_puntos : -1))
  };
  const VALOR_VACIO = { limite: (a) => !a.fecha_limite };

  function ordenar(lista) {
    const cmp = COMPARADORES[orden.col] || porOrdenManual;
    const vacio = VALOR_VACIO[orden.col];
    const signo = orden.dir === 'asc' ? 1 : -1;
    return [...lista].sort((a, b) => {
      if (vacio) { const va = vacio(a), vb = vacio(b); if (va !== vb) return va ? 1 : -1; if (va && vb) return porOrdenManual(a, b); } // los vacíos siempre al final
      return (cmp(a, b) * signo) || porOrdenManual(a, b);
    });
  }

  // ==========================================================
  // RENDER: pestañas + tabla
  // ==========================================================
  function renderTabla() {
    const base = baseFiltrada();
    const conteo = {
      '': base.length,
      pendiente: base.filter(a => a.estado === 'pendiente').length,
      en_proceso: base.filter(a => a.estado === 'en_proceso').length,
      completada: base.filter(a => a.estado === 'completada').length,
      vencidas: base.filter(esVencida).length
    };
    $('sap-tabs').innerHTML = [['', 'Todas'], ['pendiente', 'Pendientes'], ['en_proceso', 'En proceso'], ['completada', 'Completadas'], ['vencidas', 'Vencidas']]
      .map(([id, txt]) => `<button class="sap-tab ${filtros.estado === id ? 'is-active' : ''} ${id === 'vencidas' && conteo.vencidas ? 'sap-tab--alert' : ''}" data-tab-estado="${id}">${txt}<span class="sap-tab__count">${conteo[id]}</span></button>`).join('');

    let lista = base;
    if (filtros.estado === 'vencidas') lista = base.filter(esVencida);
    else if (filtros.estado) lista = base.filter(a => a.estado === filtros.estado);
    lista = ordenar(lista);

    const posicion = new Map([...todas].sort(porOrdenManual).map((a, i) => [a.id, i + 1]));
    puedeReordenar = esAdmin && !hayFiltros() && orden.col === 'orden' && orden.dir === 'asc';

    const sinCompletar = todas.filter(a => a.estado !== 'completada').length;
    $('sap-resumen').textContent = `${todas.length} actividad${todas.length === 1 ? '' : 'es'} en total · ${sinCompletar} sin completar` + (conteo.vencidas ? ` · ${conteo.vencidas} vencida${conteo.vencidas === 1 ? '' : 's'}` : '');
    $('sap-titulo-tabla').innerHTML = `Actividades <span>(${lista.length})</span>`;
    $('sap-orden-movil').value = COMPARADORES[orden.col] && ['orden', 'prioridad', 'estado', 'limite', 'titulo'].includes(orden.col) ? orden.col : 'orden';
    $('sap-ayuda-orden').innerHTML = esAdmin
      ? (puedeReordenar ? `${ico('grip', 14)} Arrastra una fila para cambiar el orden`
        : `<span title="Para reordenar: quita los filtros y deja el orden por “#”">${ico('grip', 14)} Orden manual desactivado (hay filtros u otro orden)</span>`)
      : '';

    if (!lista.length) {
      $('sap-tabla').innerHTML = todas.length
        ? `<div class="sap-empty">${ico('buscar', 36)}<strong>Sin resultados</strong>Ninguna actividad coincide con los filtros.</div>`
        : `<div class="sap-empty">${ico('vacio', 36)}<strong>${esAdmin ? 'Aún no has creado ninguna actividad' : 'No tienes actividades asignadas'}</strong>${esAdmin ? 'Usa “Crear actividad” para empezar.' : 'Cuando la oficina te asigne una, aparecerá aquí.'}</div>`;
      return;
    }

    const COLS = [
      esAdmin && { id: null, cls: 'sap-col-handle', texto: '' },
      { id: 'orden', cls: 'sap-col-num', texto: '#' },
      { id: 'titulo', cls: 'sap-col-title', texto: 'Actividad' },
      { id: 'tipo', cls: 'sap-col-lg', texto: 'Categoría' },
      { id: 'prioridad', cls: 'sap-col-md', texto: 'Prioridad' },
      { id: 'estado', cls: 'sap-col-estado', texto: 'Estado' },
      esAdmin && { id: 'tecnico', cls: 'sap-col-lg', texto: 'Técnico' },
      { id: 'limite', cls: 'sap-col-md', texto: 'Fecha límite' },
      { id: 'avance', cls: 'sap-col-xl', texto: 'Avance' },
      { id: null, cls: 'sap-col-actions', texto: '' }
    ].filter(Boolean);

    const flecha = (id) => (orden.col === id && (id !== 'orden' || orden.dir === 'desc'))
      ? `<span class="sap-sort">${ico(orden.dir === 'asc' ? 'arriba' : 'abajo', 14)}</span>` : '';
    $('sap-tabla').innerHTML = `
      <table class="sap-table">
        <thead><tr>${COLS.map(c => `<th class="${c.cls} ${c.id ? 'is-sortable' : ''}" ${c.id ? `data-orden="${c.id}" aria-sort="${orden.col === c.id ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"` : ''}>${c.texto}${c.id ? flecha(c.id) : ''}</th>`).join('')}</tr></thead>
        <tbody>${lista.map(a => filaHtml(a, posicion.get(a.id))).join('')}</tbody>
      </table>`;
    if (puedeReordenar) activarArrastrar();
  }

  const fechaLocal = (ts) => new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });   // en la hora de quien lo ve

  function filaHtml(a, pos) {
    const simple = !(a.total_puntos > 0);
    const completarTxt = a.estado === 'completada' ? 'Reabrir' : 'Marcar como completada';
    return `
      <tr class="${drawer.id === a.id ? 'is-selected' : ''}" data-id="${a.id}" ${puedeReordenar ? 'draggable="true"' : ''}>
        ${esAdmin ? `<td class="sap-col-handle"><span class="sap-grip ${puedeReordenar ? '' : 'is-off'}" title="${puedeReordenar ? 'Arrastra para reordenar' : 'Quita los filtros y ordena por “#” para reordenar'}">${ico('grip')}</span></td>` : ''}
        <td class="sap-col-num">${pos}</td>
        <td class="sap-col-title">
          <div class="sap-title-line">
            <button class="sap-link" data-abrir="${a.id}">${esc(a.titulo)}</button>
            ${a.notas_tecnico ? `<span title="Nota del técnico: ${esc(a.notas_tecnico)}">${ico('nota', 15)}</span>` : ''}
            ${pinHtml(a)}
          </div>
          <div class="sap-sub">
            ${a.cliente_folio ? `<span><span class="sap-folio">${esc(a.cliente_folio)}</span>${esc(a.cliente_nombre)}</span>` : ''}
            <span class="sap-pi sap-pi-lg">${esc(TIPOS[a.tipo] || a.tipo)}</span>
            ${esAdmin ? `<span class="sap-pi sap-pi-lg">${esc(a.tecnico_nombre)}</span>` : ''}
            <span class="sap-pi sap-pi-md">Prioridad ${esc(PRIORIDADES[a.prioridad] || a.prioridad)}</span>
            ${a.fecha_limite ? `<span class="sap-pi sap-pi-md ${esVencida(a) ? 'sap-text-negative' : ''}">${esVencida(a) ? 'Vencida: ' : 'Límite '}${fechaCorta(a.fecha_limite)}</span>` : ''}
          </div>
        </td>
        <td class="sap-col-lg sap-nowrap">${esc(TIPOS[a.tipo] || a.tipo)}</td>
        <td class="sap-col-md">${prioridadHtml(a.prioridad)}</td>
        <td class="sap-col-estado">${estadoHtml(a.estado)}${a.estado === 'completada' && a.completado_en ? `<div class="sap-sub">${fechaLocal(a.completado_en)}</div>` : ''}</td>
        ${esAdmin ? `<td class="sap-col-lg"><span class="sap-ellipsis" title="${esc(a.tecnico_nombre)}">${esc(a.tecnico_nombre)}</span></td>` : ''}
        <td class="sap-col-md">${fechaLimiteHtml(a)}</td>
        <td class="sap-col-xl">${progresoHtml(a)}</td>
        <td class="sap-col-actions">
          ${simple ? `<button class="sap-iconbtn ${a.estado === 'completada' ? '' : 'sap-iconbtn--positive'}" data-completar="${a.id}" data-estado-actual="${a.estado}" title="${completarTxt}" aria-label="${completarTxt}">${ico(a.estado === 'completada' ? 'ciclo' : 'ok')}</button>` : ''}
          ${esAdmin ? `<button class="sap-iconbtn" data-editar="${a.id}" title="Editar" aria-label="Editar">${ico('lapiz')}</button>
                       <button class="sap-iconbtn sap-iconbtn--negative" data-borrar="${a.id}" title="Eliminar" aria-label="Eliminar">${ico('basura')}</button>` : ''}
        </td>
      </tr>`;
  }

  // ==========================================================
  // ARRASTRAR PARA REORDENAR (solo administrador, sin filtros)
  // ==========================================================
  function activarArrastrar() {
    const cuerpo = $('sap-tabla').querySelector('tbody');
    let idArrastrado = null;
    cuerpo.querySelectorAll('tr[draggable="true"]').forEach(fila => {
      fila.addEventListener('dragstart', (e) => { idArrastrado = fila.dataset.id; fila.classList.add('is-dragging'); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; });
      fila.addEventListener('dragend', () => { fila.classList.remove('is-dragging'); cuerpo.querySelectorAll('.is-dropzone').forEach(x => x.classList.remove('is-dropzone')); });
      fila.addEventListener('dragover', (e) => { e.preventDefault(); if (fila.dataset.id !== idArrastrado) fila.classList.add('is-dropzone'); });
      fila.addEventListener('dragleave', () => fila.classList.remove('is-dropzone'));
      fila.addEventListener('drop', async (e) => {
        e.preventDefault();
        fila.classList.remove('is-dropzone');
        if (!idArrastrado || idArrastrado === fila.dataset.id) return;
        const arrastrada = cuerpo.querySelector(`tr[data-id="${idArrastrado}"]`);
        const filas = [...cuerpo.querySelectorAll('tr')];
        if (filas.indexOf(arrastrada) < filas.indexOf(fila)) fila.after(arrastrada); else fila.before(arrastrada);
        const ids = [...cuerpo.querySelectorAll('tr')].map(f => Number(f.dataset.id));
        try { await API.put('/api/actividades/reordenar', { ids }); toast('Orden guardado'); }
        catch (err) { toast(err.message, 'error'); }
        cargar();
      });
    });
  }

  // ==========================================================
  // PANEL LATERAL DE DETALLE (estilo Object Page)
  // ==========================================================
  async function abrirDrawer(id, tab) {
    drawer = { id, tab: tab || 'general', datos: null };
    marcarFilaSeleccionada();
    drawerHost.innerHTML = `<div class="sap-backdrop" data-cerrar-drawer></div><aside class="sap-drawer" role="dialog" aria-label="Detalle de la actividad"><div class="sap-drawer__body"><div class="sap-empty">Cargando…</div></div></aside>`;
    try {
      const detalle = await API.get(`/api/actividades/${id}`);
      const fila = todas.find(x => x.id === id) || {};
      drawer.datos = { ...fila, ...detalle };
      if (!tab) drawer.tab = (drawer.datos.puntos && drawer.datos.puntos.length) ? 'checklist' : 'general';
      renderDrawer();
    } catch (err) {
      drawerHost.innerHTML = '';
      drawer = { id: null, tab: 'general', datos: null };
      marcarFilaSeleccionada();
      toast(err.message, 'error');
    }
  }
  function cerrarDrawer() { drawer = { id: null, tab: 'general', datos: null }; drawerHost.innerHTML = ''; marcarFilaSeleccionada(); }
  function marcarFilaSeleccionada() { document.querySelectorAll('.sap-table tbody tr').forEach(f => f.classList.toggle('is-selected', Number(f.dataset.id) === drawer.id)); }

  function renderDrawer() {
    const a = drawer.datos;
    const puntos = a.puntos || [];
    const hechos = puntos.filter(p => p.completado).length;
    const simple = puntos.length === 0;
    const tabs = [['general', 'General'], ['checklist', `Checklist${puntos.length ? ` (${hechos}/${puntos.length})` : ''}`], ['notas', 'Notas']];

    const attr = (titulo, valor) => `<div class="sap-attr"><dt>${titulo}</dt><dd>${valor || guion}</dd></div>`;
    let cuerpo = '';
    if (drawer.tab === 'general') {
      cuerpo = `
        ${esVencida(a) ? `<div class="sap-msg sap-msg--error">${ico('aviso')}<span>Esta actividad está <b>vencida</b>: su fecha límite fue el ${fechaCorta(a.fecha_limite)}.</span></div>` : ''}
        <div class="sap-section"><h3>Descripción</h3><div class="sap-text-block">${a.descripcion ? esc(a.descripcion) : '<span class="sap-subtle">Sin descripción.</span>'}</div></div>
        <div class="sap-section"><h3>Datos generales</h3>
          <dl class="sap-attrs" style="margin:0;">
            ${attr('Categoría', esc(TIPOS[a.tipo] || a.tipo))}
            ${attr('Prioridad', prioridadHtml(a.prioridad))}
            ${attr('Técnico asignado', esc(a.tecnico_nombre))}
            ${attr('Fecha límite', a.fecha_limite ? fechaLimiteHtml(a) : '')}
            ${attr('Cliente', a.cliente_folio ? clienteHtml(a) : '')}
            ${attr('Creada', `${fechaHoraCorta(a.creado_en)}${a.creado_por_nombre ? `<br><span class="sap-subtle" style="margin:0;">por ${esc(a.creado_por_nombre)}</span>` : ''}`)}
            ${attr('Completada', a.completado_en ? `<span class="sap-status sap-status--positive">${ico('ok')}${fechaHoraCorta(a.completado_en)}</span>` : '')}
            ${attr('Instalación registrada', a.instalacion_relacionada_fecha ? `<span class="sap-status sap-status--positive">${ico('ok')}${fechaCorta(a.instalacion_relacionada_fecha)}</span>` : '')}
          </dl>
        </div>
        <div class="sap-section"><h3>Ubicación</h3>
          ${(a.latitud && a.longitud)
            ? `<span class="sap-status ${a.ubicacion_confirmada ? 'sap-status--positive' : 'sap-status--critical'}">${ico('pin')}${a.ubicacion_confirmada ? 'Confirmada en sitio' : 'Estimada (marcada por oficina)'}</span>
               <div style="margin-top:8px;"><a class="sap-link" href="${linkGoogleMaps(a.latitud, a.longitud)}" target="_blank" rel="noopener">Abrir en el mapa</a>
               <span class="sap-subtle" style="margin-left:8px;">${Number(a.latitud).toFixed(5)}, ${Number(a.longitud).toFixed(5)}</span></div>`
            : '<span class="sap-subtle">Sin ubicación marcada.</span>'}
        </div>`;
    } else if (drawer.tab === 'checklist') {
      cuerpo = `
        ${puntos.length ? `<div style="margin-bottom:14px;">${progresoHtml({ total_puntos: puntos.length, puntos_completados: hechos })}</div>
          <div class="sap-checklist">
            ${puntos.map(p => `
              <label class="sap-check ${p.completado ? 'is-done' : ''}">
                <input type="checkbox" data-punto="${p.id}" ${p.completado ? 'checked' : ''} />
                <span><span class="sap-check__txt">${esc(p.descripcion)}</span>
                  ${p.completado && p.completado_en ? `<span class="sap-check__meta">${ico('check', 13)} ${fechaHoraCorta(p.completado_en)}${p.completado_por_nombre ? ` — ${esc(p.completado_por_nombre)}` : ''}</span>` : ''}</span>
              </label>`).join('')}
          </div>`
          : `<div class="sap-empty" style="padding:28px 0;">${ico('lista', 32)}<strong>Esta actividad no tiene checklist</strong>${esAdmin ? 'Puedes agregar puntos abajo; sin puntos se cierra con “Marcar como completada”.' : 'Se cierra con “Marcar como completada”.'}</div>`}
        ${esAdmin ? `<div class="sap-addrow"><input class="sap-input" id="sap-nuevo-punto" placeholder="Nuevo punto del checklist…" maxlength="500" /><button class="sap-btn" id="sap-agregar-punto">${ico('mas')} Agregar</button></div>` : ''}`;
    } else {
      cuerpo = `
        <div class="sap-section"><h3>Notas del técnico</h3>
          <textarea class="sap-textarea" id="sap-notas" rows="6" placeholder="Observaciones sobre cómo salió, incidencias, materiales usados, etc.">${esc(a.notas_tecnico || '')}</textarea>
          <div style="margin-top:10px;"><button class="sap-btn sap-btn--emphasized" id="sap-guardar-notas">Guardar notas</button></div>
        </div>`;
    }

    drawerHost.innerHTML = `
      <div class="sap-backdrop" data-cerrar-drawer></div>
      <aside class="sap-drawer" role="dialog" aria-label="Detalle de la actividad">
        <div class="sap-drawer__head">
          <div class="sap-drawer__top">
            <div><div class="sap-drawer__kicker">Actividad · ${esc(TIPOS[a.tipo] || a.tipo)}</div><h2 class="sap-drawer__title">${esc(a.titulo)}</h2></div>
            <div class="sap-drawer__tools">
              ${esAdmin ? `<button class="sap-iconbtn" data-editar-drawer title="Editar" aria-label="Editar">${ico('lapiz', 18)}</button>
                           <button class="sap-iconbtn sap-iconbtn--negative" data-borrar-drawer title="Eliminar" aria-label="Eliminar">${ico('basura', 18)}</button>` : ''}
              <button class="sap-iconbtn" data-cerrar-drawer title="Cerrar" aria-label="Cerrar">${ico('cerrar', 18)}</button>
            </div>
          </div>
          <div class="sap-drawer__badges">${estadoHtml(a.estado)}${prioridadHtml(a.prioridad)}${esAdmin ? `<span class="sap-subtle" style="margin:0;">${esc(a.tecnico_nombre)}</span>` : ''}</div>
          <nav class="sap-tabs">${tabs.map(([id, txt]) => `<button class="sap-tab ${drawer.tab === id ? 'is-active' : ''}" data-drawer-tab="${id}">${txt}</button>`).join('')}</nav>
        </div>
        <div class="sap-drawer__body">${cuerpo}</div>
        <div class="sap-drawer__foot">
          <div>${simple ? `<button class="sap-btn ${a.estado === 'completada' ? '' : 'sap-btn--emphasized'}" data-completar-drawer data-estado-actual="${a.estado}">${a.estado === 'completada' ? 'Reabrir actividad' : 'Marcar como completada'}</button>` : ''}</div>
          <button class="sap-btn" data-cerrar-drawer>Cerrar</button>
        </div>
      </aside>`;
  }

  async function refrescarDrawer(tab) {
    const id = drawer.id;
    await cargar();
    if (id && drawer.id === id) await abrirDrawer(id, tab || drawer.tab);
  }

  // ==========================================================
  // ACCIONES
  // ==========================================================
  async function alternarCompletada(id, estadoActual) {
    const nuevo = estadoActual === 'completada' ? 'pendiente' : 'completada';
    try {
      await API.put(`/api/actividades/${id}/estado`, { estado: nuevo });
      toast(nuevo === 'completada' ? 'Actividad completada' : 'Actividad reabierta');
      if (drawer.id === id) await refrescarDrawer(); else await cargar();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function eliminar(id) {
    const a = todas.find(x => x.id === id);
    if (!confirm(`¿Eliminar la actividad${a ? ` “${a.titulo}”` : ''}?\nSe borra junto con todos sus puntos.`)) return;
    try {
      await API.del(`/api/actividades/${id}`);
      if (drawer.id === id) cerrarDrawer();
      toast('Actividad eliminada');
      await cargar();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function agregarPunto() {
    const input = $('sap-nuevo-punto');
    const texto = input && input.value.trim();
    if (!texto) { if (input) input.focus(); return; }
    try {
      await API.post(`/api/actividades/${drawer.id}/puntos`, { descripcion: texto });
      toast('Punto agregado');
      await refrescarDrawer('checklist');
    } catch (err) { toast(err.message, 'error'); }
  }

  function leerFiltros() {
    filtros.tecnico = $('sap-f-tecnico') ? $('sap-f-tecnico').value : '';
    filtros.tipo = $('sap-f-tipo').value;
    filtros.prioridad = $('sap-f-prioridad').value;
    filtros.texto = $('sap-f-texto').value.trim();
  }
  function restablecerFiltros() {
    filtros = { tecnico: '', tipo: '', prioridad: '', texto: '', estado: '' };
    orden = { col: 'orden', dir: 'asc' };
    if ($('sap-f-tecnico')) $('sap-f-tecnico').value = '';
    $('sap-f-tipo').value = ''; $('sap-f-prioridad').value = ''; $('sap-f-texto').value = '';
    renderTabla();
  }

  // ==========================================================
  // EVENTOS (delegados: sobreviven a los re-renders)
  // ==========================================================
  cont.addEventListener('click', async (e) => {
    const t = e.target;
    const q = (sel) => t.closest(sel);

    if (q('[data-sin-abrir]')) { e.stopPropagation(); return; }                       // enlace del mapa: no abre el panel

    // --- encabezado y filtros ---
    if (q('[data-tab-estado]')) { filtros.estado = q('[data-tab-estado]').dataset.tabEstado; renderTabla(); return; }
    if (q('#sap-actualizar')) { await cargar(); toast('Lista actualizada'); return; }
    if (q('#sap-ir')) { leerFiltros(); renderTabla(); return; }
    if (q('#sap-restablecer')) { restablecerFiltros(); return; }
    if (q('#sap-crear')) { abrirDialogo(null); return; }

    // --- ordenar por columna: asc → desc → vuelve al orden manual ---
    const th = q('th[data-orden]');
    if (th) {
      const col = th.dataset.orden;
      if (col === 'orden') orden = { col: 'orden', dir: (orden.col === 'orden' && orden.dir === 'asc') ? 'desc' : 'asc' };
      else if (orden.col !== col) orden = { col, dir: 'asc' };
      else if (orden.dir === 'asc') orden = { col, dir: 'desc' };
      else orden = { col: 'orden', dir: 'asc' };
      renderTabla();
      return;
    }

    // --- acciones de fila ---
    if (q('[data-completar]')) { const b = q('[data-completar]'); await alternarCompletada(Number(b.dataset.completar), b.dataset.estadoActual); return; }
    if (q('[data-editar]')) { const a = todas.find(x => x.id === Number(q('[data-editar]').dataset.editar)); if (a) abrirDialogo(a); return; }
    if (q('[data-borrar]')) { await eliminar(Number(q('[data-borrar]').dataset.borrar)); return; }
    if (q('[data-abrir]')) { abrirDrawer(Number(q('[data-abrir]').dataset.abrir)); return; }
    const fila = q('.sap-table tbody tr');
    if (fila && !q('button, a, input, label')) { abrirDrawer(Number(fila.dataset.id)); return; }   // clic en cualquier parte de la fila

    // --- panel de detalle ---
    if (q('[data-cerrar-drawer]')) { cerrarDrawer(); return; }
    if (q('[data-drawer-tab]')) { drawer.tab = q('[data-drawer-tab]').dataset.drawerTab; renderDrawer(); return; }
    if (q('[data-editar-drawer]')) { abrirDialogo(drawer.datos); return; }
    if (q('[data-borrar-drawer]')) { await eliminar(drawer.id); return; }
    if (q('[data-completar-drawer]')) { await alternarCompletada(drawer.id, q('[data-completar-drawer]').dataset.estadoActual); return; }
    if (q('#sap-agregar-punto')) { await agregarPunto(); return; }
    if (q('#sap-guardar-notas')) {
      const btn = q('#sap-guardar-notas'); btn.disabled = true;
      const texto = $('sap-notas').value.trim();
      try {
        await API.put(`/api/actividades/${drawer.id}/notas`, { notas_tecnico: texto });
        toast('Notas guardadas');
        drawer.datos.notas_tecnico = texto;
        await cargar();
      } catch (err) { toast(err.message, 'error'); }
      btn.disabled = false;
      return;
    }
  });

  cont.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.matches('[data-punto]')) {                                                   // marcar / desmarcar un punto del checklist
      const marcado = t.checked;
      try {
        await API.put(`/api/actividades/puntos/${t.dataset.punto}`, { completado: marcado });
        await refrescarDrawer('checklist');
      } catch (err) { t.checked = !marcado; toast(err.message, 'error'); }
      return;
    }
    if (t.id === 'sap-f-tecnico' || t.id === 'sap-f-tipo' || t.id === 'sap-f-prioridad') { leerFiltros(); renderTabla(); }
    if (t.id === 'sap-orden-movil') { orden = { col: t.value, dir: 'asc' }; renderTabla(); }
  });

  let debounceTexto;
  cont.addEventListener('input', (e) => {
    if (e.target.id !== 'sap-f-texto') return;
    clearTimeout(debounceTexto);
    debounceTexto = setTimeout(() => { leerFiltros(); renderTabla(); }, 220);
  });
  cont.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && e.target.id === 'sap-f-texto') { leerFiltros(); renderTabla(); }
    if (e.key === 'Enter' && e.target.id === 'sap-nuevo-punto') { e.preventDefault(); await agregarPunto(); }
  });
  // Esc cierra el panel de detalle (si hay un diálogo abierto, Esc cierra primero el diálogo)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.id && !modalCont.innerHTML.trim()) cerrarDrawer();
  }, true);

  // ==========================================================
  // DIÁLOGO: crear / editar actividad (solo administrador)
  // ==========================================================
  function abrirDialogo(a) {
    const nueva = !a;
    const lat0 = a && a.latitud ? Number(a.latitud) : null, lng0 = a && a.longitud ? Number(a.longitud) : null;
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal" role="dialog" aria-label="${nueva ? 'Crear actividad' : 'Editar actividad'}">
          <div class="modal-cabecera">
            <h3>${nueva ? 'Crear actividad' : 'Editar actividad'}</h3>
            <button class="cerrar-modal" id="cerrar-modal" aria-label="Cerrar">${ico('cerrar', 18)}</button>
          </div>
          <div class="modal-cuerpo">
            <div id="fa-error" class="sap-msg sap-msg--error" hidden></div>
            <div class="sap-form">
              <h4>General</h4>
              <div class="sap-field is-wide"><label class="sap-req" for="fa-titulo">Título</label>
                <input class="sap-input" id="fa-titulo" value="${a ? esc(a.titulo) : ''}" placeholder="Ej. Revisar señal en Popotla" maxlength="150" /></div>
              <div class="sap-field is-wide"><label for="fa-descripcion">Descripción</label>
                <textarea class="sap-textarea" id="fa-descripcion" rows="2">${a ? esc(a.descripcion || '') : ''}</textarea></div>

              <h4>Asignación</h4>
              <div class="sap-field"><label class="sap-req" for="fa-tecnico">Asignar a</label>
                <select class="sap-select" id="fa-tecnico">${tecnicos.map(t => `<option value="${t.id}" ${a && String(t.id) === String(a.tecnico_id) ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></div>
              <div class="sap-field"><label for="fa-tipo">Categoría</label>
                <select class="sap-select" id="fa-tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${(a ? a.tipo : 'instalacion') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
              <div class="sap-field"><label for="fa-prioridad">Prioridad</label>
                <select class="sap-select" id="fa-prioridad">${Object.entries(PRIORIDADES).map(([k, v]) => `<option value="${k}" ${(a ? a.prioridad : 'media') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
              <div class="sap-field"><label for="fa-fecha-limite">Fecha límite</label>
                <input class="sap-input" type="date" id="fa-fecha-limite" value="${a && a.fecha_limite ? String(a.fecha_limite).slice(0, 10) : ''}" /></div>

              <h4>Cliente</h4>
              <div class="sap-field is-wide" style="position:relative;"><label for="fa-cliente-busqueda">Cliente relacionado</label>
                <input class="sap-input" id="fa-cliente-busqueda" autocomplete="off" placeholder="Escribe el nombre o folio para buscar…" value="${a && a.cliente_folio ? esc(`${a.cliente_folio} — ${a.cliente_nombre}`) : ''}" />
                <input type="hidden" id="fa-cliente-folio" value="${a && a.cliente_folio ? esc(a.cliente_folio) : ''}" />
                <div id="fa-cliente-sugerencias" class="sap-sugerencias" hidden></div></div>

              <h4>Ubicación</h4>
              <div class="sap-field is-wide">
                <div id="fa-mapa" class="mapa-selector"></div>
                <div class="ubicacion-campo" style="margin-top:8px;">
                  <input class="sap-input" id="fa-texto" placeholder="O pega aquí un link de Google Maps" />
                  <button type="button" class="sap-btn" id="fa-usar-mi-ubicacion">${ico('pin')} Usar la mía</button>
                </div>
                <div id="fa-preview" class="ubicacion-vista-previa oculto"></div>
              </div>

              ${nueva ? `<h4>Checklist</h4>
              <div class="sap-field is-wide"><label>Puntos (opcional: déjalo vacío si es una tarea simple)</label>
                <div id="fa-puntos"></div>
                <div><button type="button" class="sap-btn sap-btn--sm" id="fa-agregar-punto">${ico('mas')} Agregar punto</button></div></div>` : ''}
            </div>
          </div>
          <div class="modal-pie">
            <button class="sap-btn" id="fa-cancelar">Cancelar</button>
            <button class="sap-btn sap-btn--emphasized" id="fa-guardar">${nueva ? 'Crear' : 'Guardar'}</button>
          </div>
        </div>
      </div>`;

    let ubicacion = { lat: lat0, lng: lng0 };
    let mapa = { remove() {} };
    try {
      mapa = activarSelectorUbicacion('fa', lat0, lng0, (la, ln) => { ubicacion = { lat: la, lng: ln }; });
    } catch (err) {
      // Si el mapa no carga (por ejemplo, sin internet) el formulario sigue funcionando; solo se pierde la ubicación.
      $('fa-mapa').innerHTML = '<div class="sap-msg sap-msg--warning" style="margin:0;">No se pudo cargar el mapa. Revisa tu conexión; puedes guardar la actividad sin ubicación.</div>';
      $('fa-mapa').style.height = 'auto';
      $('fa-usar-mi-ubicacion').disabled = true;
    }
    const cerrar = () => { try { mapa.remove(); } catch (e) { /* ya no existe */ } modalCont.innerHTML = ''; };
    $('cerrar-modal').addEventListener('click', cerrar);
    $('fa-cancelar').addEventListener('click', cerrar);
    $('fa-titulo').focus();

    // checklist inicial (solo al crear)
    const puntosCont = $('fa-puntos');
    const nuevaFilaPunto = () => {
      const fila = document.createElement('div'); fila.className = 'sap-puntofila';
      fila.innerHTML = `<input class="sap-input" placeholder="Ej. Revisar el nodo" /><button type="button" class="sap-iconbtn sap-iconbtn--negative" aria-label="Quitar">${ico('cerrar')}</button>`;
      fila.querySelector('button').addEventListener('click', () => fila.remove());
      puntosCont.appendChild(fila);
    };
    if (nueva) { $('fa-agregar-punto').addEventListener('click', nuevaFilaPunto); nuevaFilaPunto(); }

    // autocompletar de cliente
    const inputBusq = $('fa-cliente-busqueda'), inputFolio = $('fa-cliente-folio'), lista = $('fa-cliente-sugerencias');
    let debCliente;
    inputBusq.addEventListener('input', () => {
      inputFolio.value = '';
      clearTimeout(debCliente);
      const texto = inputBusq.value.trim();
      if (texto.length < 2) { lista.hidden = true; lista.innerHTML = ''; return; }
      debCliente = setTimeout(async () => {
        try {
          const r = await API.get('/api/clientes?q=' + encodeURIComponent(texto));
          lista.innerHTML = r.length
            ? r.slice(0, 8).map(c => `<div data-folio="${esc(c.cliente_id)}" data-nombre="${esc(c.nombre)}"><span class="sap-folio">${esc(c.cliente_id)}</span>${esc(c.nombre)}</div>`).join('')
            : '<div style="cursor:default;color:var(--sap-text-2);">Sin resultados</div>';
          lista.hidden = false;
        } catch (err) { /* silencioso */ }
      }, 300);
    });
    lista.addEventListener('click', (e) => {
      const it = e.target.closest('[data-folio]'); if (!it) return;
      inputBusq.value = `${it.dataset.folio} — ${it.dataset.nombre}`; inputFolio.value = it.dataset.folio; lista.hidden = true;
    });

    $('fa-guardar').addEventListener('click', async (e) => {
      const err = $('fa-error');
      const mostrar = (m) => { err.textContent = m; err.hidden = false; };
      const titulo = $('fa-titulo').value.trim();
      if (!titulo) { mostrar('El título es obligatorio.'); $('fa-titulo').focus(); return; }
      if (!$('fa-tecnico').value) { mostrar('Elige a qué técnico se le asigna.'); return; }
      const payload = {
        titulo,
        descripcion: $('fa-descripcion').value.trim(),
        tecnico_id: Number($('fa-tecnico').value),
        prioridad: $('fa-prioridad').value,
        tipo: $('fa-tipo').value,
        fecha_limite: $('fa-fecha-limite').value || null,
        cliente_folio: inputFolio.value || inputBusq.value.trim(),
        latitud: ubicacion.lat,
        longitud: ubicacion.lng
      };
      if (nueva) payload.puntos = [...puntosCont.querySelectorAll('input')].map(i => i.value.trim()).filter(Boolean);
      const btn = e.currentTarget; btn.disabled = true;
      try {
        if (nueva) await API.post('/api/actividades', payload); else await API.put(`/api/actividades/${a.id}`, payload);
        cerrar();
        toast(nueva ? 'Actividad creada' : 'Cambios guardados');
        if (!nueva && drawer.id === a.id) await refrescarDrawer(); else await cargar();
      } catch (e2) { mostrar(e2.message); btn.disabled = false; }
    });
  }

  await cargar();
})();
