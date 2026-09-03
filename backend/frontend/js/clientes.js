(async function () {
  const usuario = protegerPagina();
  if (!usuario) return;

  renderLayout('clientes', 'Clientes');
  const cont = document.getElementById('pagina-contenido');

  let zonas = [];
  let planes = [];
  const esAdmin = usuario.rol === 'admin';

  const params = new URLSearchParams(window.location.search);
  let filtroActual = {
    zona: params.get('zona') || '',
    semaforo: params.get('semaforo') || '',
    estado: '',
    q: ''
  };

  let listaCompleta = [];
  let paginaActual = 1;
  const porPagina = 15;

  cont.innerHTML = `<div class="cargando">Cargando clientes…</div>`;

  try {
    [zonas, planes] = await Promise.all([
      API.get('/api/catalogos/zonas'),
      API.get('/api/catalogos/planes')
    ]);
  } catch (err) {
    cont.innerHTML = `<div class="error-msg">${err.message}</div>`;
    return;
  }

  cont.innerHTML = `
    <div class="tarjeta">
      <div class="tarjeta-cuerpo">
        <div class="flex-entre" style="flex-wrap:wrap; gap:12px;">
          <div class="flex-gap">
            <input type="text" id="buscar" placeholder="Buscar por nombre, folio o IP…" style="min-width:220px; padding:9px 12px; border:1px solid var(--borde); border-radius:6px;" />
            <select id="filtro-zona" style="padding:9px 12px; border:1px solid var(--borde); border-radius:6px;">
              <option value="">Todas las zonas</option>
              ${zonas.map(z => `<option value="${z.nombre}">${z.nombre}</option>`).join('')}
            </select>
            <select id="filtro-semaforo" style="padding:9px 12px; border:1px solid var(--borde); border-radius:6px;">
              <option value="">Todos los estados</option>
              <option value="verde">Al corriente</option>
              <option value="amarillo">Por vencer</option>
              <option value="naranja">En tolerancia</option>
              <option value="rojo">Vencido</option>
            </select>
            <label class="flex-gap" style="font-size:13px; color:var(--tinta-suave); cursor:pointer;">
              <input type="checkbox" id="filtro-adeudo" style="width:16px; height:16px;" />
              Solo con 2+ meses de adeudo
            </label>
          </div>
          ${esAdmin ? `
            <div class="flex-gap">
              <button class="btn btn-secundario" id="btn-importar">📥 Importar clientes</button>
              <button class="btn btn-verde" id="btn-nuevo">+ Nuevo cliente</button>
            </div>
          ` : ''}
        </div>
      </div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cuerpo tabla-envoltura" id="tabla-clientes">
        <div class="cargando">Cargando…</div>
      </div>
    </div>

    <div id="modal-contenedor"></div>
  `;

  document.getElementById('filtro-zona').value = filtroActual.zona;
  document.getElementById('filtro-semaforo').value = filtroActual.semaforo;

  document.getElementById('buscar').addEventListener('input', debounce((e) => {
    filtroActual.q = e.target.value;
    cargarTabla();
  }, 350));
  document.getElementById('filtro-zona').addEventListener('change', (e) => {
    filtroActual.zona = e.target.value; cargarTabla();
  });
  document.getElementById('filtro-semaforo').addEventListener('change', (e) => {
    filtroActual.semaforo = e.target.value; cargarTabla();
  });
  document.getElementById('filtro-adeudo').addEventListener('change', (e) => {
    filtroActual.soloAdeudo = e.target.checked; cargarTabla();
  });

  if (esAdmin) {
    document.getElementById('btn-nuevo').addEventListener('click', () => abrirModal());
    document.getElementById('btn-importar').addEventListener('click', () => abrirModalImportar());
  }

  await cargarTabla();

  async function cargarTabla() {
    const tabla = document.getElementById('tabla-clientes');
    tabla.innerHTML = `<div class="cargando">Cargando…</div>`;
    const qs = new URLSearchParams();
    if (filtroActual.zona) qs.set('zona', filtroActual.zona);
    if (filtroActual.semaforo) qs.set('semaforo', filtroActual.semaforo);
    if (filtroActual.q) qs.set('q', filtroActual.q);

    try {
      const lista = await API.get('/api/clientes?' + qs.toString());
      listaCompleta = filtroActual.soloAdeudo ? lista.filter(c => c.meses_adeudados >= 2) : lista;
      paginaActual = 1;
      renderTablaPaginada();
    } catch (err) {
      tabla.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  }

  function renderTablaPaginada() {
    const tabla = document.getElementById('tabla-clientes');

    if (!listaCompleta.length) {
      tabla.innerHTML = `<div class="estado-vacio">No se encontraron clientes con esos filtros.</div>`;
      return;
    }

    const totalPaginas = Math.max(1, Math.ceil(listaCompleta.length / porPagina));
    paginaActual = Math.min(Math.max(1, paginaActual), totalPaginas);
    const inicio = (paginaActual - 1) * porPagina;
    const pagina = listaCompleta.slice(inicio, inicio + porPagina);

    tabla.innerHTML = `
        <table class="tabla tabla-clientes">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Cliente</th>
              <th>IP</th>
              <th>Pago</th>
              <th>Adeudo</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${pagina.map(c => `
              <tr>
                <td><span class="folio">${c.cliente_id}</span></td>
                <td>
                  <div class="celda-principal">${c.nombre}</div>
                  <div class="celda-meta">${c.zona} · ${c.plan}${c.telefono ? ' · ' + c.telefono : ''}</div>
                </td>
                <td class="mono">${c.ip || '—'}</td>
                <td>
                  <span class="semaforo ${c.semaforo}">${ETIQUETA_SEMAFORO[c.semaforo]}</span>
                  <div class="celda-meta">Día ${c.dia_pago} · vence ${fechaCorta(c.fecha_vencimiento)}</div>
                </td>
                <td>
                  ${c.meses_adeudados > 0
                    ? `<span class="pill baja">${c.meses_adeudados} mes${c.meses_adeudados > 1 ? 'es' : ''}</span><div class="celda-meta">${mxn(c.saldo_pendiente)}</div>`
                    : `<span class="texto-gris">Al día</span>`}
                </td>
                <td><span class="pill ${c.estado_cliente}">${c.estado_cliente}</span></td>
                <td>
                  <div class="fila-acciones">
                    <a class="btn btn-secundario btn-sm" href="/pagos.html?cliente=${c.cliente_id_pk}">Pagos</a>
                    ${esAdmin ? `<button class="btn btn-secundario btn-sm" data-editar="${c.cliente_id_pk}">Editar</button>` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="paginacion">
          <div class="paginacion-info">
            Mostrando ${inicio + 1}–${Math.min(inicio + porPagina, listaCompleta.length)} de ${listaCompleta.length} clientes
          </div>
          <div class="paginacion-botones" id="paginacion-botones"></div>
        </div>
      `;

    tabla.querySelectorAll('[data-editar]').forEach(btn => {
      btn.addEventListener('click', () => abrirModal(btn.dataset.editar));
    });

    renderBotonesPaginacion(totalPaginas);
  }

  function renderBotonesPaginacion(totalPaginas) {
    const cont = document.getElementById('paginacion-botones');
    if (!cont) return;

    if (totalPaginas <= 1) { cont.innerHTML = ''; return; }

    const irA = (p) => { paginaActual = p; renderTablaPaginada(); document.getElementById('tabla-clientes').scrollIntoView({ behavior: 'smooth', block: 'start' }); };

    // Construye una lista corta de números de página (con "…" si hay muchas)
    const paginas = [];
    const ventana = 1; // páginas visibles alrededor de la actual
    for (let p = 1; p <= totalPaginas; p++) {
      if (p === 1 || p === totalPaginas || (p >= paginaActual - ventana && p <= paginaActual + ventana)) {
        paginas.push(p);
      } else if (paginas[paginas.length - 1] !== '…') {
        paginas.push('…');
      }
    }

    cont.innerHTML = `
      <button id="pg-prev" ${paginaActual === 1 ? 'disabled' : ''} title="Anterior">‹</button>
      ${paginas.map(p => p === '…'
        ? `<span class="texto-gris" style="padding:0 4px;">…</span>`
        : `<button data-pagina="${p}" class="${p === paginaActual ? 'activa' : ''}">${p}</button>`
      ).join('')}
      <button id="pg-next" ${paginaActual === totalPaginas ? 'disabled' : ''} title="Siguiente">›</button>
    `;

    cont.querySelector('#pg-prev').addEventListener('click', () => irA(paginaActual - 1));
    cont.querySelector('#pg-next').addEventListener('click', () => irA(paginaActual + 1));
    cont.querySelectorAll('[data-pagina]').forEach(btn => {
      btn.addEventListener('click', () => irA(Number(btn.dataset.pagina)));
    });
  }

  async function abrirModal(clienteId) {
    let datos = {
      nombre: '', telefono: '', telefono_alt: '', direccion: '',
      zona_id: zonas[0]?.id || '', plan_id: planes[0]?.id || '',
      ip: '', dia_pago: 1, dias_tolerancia: 5, estado: 'activo', notas: '', adeudo_manual_meses: 0, adeudo_manual_detalle: ''
    };

    if (clienteId) {
      try { datos = await API.get(`/api/clientes/${clienteId}`); }
      catch (err) { alert(err.message); return; }
    }

    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo" id="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera">
            <h3>${clienteId ? 'Editar cliente' : 'Nuevo cliente'}</h3>
            <button class="cerrar-modal" id="cerrar-modal">&times;</button>
          </div>
          <div class="modal-cuerpo">
            <div id="error-modal" class="error-msg oculto"></div>
            <form id="form-cliente">
              <div class="grid-formulario">
                <div class="campo ancho-total">
                  <label>Nombre completo</label>
                  <input type="text" id="c-nombre" value="${valorSeguro(datos.nombre)}" required />
                </div>
                <div class="campo">
                  <label>Teléfono</label>
                  <input type="text" id="c-telefono" value="${valorSeguro(datos.telefono)}" />
                </div>
                <div class="campo">
                  <label>Teléfono alterno</label>
                  <input type="text" id="c-telefono-alt" value="${valorSeguro(datos.telefono_alt)}" />
                </div>
                <div class="campo ancho-total">
                  <label>Dirección</label>
                  <input type="text" id="c-direccion" value="${valorSeguro(datos.direccion)}" />
                </div>
                <div class="campo">
                  <label>Zona</label>
                  <select id="c-zona">
                    ${zonas.map(z => `<option value="${z.id}" ${String(z.id) === String(datos.zona_id) ? 'selected' : ''}>${z.nombre}</option>`).join('')}
                  </select>
                </div>
                <div class="campo">
                  <label>Plan contratado</label>
                  <select id="c-plan">
                    ${planes.map(p => `<option value="${p.id}" ${String(p.id) === String(datos.plan_id) ? 'selected' : ''}>${p.nombre} — ${mxn(p.precio)}</option>`).join('')}
                  </select>
                </div>
                <div class="campo">
                  <label>IP asignada</label>
                  <input type="text" id="c-ip" class="mono" value="${valorSeguro(datos.ip)}" placeholder="10.0.0.1" />
                </div>
                <div class="campo">
                  <label>Día de pago (1–31)</label>
                  <input type="number" id="c-dia-pago" min="1" max="31" value="${datos.dia_pago}" required />
                </div>
                <div class="campo">
                  <label>Días de tolerancia</label>
                  <input type="number" id="c-dias-tolerancia" min="0" max="30" value="${datos.dias_tolerancia}" />
                </div>
                <div class="campo">
                  <label>Meses de atraso previos (manual)</label>
                  <input type="number" id="c-adeudo-manual" min="0" max="60" value="${datos.adeudo_manual_meses || 0}" />
                </div>
                <div class="campo">
                  <label>¿A qué meses corresponde?</label>
                  <input type="text" id="c-adeudo-detalle" value="${valorSeguro(datos.adeudo_manual_detalle)}" placeholder="Ej. Julio y agosto 2026" />
                </div>
                <div class="campo ancho-total" style="margin-top:-8px;">
                  <span class="texto-gris" style="font-size:11.5px;">
                    Úsalo solo si el cliente ya te debía meses de <b>antes</b> de darlo de alta en este sistema
                    (el sistema no puede saber de esos meses solo). Se suma al conteo automático que se hace mes a mes;
                    ponlo en 0 cuando ya lo hayas cobrado o corregido.
                  </span>
                </div>
                <div class="campo">
                  <label>Estado</label>
                  <select id="c-estado">
                    <option value="activo" ${datos.estado === 'activo' ? 'selected' : ''}>Activo</option>
                    <option value="suspendido" ${datos.estado === 'suspendido' ? 'selected' : ''}>Suspendido</option>
                    <option value="baja" ${datos.estado === 'baja' ? 'selected' : ''}>Baja</option>
                  </select>
                </div>
                <div class="campo ancho-total">
                  <label>Notas</label>
                  <textarea id="c-notas" rows="2">${valorSeguro(datos.notas)}</textarea>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-pie">
            <button class="btn btn-secundario" id="cancelar-modal">Cancelar</button>
            <button class="btn btn-primario" id="guardar-cliente">Guardar</button>
          </div>
        </div>
      </div>
    `;

    const cerrar = () => { modalCont.innerHTML = ''; };
    document.getElementById('cerrar-modal').addEventListener('click', cerrar);
    document.getElementById('cancelar-modal').addEventListener('click', cerrar);

    document.getElementById('guardar-cliente').addEventListener('click', async () => {
      const errorBox = document.getElementById('error-modal');
      const payload = {
        nombre: document.getElementById('c-nombre').value.trim(),
        telefono: document.getElementById('c-telefono').value.trim(),
        telefono_alt: document.getElementById('c-telefono-alt').value.trim(),
        direccion: document.getElementById('c-direccion').value.trim(),
        zona_id: Number(document.getElementById('c-zona').value),
        plan_id: Number(document.getElementById('c-plan').value),
        ip: document.getElementById('c-ip').value.trim(),
        dia_pago: Number(document.getElementById('c-dia-pago').value),
        dias_tolerancia: Number(document.getElementById('c-dias-tolerancia').value),
        estado: document.getElementById('c-estado').value,
        notas: document.getElementById('c-notas').value.trim(),
        adeudo_manual_meses: Number(document.getElementById('c-adeudo-manual').value) || 0,
        adeudo_manual_detalle: document.getElementById('c-adeudo-detalle').value.trim()
      };

      if (!payload.nombre || !payload.dia_pago) {
        errorBox.textContent = 'Nombre y día de pago son obligatorios.';
        errorBox.classList.remove('oculto');
        return;
      }

      try {
        if (clienteId) {
          await API.put(`/api/clientes/${clienteId}`, payload);
        } else {
          await API.post('/api/clientes', payload);
        }
        cerrar();
        cargarTabla();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.remove('oculto');
      }
    });
  }

  function valorSeguro(v) { return v === null || v === undefined ? '' : String(v).replace(/"/g, '&quot;'); }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ==========================================================
  // IMPORTAR CLIENTES DESDE EXCEL/CSV
  // ==========================================================
  function abrirModalImportar() {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera">
            <h3>Importar clientes</h3>
            <button class="cerrar-modal" id="cerrar-modal">&times;</button>
          </div>
          <div class="modal-cuerpo">
            <p class="texto-gris" style="margin-top:0;">
              1. Descarga la plantilla, 2. llénala con tus clientes (respeta los nombres exactos
              de zona y plan que aparecen en las hojas de referencia), 3. súbela aquí. El
              <b>Cliente-ID (folio)</b> se genera automáticamente para cada uno.
            </p>

            <button class="btn btn-secundario btn-sm" id="btn-descargar-plantilla" style="margin-bottom:18px;">
              ⬇️ Descargar plantilla (.xlsx)
            </button>

            <div class="campo">
              <label>Archivo lleno (.xlsx, .xls o .csv)</label>
              <input type="file" id="archivo-importar" accept=".xlsx,.xls,.csv" />
            </div>

            <div id="resultado-importacion"></div>
          </div>
          <div class="modal-pie">
            <button class="btn btn-secundario" id="cerrar-abajo">Cerrar</button>
            <button class="btn btn-primario" id="btn-subir-importar">Subir e importar</button>
          </div>
        </div>
      </div>
    `;

    const cerrar = () => { modalCont.innerHTML = ''; cargarTabla(); };
    document.getElementById('cerrar-modal').addEventListener('click', cerrar);
    document.getElementById('cerrar-abajo').addEventListener('click', cerrar);

    document.getElementById('btn-descargar-plantilla').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const textoOriginal = btn.textContent;
      btn.disabled = true; btn.textContent = 'Descargando…';
      try {
        await API.descargarArchivo('/api/clientes/plantilla', 'plantilla_clientes_fibertec.xlsx');
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false; btn.textContent = textoOriginal;
      }
    });

    document.getElementById('btn-subir-importar').addEventListener('click', async () => {
      const inputArchivo = document.getElementById('archivo-importar');
      const resultadoBox = document.getElementById('resultado-importacion');
      const archivo = inputArchivo.files[0];

      if (!archivo) {
        resultadoBox.innerHTML = `<div class="error-msg">Selecciona primero un archivo.</div>`;
        return;
      }

      const btn = document.getElementById('btn-subir-importar');
      btn.disabled = true;
      btn.textContent = 'Importando…';
      resultadoBox.innerHTML = `<div class="cargando">Procesando tu archivo, puede tardar unos segundos…</div>`;

      try {
        const formData = new FormData();
        formData.append('archivo', archivo);
        const resultado = await API.solicitarConArchivo('/api/clientes/importar', formData, 'POST');
        pintarResultadoImportacion(resultado);
      } catch (err) {
        resultadoBox.innerHTML = `<div class="error-msg">${err.message}</div>`;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Subir e importar';
      }
    });

    function pintarResultadoImportacion(resultado) {
      const resultadoBox = document.getElementById('resultado-importacion');
      const errores = resultado.detalle.filter(d => d.error);
      const exitosos = resultado.detalle.filter(d => !d.error);
      const conAdvertencia = exitosos.filter(d => d.advertencias && d.advertencias.length);

      resultadoBox.innerHTML = `
        <div class="${resultado.fallidos ? 'error-msg' : 'exito-msg'}" style="margin-top:16px;">
          Se importaron <b>${resultado.insertados}</b> de ${resultado.total} filas.
          ${resultado.fallidos ? `${resultado.fallidos} fila(s) tuvieron errores y no se importaron (ver detalle abajo).` : '¡Todos los clientes se importaron correctamente! 🎉'}
        </div>

        ${exitosos.length ? `
          <div class="tarjeta-cliente-encontrado" style="margin-bottom:12px;">
            <b>Folios generados (primeros ${Math.min(10, exitosos.length)}):</b>
            <div class="mono texto-gris" style="margin-top:6px; font-size:12.5px;">
              ${exitosos.slice(0, 10).map(e => `${e.cliente_id} — ${e.nombre}`).join('<br>')}
              ${exitosos.length > 10 ? `<br>… y ${exitosos.length - 10} más.` : ''}
            </div>
          </div>` : ''}

        ${conAdvertencia.length ? `
          <div style="margin-bottom:14px; padding:10px 12px; background:var(--sem-amarillo-bg); border-radius:6px;">
            <b style="color:var(--sem-amarillo);">⚠️ ${conAdvertencia.length} cliente(s) se importaron con datos pendientes por corregir:</b>
            <div class="tabla-envoltura" style="margin-top:8px;">
              <table class="tabla">
                <thead><tr><th>Fila</th><th>Cliente</th><th>Pendiente</th></tr></thead>
                <tbody>
                  ${conAdvertencia.map(e => `
                    <tr>
                      <td><span class="folio">${e.cliente_id}</span></td>
                      <td>${e.nombre}</td>
                      <td class="texto-gris" style="font-size:12.5px;">${e.advertencias.join(' ')}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
            <p class="texto-gris" style="font-size:12.5px; margin-bottom:0;">
              Entra a cada uno desde Clientes → Editar, y corrige su zona, plan y/o día de pago reales.
            </p>
          </div>` : ''}

        ${errores.length ? `
          <div class="tabla-envoltura">
            <table class="tabla">
              <thead><tr><th>Fila</th><th>Nombre</th><th>Error</th></tr></thead>
              <tbody>
                ${errores.map(e => `<tr><td>${e.fila}</td><td>${e.nombre}</td><td class="texto-gris">${e.error}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>` : ''}
      `;
    }
  }
})();
