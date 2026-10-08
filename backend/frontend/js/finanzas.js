(async function () {
  const usuario = protegerPagina(['admin']);
  if (!usuario) return;

  renderLayout('finanzas', 'Finanzas');
  const cont = document.getElementById('pagina-contenido');

  let categorias = [];
  let categoriasIngresos = [];
  const porPagina = 10;
  let listaEgresosCompleta = [];
  let paginaEgresos = 1;
  let listaIngresosCompleta = [];
  let paginaIngresos = 1;
  let egresosCrudos = [];      // lo que devolvió el servidor para el mes elegido (sin filtrar por texto/categoría)
  let ingresosCrudos = [];
  let mesSeleccionado = mesActualStr(); // 'YYYY-MM'
  let filtroTexto = '';
  let filtroCatIngreso = '';
  let filtroCatEgreso = '';
  let graficaIE = null;
  let graficaCat = null;

  cont.innerHTML = `<div class="cargando">Cargando finanzas…</div>`;

  try {
    [categorias, categoriasIngresos] = await Promise.all([
      API.get('/api/catalogos/egresos-categorias'),
      API.get('/api/catalogos/ingresos-categorias')
    ]);
  } catch (err) {
    cont.innerHTML = `<div class="error-msg">${err.message}</div>`;
    return;
  }

  cont.innerHTML = `
    <div class="tarjeta">
      <div class="tarjeta-cuerpo">
        <div class="flex-gap" style="gap:12px;">
          <div class="flex-gap" style="gap:6px;">
            <button class="btn btn-secundario btn-sm btn-icono" id="f-mes-prev" title="Mes anterior">‹</button>
            <input type="month" id="f-mes" value="${mesSeleccionado}" style="padding:8px 10px; border:1px solid var(--borde); border-radius:6px;" />
            <button class="btn btn-secundario btn-sm btn-icono" id="f-mes-next" title="Mes siguiente">›</button>
            <button class="btn btn-secundario btn-sm" id="f-mes-hoy">Mes actual</button>
          </div>
          <input type="text" id="f-buscar" placeholder="Buscar concepto, nota o cliente…" style="min-width:220px; padding:9px 12px; border:1px solid var(--borde); border-radius:6px;" />
          <select id="f-cat-ingreso" style="padding:9px 12px; border:1px solid var(--borde); border-radius:6px;">
            <option value="">Ingresos: todas las categorías</option>
            ${categoriasIngresos.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
          </select>
          <select id="f-cat-egreso" style="padding:9px 12px; border:1px solid var(--borde); border-radius:6px;">
            <option value="">Egresos: todas las categorías</option>
            ${categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
          </select>
        </div>
        <div class="texto-gris" style="font-size:11.5px; margin-top:8px;">
          El mes elegido mueve los totales, las gráficas y las tablas. La búsqueda y las categorías filtran las tablas de abajo.
        </div>
      </div>
    </div>

    <div class="grid-kpi" id="kpis-finanzas"></div>

    <div class="tarjeta">
      <div class="tarjeta-cabecera"><h3 id="titulo-grafica-ie">Ingresos vs egresos (últimos 6 meses)</h3></div>
      <div class="tarjeta-cuerpo">
        <div class="grafica-contenedor"><canvas id="grafica-ie"></canvas></div>
      </div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cabecera"><h3 id="titulo-grafica-cat">Egresos del mes por categoría</h3></div>
      <div class="tarjeta-cuerpo">
        <div class="grafica-contenedor"><canvas id="grafica-categorias"></canvas></div>
      </div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cabecera">
        <h3>💰 Ingresos extra (instalaciones, reconexiones, etc.)</h3>
        <button class="btn btn-verde btn-sm" id="btn-nuevo-ingreso-extra">+ Registrar ingreso</button>
      </div>
      <div class="tarjeta-cuerpo tabla-envoltura" id="tabla-ingresos-extra">
        <div class="cargando">Cargando…</div>
      </div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cabecera">
        <h3>Egresos registrados</h3>
        <button class="btn btn-verde btn-sm" id="btn-nuevo-egreso">+ Registrar egreso</button>
      </div>
      <div class="tarjeta-cuerpo tabla-envoltura" id="tabla-egresos">
        <div class="cargando">Cargando…</div>
      </div>
    </div>

    <div id="modal-contenedor"></div>
  `;

  document.getElementById('btn-nuevo-egreso').addEventListener('click', () => abrirModalEgreso());
  document.getElementById('btn-nuevo-ingreso-extra').addEventListener('click', () => abrirModalIngresoExtra());

  conectarFiltros();
  await recargarTodo();

  // ---------- Filtros ----------
  function mesActualStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function moverMes(mesStr, delta) {
    const [a, m] = mesStr.split('-').map(Number);
    const d = new Date(a, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function nombreMesLargo(mesStr) {
    const [a, m] = mesStr.split('-').map(Number);
    return new Date(a, m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  }

  function normalizar(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function cambiarMes(nuevoMes) {
    if (!/^\d{4}-\d{2}$/.test(nuevoMes) || nuevoMes === mesSeleccionado) return;
    mesSeleccionado = nuevoMes;
    document.getElementById('f-mes').value = nuevoMes;
    recargarTodo();
  }

  // Si guardas un registro con fecha de otro mes, el filtro salta a ese mes para que lo veas.
  function irAMesDeFecha(fechaStr) {
    const m = String(fechaStr || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m) && m !== mesSeleccionado) { cambiarMes(m); return true; }
    return false;
  }

  function conectarFiltros() {
    document.getElementById('f-mes').addEventListener('change', (e) => cambiarMes(e.target.value || mesActualStr()));
    document.getElementById('f-mes-prev').addEventListener('click', () => cambiarMes(moverMes(mesSeleccionado, -1)));
    document.getElementById('f-mes-next').addEventListener('click', () => cambiarMes(moverMes(mesSeleccionado, 1)));
    document.getElementById('f-mes-hoy').addEventListener('click', () => cambiarMes(mesActualStr()));

    let t;
    document.getElementById('f-buscar').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { filtroTexto = e.target.value; aplicarFiltrosEgresos(); aplicarFiltrosIngresos(); }, 250);
    });
    document.getElementById('f-cat-ingreso').addEventListener('change', (e) => { filtroCatIngreso = e.target.value; aplicarFiltrosIngresos(); });
    document.getElementById('f-cat-egreso').addEventListener('change', (e) => { filtroCatEgreso = e.target.value; aplicarFiltrosEgresos(); });
  }

  function actualizarTitulos() {
    const nombre = nombreMesLargo(mesSeleccionado);
    document.getElementById('titulo-grafica-ie').textContent = `Ingresos vs egresos (6 meses hasta ${nombre})`;
    document.getElementById('titulo-grafica-cat').textContent = `Egresos de ${nombre} por categoría`;
  }

  async function recargarTodo() {
    actualizarTitulos();
    await refrescarResumen();
    await cargarEgresos();
    await cargarIngresosExtra();
  }

  // KPIs + gráficas. Si las gráficas fallan (ej. no cargó la librería), no debe tumbar
  // el resto de la página: las tablas de abajo son más importantes que la gráfica.
  async function refrescarResumen() {
    try { await cargarKpis(); } catch (err) { console.error('No se pudieron cargar los totales:', err); }
    try {
      await cargarGraficas();
    } catch (err) {
      console.error('No se pudieron cargar las gráficas:', err);
      const canvas = document.getElementById('grafica-ie');
      if (canvas) {
        canvas.closest('.tarjeta').querySelector('.tarjeta-cuerpo').innerHTML =
          `<div class="error-msg">No se pudo cargar la gráfica (recarga la página; si persiste, avísame).</div>`;
      }
    }
  }

  async function cargarKpis() {
    const resumen = await API.get(`/api/finanzas/resumen-mes?mes=${mesSeleccionado}`);
    document.getElementById('kpis-finanzas').innerHTML = `
      <div class="kpi borde-verde">
        <div class="kpi-etiqueta">Ingresos de ${nombreMesLargo(mesSeleccionado)}</div>
        <div class="kpi-valor">${mxn(resumen.ingresos)}</div>
        <div class="texto-gris" style="font-size:11px; margin-top:2px;">Mensualidades ${mxn(resumen.ingresos_mensualidades)} · Extra ${mxn(resumen.ingresos_extra)}</div>
      </div>
      <div class="kpi borde-rojo"><div class="kpi-etiqueta">Egresos de ${nombreMesLargo(mesSeleccionado)}</div><div class="kpi-valor">${mxn(resumen.egresos)}</div></div>
      <div class="kpi ${resumen.balance >= 0 ? 'borde-verde' : 'borde-rojo'}"><div class="kpi-etiqueta">Balance</div><div class="kpi-valor">${mxn(resumen.balance)}</div></div>
      <div class="kpi borde-azul"><div class="kpi-etiqueta">Clientes activos</div><div class="kpi-valor">${resumen.clientes_activos}</div><div class="texto-gris" style="font-size:11px; margin-top:2px;">al día de hoy</div></div>
    `;
  }

  async function cargarGraficas() {
    const { ingresos, egresos } = await API.get(`/api/finanzas/resumen-mensual?meses=6&mes=${mesSeleccionado}`);
    // Los 6 meses que terminan en el mes elegido (aunque algún mes no tenga movimientos)
    const meses = [5, 4, 3, 2, 1, 0].map(n => moverMes(mesSeleccionado, -n));

    const mapaIngresos = Object.fromEntries(ingresos.map(i => [i.mes, Number(i.total)]));
    const mapaEgresos = Object.fromEntries(egresos.map(e => [e.mes, Number(e.total)]));

    if (graficaIE) { graficaIE.destroy(); graficaIE = null; }
    graficaIE = new Chart(document.getElementById('grafica-ie'), {
      type: 'bar',
      data: {
        labels: meses.map(formatearMes),
        datasets: [
          { label: 'Ingresos', data: meses.map(m => mapaIngresos[m] || 0), backgroundColor: '#2FA86A' },
          { label: 'Egresos', data: meses.map(m => mapaEgresos[m] || 0), backgroundColor: '#C94F4F' }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    const categoriasData = await API.get(`/api/finanzas/egresos-por-categoria?mes=${mesSeleccionado}`);
    const conDatos = categoriasData.filter(c => Number(c.total) > 0);

    if (graficaCat) { graficaCat.destroy(); graficaCat = null; }
    graficaCat = new Chart(document.getElementById('grafica-categorias'), {
      type: 'doughnut',
      data: {
        labels: (conDatos.length ? conDatos : categoriasData).map(c => c.categoria),
        datasets: [{
          data: (conDatos.length ? conDatos : categoriasData).map(c => Number(c.total)),
          backgroundColor: ['#1E93D4','#3E9E6D','#C9962B','#D4722F','#C94F4F','#6B7A85','#146190']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });
  }

  async function cargarEgresos() {
    const tabla = document.getElementById('tabla-egresos');
    try {
      egresosCrudos = await API.get(`/api/finanzas/egresos?mes=${mesSeleccionado}`);
      aplicarFiltrosEgresos();
    } catch (err) {
      tabla.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  }

  function aplicarFiltrosEgresos() {
    const q = normalizar(filtroTexto);
    listaEgresosCompleta = egresosCrudos.filter(e =>
      (!filtroCatEgreso || String(e.categoria_id) === filtroCatEgreso) &&
      (!q || normalizar(`${e.concepto} ${e.notas || ''} ${e.categoria_nombre || ''}`).includes(q))
    );
    paginaEgresos = 1;
    renderTablaEgresosPaginada();
  }

  function aplicarFiltrosIngresos() {
    const q = normalizar(filtroTexto);
    listaIngresosCompleta = ingresosCrudos.filter(i =>
      (!filtroCatIngreso || String(i.categoria_id) === filtroCatIngreso) &&
      (!q || normalizar(`${i.concepto} ${i.notas || ''} ${i.categoria_nombre || ''} ${i.cliente_nombre || ''} ${i.cliente_folio || ''}`).includes(q))
    );
    paginaIngresos = 1;
    renderTablaIngresosPaginada();
  }

  function renderTablaEgresosPaginada() {
    const tabla = document.getElementById('tabla-egresos');

    if (!listaEgresosCompleta.length) {
      tabla.innerHTML = `<div class="estado-vacio">${egresosCrudos.length ? 'Ningún egreso coincide con esos filtros.' : `No hay egresos registrados en ${nombreMesLargo(mesSeleccionado)}.`}</div>`;
      return;
    }

    const totalPaginas = Math.max(1, Math.ceil(listaEgresosCompleta.length / porPagina));
    paginaEgresos = Math.min(Math.max(1, paginaEgresos), totalPaginas);
    const inicio = (paginaEgresos - 1) * porPagina;
    const egresos = listaEgresosCompleta.slice(inicio, inicio + porPagina);

    tabla.innerHTML = `
        <table class="tabla">
          <thead><tr><th>Concepto</th><th>Categoría</th><th>Monto</th><th>Fecha</th><th>Comprobante</th><th></th></tr></thead>
          <tbody>
            ${egresos.map(e => `
              <tr>
                <td class="celda-tarjeta-titulo">${e.concepto}</td>
                <td data-label="Categoría">${e.categoria_nombre || '—'}</td>
                <td data-label="Monto">${mxn(e.monto)}</td>
                <td data-label="Fecha">${fechaCorta(e.fecha)}</td>
                <td data-label="Comprobante">${e.comprobante_url ? `<a href="${e.comprobante_url}" target="_blank">Ver</a>` : '—'}</td>
                <td class="celda-acciones-movil">
                  <div class="fila-acciones">
                    <button class="btn btn-secundario btn-sm btn-icono" data-editar-egreso="${e.id}" title="Editar">✏️</button>
                    <button class="btn btn-peligro btn-sm btn-icono" data-borrar="${e.id}" title="Eliminar">🗑️</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="paginacion">
          <div class="paginacion-info">Mostrando ${inicio + 1}–${Math.min(inicio + porPagina, listaEgresosCompleta.length)} de ${listaEgresosCompleta.length}</div>
          <div class="paginacion-botones" id="paginacion-egresos"></div>
        </div>
      `;
    tabla.querySelectorAll('[data-borrar]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este egreso?')) return;
        try {
          await API.del(`/api/finanzas/egresos/${btn.dataset.borrar}`);
          cargarEgresos(); refrescarResumen();
        } catch (err) { alert(err.message); }
      });
    });
    tabla.querySelectorAll('[data-editar-egreso]').forEach(btn => {
      btn.addEventListener('click', () => {
        const egreso = listaEgresosCompleta.find(e => String(e.id) === btn.dataset.editarEgreso);
        if (egreso) abrirModalEgreso(egreso);
      });
    });
    renderBotonesPaginacionGenerico('paginacion-egresos', totalPaginas, paginaEgresos, (p) => {
      paginaEgresos = p;
      renderTablaEgresosPaginada();
      tabla.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function abrirModalEgreso(egreso) {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera"><h3>${egreso ? 'Editar egreso' : 'Registrar egreso'}</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
          <div class="modal-cuerpo">
            <div id="error-egreso" class="error-msg oculto"></div>
            <div class="grid-formulario">
              <div class="campo ancho-total"><label>Concepto</label><input type="text" id="e-concepto" value="${egreso ? egreso.concepto.replace(/"/g, '&quot;') : ''}" required /></div>
              <div class="campo">
                <label>Categoría</label>
                <select id="e-categoria">
                  <option value="">Sin categoría</option>
                  ${categorias.map(c => `<option value="${c.id}" ${egreso && String(egreso.categoria_id) === String(c.id) ? 'selected' : ''}>${c.nombre}</option>`).join('')}
                </select>
              </div>
              <div class="campo"><label>Monto</label><input type="number" id="e-monto" min="0" step="0.01" value="${egreso ? egreso.monto : ''}" required /></div>
              <div class="campo"><label>Fecha</label><input type="date" id="e-fecha" value="${egreso ? String(egreso.fecha).slice(0,10) : new Date().toISOString().slice(0,10)}" /></div>
              <div class="campo ancho-total">
                <label>Comprobante ${egreso ? '(sube uno solo si quieres reemplazar el actual)' : '(opcional)'}</label>
                <input type="file" id="e-comprobante" accept="image/*,.pdf" />
                ${egreso && egreso.comprobante_url ? `<div class="texto-gris" style="font-size:11.5px; margin-top:4px;"><a href="${egreso.comprobante_url}" target="_blank">Ver comprobante actual</a></div>` : ''}
              </div>
              <div class="campo ancho-total"><label>Notas</label><textarea id="e-notas" rows="2">${egreso && egreso.notas ? egreso.notas : ''}</textarea></div>
            </div>
          </div>
          <div class="modal-pie">
            <button class="btn btn-secundario" id="cancelar">Cancelar</button>
            <button class="btn btn-primario" id="guardar-egreso">${egreso ? 'Guardar cambios' : 'Guardar'}</button>
          </div>
        </div>
      </div>
    `;
    const cerrar = () => { modalCont.innerHTML = ''; };
    document.getElementById('cerrar-modal').addEventListener('click', cerrar);
    document.getElementById('cancelar').addEventListener('click', cerrar);
    document.getElementById('guardar-egreso').addEventListener('click', async () => {
      const errorBox = document.getElementById('error-egreso');
      const concepto = document.getElementById('e-concepto').value.trim();
      const monto = document.getElementById('e-monto').value;
      if (!concepto || !monto) { errorBox.textContent = 'Concepto y monto son obligatorios.'; errorBox.classList.remove('oculto'); return; }

      try {
        const formData = new FormData();
        formData.append('concepto', concepto);
        formData.append('categoria_id', document.getElementById('e-categoria').value);
        formData.append('monto', monto);
        formData.append('fecha', document.getElementById('e-fecha').value);
        formData.append('notas', document.getElementById('e-notas').value.trim());
        const archivo = document.getElementById('e-comprobante').files[0];
        if (archivo) formData.append('comprobante', archivo);

        if (egreso) {
          await API.solicitarConArchivo(`/api/finanzas/egresos/${egreso.id}`, formData, 'PUT');
        } else {
          await API.solicitarConArchivo('/api/finanzas/egresos', formData, 'POST');
        }
        const fechaGuardada = document.getElementById('e-fecha').value;
        cerrar();
        if (!irAMesDeFecha(fechaGuardada)) { cargarEgresos(); refrescarResumen(); }
      } catch (err) { errorBox.textContent = err.message; errorBox.classList.remove('oculto'); }
    });
  }

  function formatearMes(mesStr) {
    const [anio, mes] = mesStr.split('-');
    const d = new Date(Number(anio), Number(mes) - 1, 1);
    return d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });
  }

  // ==========================================================
  // INGRESOS EXTRA (instalaciones, reconexiones, venta de equipo…)
  // ==========================================================
  async function cargarIngresosExtra() {
    const tabla = document.getElementById('tabla-ingresos-extra');
    try {
      ingresosCrudos = await API.get(`/api/finanzas/ingresos-extra?mes=${mesSeleccionado}`);
      aplicarFiltrosIngresos();
    } catch (err) {
      tabla.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  }

  function renderTablaIngresosPaginada() {
    const tabla = document.getElementById('tabla-ingresos-extra');

    if (!listaIngresosCompleta.length) {
      tabla.innerHTML = `<div class="estado-vacio">${ingresosCrudos.length ? 'Ningún ingreso extra coincide con esos filtros.' : `No hay ingresos extra registrados en ${nombreMesLargo(mesSeleccionado)}.`}</div>`;
      return;
    }

    const totalPaginas = Math.max(1, Math.ceil(listaIngresosCompleta.length / porPagina));
    paginaIngresos = Math.min(Math.max(1, paginaIngresos), totalPaginas);
    const inicio = (paginaIngresos - 1) * porPagina;
    const ingresos = listaIngresosCompleta.slice(inicio, inicio + porPagina);

    tabla.innerHTML = `
        <table class="tabla">
          <thead><tr><th>Concepto</th><th>Categoría</th><th>Cliente</th><th>Monto</th><th>Fecha</th><th></th></tr></thead>
          <tbody>
            ${ingresos.map(i => `
              <tr>
                <td class="celda-tarjeta-titulo">${i.concepto}</td>
                <td data-label="Categoría">${i.categoria_nombre || '—'}</td>
                <td data-label="Cliente">${i.cliente_folio ? `<span class="folio">${i.cliente_folio}</span> ${i.cliente_nombre}` : '—'}</td>
                <td data-label="Monto">${mxn(i.monto)}</td>
                <td data-label="Fecha">${fechaCorta(i.fecha)}</td>
                <td class="celda-acciones-movil">
                  <div class="fila-acciones">
                    <button class="btn btn-secundario btn-sm btn-icono" data-editar-ingreso="${i.id}" title="Editar">✏️</button>
                    <button class="btn btn-peligro btn-sm btn-icono" data-borrar-ingreso="${i.id}" title="Eliminar">🗑️</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="paginacion">
          <div class="paginacion-info">Mostrando ${inicio + 1}–${Math.min(inicio + porPagina, listaIngresosCompleta.length)} de ${listaIngresosCompleta.length}</div>
          <div class="paginacion-botones" id="paginacion-ingresos"></div>
        </div>
      `;
    tabla.querySelectorAll('[data-borrar-ingreso]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este ingreso?')) return;
        try {
          await API.del(`/api/finanzas/ingresos-extra/${btn.dataset.borrarIngreso}`);
          cargarIngresosExtra(); refrescarResumen();
        } catch (err) { alert(err.message); }
      });
    });
    tabla.querySelectorAll('[data-editar-ingreso]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ingreso = listaIngresosCompleta.find(i => String(i.id) === btn.dataset.editarIngreso);
        if (ingreso) abrirModalIngresoExtra(ingreso);
      });
    });
    renderBotonesPaginacionGenerico('paginacion-ingresos', totalPaginas, paginaIngresos, (p) => {
      paginaIngresos = p;
      renderTablaIngresosPaginada();
      tabla.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Botones de paginación reutilizables (números con "…" si hay muchas páginas).
  function renderBotonesPaginacionGenerico(idContenedor, totalPaginas, paginaActual, irA) {
    const cont = document.getElementById(idContenedor);
    if (!cont) return;
    if (totalPaginas <= 1) { cont.innerHTML = ''; return; }

    const paginas = [];
    const ventana = 1;
    for (let p = 1; p <= totalPaginas; p++) {
      if (p === 1 || p === totalPaginas || (p >= paginaActual - ventana && p <= paginaActual + ventana)) {
        paginas.push(p);
      } else if (paginas[paginas.length - 1] !== '…') {
        paginas.push('…');
      }
    }

    cont.innerHTML = `
      <button id="${idContenedor}-prev" ${paginaActual === 1 ? 'disabled' : ''} title="Anterior">‹</button>
      ${paginas.map(p => p === '…'
        ? `<span class="texto-gris" style="padding:0 4px;">…</span>`
        : `<button data-pagina="${p}" class="${p === paginaActual ? 'activa' : ''}">${p}</button>`
      ).join('')}
      <button id="${idContenedor}-next" ${paginaActual === totalPaginas ? 'disabled' : ''} title="Siguiente">›</button>
    `;

    cont.querySelector(`#${idContenedor}-prev`).addEventListener('click', () => irA(paginaActual - 1));
    cont.querySelector(`#${idContenedor}-next`).addEventListener('click', () => irA(paginaActual + 1));
    cont.querySelectorAll('[data-pagina]').forEach(btn => {
      btn.addEventListener('click', () => irA(Number(btn.dataset.pagina)));
    });
  }

  function abrirModalIngresoExtra(ingreso) {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera"><h3>${ingreso ? 'Editar ingreso extra' : 'Registrar ingreso extra'}</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
          <div class="modal-cuerpo">
            <div id="error-ingreso" class="error-msg oculto"></div>
            <div class="grid-formulario">
              <div class="campo ancho-total"><label>Concepto</label><input type="text" id="i-concepto" placeholder="Ej. Instalación cliente nuevo" value="${ingreso ? ingreso.concepto.replace(/"/g, '&quot;') : ''}" required /></div>
              <div class="campo">
                <label>Categoría</label>
                <select id="i-categoria">
                  <option value="">Sin categoría</option>
                  ${categoriasIngresos.map(c => `<option value="${c.id}" ${ingreso && String(ingreso.categoria_id) === String(c.id) ? 'selected' : ''}>${c.nombre}</option>`).join('')}
                </select>
              </div>
              <div class="campo"><label>Monto</label><input type="number" id="i-monto" min="0" step="0.01" value="${ingreso ? ingreso.monto : ''}" required /></div>
              <div class="campo"><label>Fecha</label><input type="date" id="i-fecha" value="${ingreso ? String(ingreso.fecha).slice(0,10) : new Date().toISOString().slice(0,10)}" /></div>
              <div class="campo ancho-total"><label>Folio de cliente relacionado (opcional)</label><input type="text" id="i-cliente-folio" value="${ingreso && ingreso.cliente_folio ? ingreso.cliente_folio : ''}" placeholder="Ej. POP-014" style="text-transform:uppercase;" /></div>
              <div class="campo ancho-total">
                <label>Comprobante ${ingreso ? '(sube uno solo si quieres reemplazar el actual)' : '(opcional)'}</label>
                <input type="file" id="i-comprobante" accept="image/*,.pdf" />
                ${ingreso && ingreso.comprobante_url ? `<div class="texto-gris" style="font-size:11.5px; margin-top:4px;"><a href="${ingreso.comprobante_url}" target="_blank">Ver comprobante actual</a></div>` : ''}
              </div>
              <div class="campo ancho-total"><label>Notas</label><textarea id="i-notas" rows="2">${ingreso && ingreso.notas ? ingreso.notas : ''}</textarea></div>
            </div>
          </div>
          <div class="modal-pie">
            <button class="btn btn-secundario" id="cancelar">Cancelar</button>
            <button class="btn btn-primario" id="guardar-ingreso">${ingreso ? 'Guardar cambios' : 'Guardar'}</button>
          </div>
        </div>
      </div>
    `;
    const cerrar = () => { modalCont.innerHTML = ''; };
    document.getElementById('cerrar-modal').addEventListener('click', cerrar);
    document.getElementById('cancelar').addEventListener('click', cerrar);
    document.getElementById('guardar-ingreso').addEventListener('click', async () => {
      const errorBox = document.getElementById('error-ingreso');
      const concepto = document.getElementById('i-concepto').value.trim();
      const monto = document.getElementById('i-monto').value;
      if (!concepto || !monto) { errorBox.textContent = 'Concepto y monto son obligatorios.'; errorBox.classList.remove('oculto'); return; }

      try {
        const formData = new FormData();
        formData.append('concepto', concepto);
        formData.append('categoria_id', document.getElementById('i-categoria').value);
        formData.append('monto', monto);
        formData.append('fecha', document.getElementById('i-fecha').value);
        formData.append('cliente_folio', document.getElementById('i-cliente-folio').value.trim());
        formData.append('notas', document.getElementById('i-notas').value.trim());
        const archivo = document.getElementById('i-comprobante').files[0];
        if (archivo) formData.append('comprobante', archivo);

        if (ingreso) {
          await API.solicitarConArchivo(`/api/finanzas/ingresos-extra/${ingreso.id}`, formData, 'PUT');
        } else {
          await API.solicitarConArchivo('/api/finanzas/ingresos-extra', formData, 'POST');
        }
        const fechaGuardada = document.getElementById('i-fecha').value;
        cerrar();
        if (!irAMesDeFecha(fechaGuardada)) { cargarIngresosExtra(); refrescarResumen(); }
      } catch (err) { errorBox.textContent = err.message; errorBox.classList.remove('oculto'); }
    });
  }
})();
