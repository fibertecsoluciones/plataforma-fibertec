(async function () {
  const usuario = protegerPagina(['admin']);
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
    q: '',
    adeudoMinimo: params.get('adeudo') || ''
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
              <option value="">Todos los estados de pago</option>
              <option value="verde">Al corriente</option>
              <option value="amarillo">Por vencer</option>
              <option value="naranja">En tolerancia</option>
              <option value="rojo">Vencido</option>
            </select>
            <select id="filtro-estado" style="padding:9px 12px; border:1px solid var(--borde); border-radius:6px;">
              <option value="">Activos y suspendidos</option>
              <option value="activo">Solo activos</option>
              <option value="suspendido">Solo suspendidos</option>
              <option value="baja">Solo dados de baja</option>
            </select>
            <select id="filtro-adeudo" style="padding:9px 12px; border:1px solid var(--borde); border-radius:6px;">
              <option value="">Todos (con o sin adeudo)</option>
              <option value="1">Con adeudo (1+ meses)</option>
              <option value="2">Con adeudo (2+ meses)</option>
              <option value="3">Con adeudo (3+ meses)</option>
            </select>
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
  document.getElementById('filtro-estado').value = filtroActual.estado;
  document.getElementById('filtro-adeudo').value = filtroActual.adeudoMinimo;

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
  document.getElementById('filtro-estado').addEventListener('change', (e) => {
    filtroActual.estado = e.target.value; cargarTabla();
  });
  document.getElementById('filtro-adeudo').addEventListener('change', (e) => {
    filtroActual.adeudoMinimo = e.target.value; cargarTabla();
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
    if (filtroActual.estado) qs.set('estado', filtroActual.estado);
    if (filtroActual.q) qs.set('q', filtroActual.q);

    try {
      const lista = await API.get('/api/clientes?' + qs.toString());
      const minimo = Number(filtroActual.adeudoMinimo) || 0;
      listaCompleta = minimo > 0 ? lista.filter(c => c.meses_adeudados >= minimo) : lista;
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
                <td data-label="Folio"><span class="folio">${c.cliente_id}</span></td>
                <td class="celda-tarjeta-titulo">
                  <div class="celda-principal">${c.nombre}</div>
                  <div class="celda-meta">${c.zona} · ${c.plan}${c.telefono ? ' · ' + c.telefono : ''}</div>
                </td>
                <td class="mono" data-label="IP">${c.ip || '—'}</td>
                <td data-label="Pago">
                  <span class="semaforo ${c.semaforo}">${ETIQUETA_SEMAFORO[c.semaforo]}</span>
                  <div class="celda-meta">Día ${c.dia_pago} · vence ${fechaCorta(c.fecha_vencimiento)}</div>
                </td>
                <td data-label="Adeudo">
                  ${c.meses_adeudados > 0
                    ? `<span class="pill baja">${c.meses_adeudados} mes${c.meses_adeudados > 1 ? 'es' : ''}</span><div class="celda-meta">${mxn(c.saldo_pendiente)}${c.estado_cliente === 'suspendido' ? ' · 🧊 congelado' : ''}</div>`
                    : `<span class="texto-gris">Al día</span>`}
                </td>
                <td data-label="Estado"><span class="pill ${c.estado_cliente}">${c.estado_cliente}</span></td>
                <td class="celda-acciones-movil">
                  <div class="fila-acciones">
                    <a class="btn btn-secundario btn-sm" href="/pagos.html?cliente=${c.cliente_id_pk}">Pagos</a>
                    ${esAdmin ? `<button class="btn btn-secundario btn-sm" data-editar="${c.cliente_id_pk}">Editar</button>` : ''}
                    ${esAdmin && c.estado_cliente !== 'baja' ? `<button class="btn btn-peligro btn-sm" data-baja="${c.cliente_id_pk}">Dar de baja</button>` : ''}
                    ${esAdmin ? `<button class="btn btn-peligro btn-sm" data-eliminar-permanente="${c.cliente_id_pk}" data-folio="${c.cliente_id}">Eliminar definitivamente</button>` : ''}
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

    tabla.querySelectorAll('[data-baja]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Dar de baja a este cliente? No se borra su historial de pagos ni instalaciones — solo deja de aparecer en la lista normal y en el semáforo. Puedes reactivarlo después desde Editar (o filtrando "Solo dados de baja").')) return;
        try {
          await API.del(`/api/clientes/${btn.dataset.baja}`);
          cargarTabla();
        } catch (err) { alert(err.message); }
      });
    });

    tabla.querySelectorAll('[data-eliminar-permanente]').forEach(btn => {
      btn.addEventListener('click', () => abrirModalEliminarPermanente(btn.dataset.eliminarPermanente, btn.dataset.folio));
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
      ip: '', dia_pago: 1, dias_tolerancia: 5, estado: 'activo', notas: '', adeudo_manual_meses: 0, adeudo_manual_detalle: '', fecha_inicio_conteo: ''
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
                  <label>Contar adeudo automático desde</label>
                  <input type="date" id="c-fecha-inicio-conteo" value="${datos.fecha_inicio_conteo ? String(datos.fecha_inicio_conteo).slice(0,10) : ''}" />
                </div>
                <div class="campo ancho-total" style="margin-top:-8px;">
                  <span class="texto-gris" style="font-size:11.5px;">
                    Normalmente no la toques (es la fecha en que diste de alta al cliente). Solo recórrela hacia
                    atrás si ya tienes en el sistema pagos o abonos de meses anteriores que quieres que el
                    conteo automático SÍ tome en cuenta (por ejemplo, un abono parcial que ya registraste).
                    Ojo: si la recorres a un mes donde el cliente en realidad no debía nada y no hay pago
                    registrado, el sistema lo va a marcar como debido — solo recórrela hasta donde tengas certeza.
                  </span>
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
                    Úsalo SOLO para deuda de <b>antes</b> de la fecha de "contar adeudo automático desde" (de la
                    que no tienes ningún pago registrado, ni completo ni parcial). Si el mes que quieres capturar
                    aquí ya tiene algún pago registrado en el historial de este cliente, mejor recorre la fecha de
                    arriba en vez de usar este campo — si usas los dos para el mismo mes, se va a contar doble.
                    Ponlo en 0 cuando ya lo hayas cobrado o corregido.
                  </span>
                  <div id="aviso-traslape" class="oculto" style="margin-top:8px; padding:9px 11px; background:var(--sem-amarillo-bg); color:var(--sem-amarillo); border-radius:6px; font-size:12px;">
                    ⚠️ Tienes las dos cosas activas a la vez (fecha movida hacia atrás Y meses manuales). Revisa
                    que el adeudo manual sea de meses <b>antes</b> de esa fecha, o podrías estar contando el mismo
                    mes dos veces.
                  </div>
                </div>
                <div class="campo">
                  <label>Estado</label>
                  <select id="c-estado">
                    <option value="activo" ${datos.estado === 'activo' ? 'selected' : ''}>Activo</option>
                    <option value="suspendido" ${datos.estado === 'suspendido' ? 'selected' : ''}>Suspendido</option>
                    <option value="baja" ${datos.estado === 'baja' ? 'selected' : ''}>Baja</option>
                  </select>
                </div>
                <div class="campo">
                  <label>Fecha de suspensión (si aplica)</label>
                  <input type="date" id="c-fecha-suspension" value="${datos.fecha_suspension ? String(datos.fecha_suspension).slice(0, 10) : ''}" />
                </div>
                <div class="campo ancho-total" style="margin-top:-8px;">
                  <span class="texto-gris" style="font-size:11.5px;">
                    Solo tiene efecto si el Estado está en "Suspendido": desde esa fecha se congela su adeudo
                    automático (no le sigue sumando meses nuevos mientras siga así). Si dejas este campo vacío y
                    cambias el Estado a "Suspendido" y guardas, el sistema usa automáticamente el día de hoy.
                    Solo llénalo a mano si necesitas corregir la fecha real de un cliente que ya estaba suspendido
                    de antes (para que el congelamiento le aplique desde su fecha real, no desde hoy).
                  </span>
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

    // Avisa si están usando "fecha de inicio" recorrida hacia atrás Y "adeudo manual" al mismo
    // tiempo, para que revisen que no se estén traslapando (contando el mismo mes dos veces).
    const fechaAltaOriginal = datos.fecha_alta ? String(datos.fecha_alta).slice(0, 10) : null;
    function actualizarAvisoTraslape() {
      const fechaInicio = document.getElementById('c-fecha-inicio-conteo').value;
      const mesesManual = Number(document.getElementById('c-adeudo-manual').value) || 0;
      const seMovioFecha = fechaInicio && fechaAltaOriginal && fechaInicio < fechaAltaOriginal;
      document.getElementById('aviso-traslape').classList.toggle('oculto', !(seMovioFecha && mesesManual > 0));
    }
    document.getElementById('c-fecha-inicio-conteo').addEventListener('input', actualizarAvisoTraslape);
    document.getElementById('c-adeudo-manual').addEventListener('input', actualizarAvisoTraslape);
    actualizarAvisoTraslape();

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
        adeudo_manual_detalle: document.getElementById('c-adeudo-detalle').value.trim(),
        fecha_inicio_conteo: document.getElementById('c-fecha-inicio-conteo').value || null
      };

      if (!payload.nombre || !payload.dia_pago) {
        errorBox.textContent = 'Nombre y día de pago son obligatorios.';
        errorBox.classList.remove('oculto');
        return;
      }

      const fechaSuspensionManual = document.getElementById('c-fecha-suspension').value;
      if (fechaSuspensionManual) payload.fecha_suspension = fechaSuspensionManual;

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

  function abrirModalEliminarPermanente(idCliente, folio) {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera">
            <h3 style="color:var(--sem-rojo);">⚠️ Eliminar cliente definitivamente</h3>
            <button class="cerrar-modal" id="cerrar-modal">&times;</button>
          </div>
          <div class="modal-cuerpo">
            <div class="error-msg">
              Esto borra al cliente <b>${folio}</b> para siempre, junto con <b>todo su historial de pagos e instalaciones</b>.
              No es como "Dar de baja" — esto NO se puede deshacer. Úsalo solo si estás 100% seguro
              (por ejemplo, un cliente que se dio de alta por error).
            </div>
            <div class="campo">
              <label>Para confirmar, escribe el folio exacto: <span class="folio">${folio}</span></label>
              <input type="text" id="confirmar-folio-eliminar" placeholder="Escribe ${folio}" style="text-transform:uppercase;" />
            </div>
            <div id="error-eliminar-permanente" class="error-msg oculto"></div>
          </div>
          <div class="modal-pie">
            <button class="btn btn-secundario" id="cancelar-eliminar-permanente">Cancelar</button>
            <button class="btn btn-peligro" id="confirmar-eliminar-permanente" disabled>Eliminar para siempre</button>
          </div>
        </div>
      </div>
    `;

    const cerrar = () => { modalCont.innerHTML = ''; };
    document.getElementById('cerrar-modal').addEventListener('click', cerrar);
    document.getElementById('cancelar-eliminar-permanente').addEventListener('click', cerrar);

    const input = document.getElementById('confirmar-folio-eliminar');
    const btnConfirmar = document.getElementById('confirmar-eliminar-permanente');
    input.addEventListener('input', () => {
      btnConfirmar.disabled = input.value.trim().toUpperCase() !== folio.toUpperCase();
    });

    btnConfirmar.addEventListener('click', async () => {
      const errorBox = document.getElementById('error-eliminar-permanente');
      btnConfirmar.disabled = true;
      btnConfirmar.textContent = 'Eliminando…';
      try {
        const resultado = await API.del(`/api/clientes/${idCliente}/permanente`);
        cerrar();
        alert(resultado.mensaje);
        cargarTabla();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.remove('oculto');
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = 'Eliminar para siempre';
      }
    });
  }

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
                      <td data-label="Fila">${e.fila}</td>
                      <td class="celda-tarjeta-titulo"><span class="folio">${e.cliente_id}</span> ${e.nombre}</td>
                      <td data-label="Pendiente" class="texto-gris" style="font-size:12.5px;">${e.advertencias.join(' ')}</td>
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
                ${errores.map(e => `<tr><td data-label="Fila">${e.fila}</td><td class="celda-tarjeta-titulo">${e.nombre}</td><td data-label="Error" class="texto-gris">${e.error}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>` : ''}
      `;
    }
  }
})();
