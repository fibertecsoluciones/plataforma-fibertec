(async function () {
  const usuario = protegerPagina(['admin']);
  if (!usuario) return;

  renderLayout('pagos-tecnicos', 'Pago a técnicos');
  const cont = document.getElementById('pagina-contenido');
  const BASE = '/api/finanzas/pagos-tecnicos';

  const ETIQUETA_TIPO = { instalacion: '🔌 Instalación', mantenimiento: '🔧 Mantenimiento', falla: '⚠️ Falla', libranza: '🌴 Libranza' };
  const ETIQUETA_ESTADO_ACT = { pendiente: 'Pendiente', en_proceso: 'En proceso', completada: 'Completada' };
  const METODOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', deposito: 'Depósito', tarjeta: 'Tarjeta' };
  const ESTADO_PAGO = { pendiente: ['pago-pendiente', 'Pendiente'], parcial: ['pago-parcial', 'Parcial'], pagado: ['pago-pagado', 'Pagado'] };
  const pillPago = (estado) => `<span class="pill ${ESTADO_PAGO[estado][0]}">${ESTADO_PAGO[estado][1]}</span>`;

  let tecnicos = [];
  let pestana = 'agrupar';          // 'agrupar' | 'pagos' | 'fuera'
  let filtroTecnico = '';
  let filtroEstadoPago = 'por_pagar'; // 'por_pagar' (pendientes y parciales) | 'pagado' | ''
  let seleccion = new Set();        // actividades marcadas con la casilla (se conservan al recargar)
  let porAgrupar = [], pagos = [], fuera = [], resumen = null;
  let aviso = '';                   // mensaje verde después de una acción

  // ---------- utilidades ----------
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fechaAct = (a) => fechaHoraCorta(a.completado_en || a.creado_en);
  const fechaLocal = (ts) => new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); // en la hora de quien lo ve
  const textoActividades = (n) => `${n} actividad${n === 1 ? '' : 'es'}`;
  const qsTecnico = () => filtroTecnico ? `?tecnico_id=${filtroTecnico}` : '';

  cont.innerHTML = `
    <div class="grid-kpi" id="pt-kpis"></div>

    <div class="tarjeta">
      <div class="tarjeta-cuerpo">
        <div class="flex-gap" style="gap:12px;">
          <select id="pt-tecnico" style="padding:9px 12px; border:1px solid var(--borde); border-radius:6px;">
            <option value="">Todos los técnicos</option>
          </select>
          <span class="texto-gris" style="font-size:12px; flex:1; min-width:240px;">
            Junta las actividades terminadas de un técnico y ponles un total. Queda como <b>pendiente</b> y
            <b>no se refleja en Finanzas</b> hasta que registres un pago (completo o en partes).
          </span>
        </div>
      </div>
    </div>

    <div id="pt-aviso"></div>
    <div class="tabs" id="pt-tabs"></div>
    <div id="pt-contenido"><div class="cargando">Cargando…</div></div>
    <div id="modal-contenedor"></div>
  `;

  const modalCont = document.getElementById('modal-contenedor');
  const cerrarModal = () => { modalCont.innerHTML = ''; };

  try {
    tecnicos = await API.get(`${BASE}/tecnicos`);
  } catch (err) {
    document.getElementById('pt-contenido').innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
    return;
  }
  document.getElementById('pt-tecnico').innerHTML += tecnicos.map(t => `<option value="${t.id}">${esc(t.nombre)}${t.activo ? '' : ' (baja)'}</option>`).join('');
  document.getElementById('pt-tecnico').addEventListener('change', (e) => { filtroTecnico = e.target.value; recargar(); });

  conectarEventos();
  await recargar();

  // ==========================================================
  // CARGA
  // ==========================================================
  async function recargar() {
    try {
      const estadoQs = filtroEstadoPago ? `estado=${filtroEstadoPago}` : '';
      const tecQs = filtroTecnico ? `tecnico_id=${filtroTecnico}` : '';
      const qsPagos = [estadoQs, tecQs].filter(Boolean).join('&');
      [resumen, porAgrupar, pagos, fuera] = await Promise.all([
        API.get(`${BASE}/resumen`),
        API.get(`${BASE}/por-agrupar${qsTecnico()}`),
        API.get(`${BASE}${qsPagos ? '?' + qsPagos : ''}`),
        API.get(`${BASE}/fuera-de-pago${qsTecnico()}`)
      ]);
      const vivas = new Set(porAgrupar.map(a => a.id));
      seleccion = new Set([...seleccion].filter(id => vivas.has(id)));
      render();
    } catch (err) {
      document.getElementById('pt-contenido').innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
    }
  }

  function render() {
    // KPIs
    document.getElementById('pt-kpis').innerHTML = `
      <div class="kpi borde-azul">
        <div class="kpi-etiqueta">Actividades por agrupar</div>
        <div class="kpi-valor">${resumen.actividades_por_agrupar}</div>
        <div class="texto-gris" style="font-size:11.5px; margin-top:2px;">terminadas, de ${resumen.tecnicos_con_pendientes} técnico${resumen.tecnicos_con_pendientes === 1 ? '' : 's'}</div>
      </div>
      <div class="kpi borde-naranja">
        <div class="kpi-etiqueta">Falta por pagar</div>
        <div class="kpi-valor">${mxn(resumen.monto_pendiente)}</div>
        <div class="texto-gris" style="font-size:11.5px; margin-top:2px;">${resumen.pagos_pendientes} pago${resumen.pagos_pendientes === 1 ? '' : 's'} con saldo${resumen.pagos_parciales ? ` (${resumen.pagos_parciales} en partes)` : ''} · aún no está en Finanzas</div>
      </div>
      <div class="kpi borde-verde">
        <div class="kpi-etiqueta">Pagado este mes</div>
        <div class="kpi-valor">${mxn(resumen.pagado_mes)}</div>
        <div class="texto-gris" style="font-size:11.5px; margin-top:2px;">ya registrado en Finanzas</div>
      </div>`;

    document.getElementById('pt-aviso').innerHTML = aviso ? `<div class="aviso-ok">${aviso}</div>` : '';

    // Pestañas
    const tab = (id, texto, n) => `<button class="tab ${pestana === id ? 'activa' : ''}" data-tab="${id}">${texto}<span class="tab-contador">${n}</span></button>`;
    document.getElementById('pt-tabs').innerHTML =
      tab('agrupar', 'Por agrupar', porAgrupar.length) +
      tab('pagos', 'Pagos', pagos.length) +
      tab('fuera', 'Sin pago', fuera.length);

    if (pestana === 'agrupar') renderAgrupar();
    else if (pestana === 'pagos') renderPagos();
    else renderFuera();
  }

  // ==========================================================
  // PESTAÑA 1: actividades por agrupar
  // ==========================================================
  function renderAgrupar() {
    const c = document.getElementById('pt-contenido');
    if (!porAgrupar.length) {
      c.innerHTML = `<div class="tarjeta"><div class="tarjeta-cuerpo estado-vacio">
        No hay actividades terminadas por pagar. 🎉<br>
        <span style="font-size:12px;">Aquí aparecen las actividades <b>completadas</b> de tus técnicos, sin contar Libranza, las tuyas ni las marcadas "no genera pago".</span>
      </div></div>`;
      return;
    }

    const porTecnico = new Map();
    porAgrupar.forEach(a => {
      if (!porTecnico.has(a.tecnico_id)) porTecnico.set(a.tecnico_id, { nombre: a.tecnico_nombre, items: [] });
      porTecnico.get(a.tecnico_id).items.push(a);
    });

    c.innerHTML = [...porTecnico.entries()].map(([tecId, g]) => `
      <div class="tarjeta" data-tarjeta-tecnico="${tecId}">
        <div class="tarjeta-cabecera" style="flex-wrap:wrap; gap:10px;">
          <h3>👷 ${esc(g.nombre)} <span class="texto-gris" style="font-weight:400; font-size:13px;">· ${textoActividades(g.items.length)} lista${g.items.length === 1 ? '' : 's'} para pagar</span></h3>
          <button class="btn btn-verde btn-sm" data-agrupar="${tecId}" disabled>Agrupar y poner monto</button>
        </div>
        <div class="tarjeta-cuerpo">
          <label style="display:inline-flex; align-items:center; gap:8px; font-size:12.5px; margin-bottom:8px; cursor:pointer;">
            <input type="checkbox" data-todas="${tecId}" /> Seleccionar todas
          </label>
          <div class="tabla-envoltura">
            <table class="tabla">
              <thead><tr><th>Actividad</th><th>Tipo</th><th>Cliente</th><th>Terminada</th><th></th></tr></thead>
              <tbody>
                ${g.items.map(a => `
                  <tr>
                    <td class="celda-tarjeta-titulo">
                      <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; margin:0; font-weight:600;">
                        <input type="checkbox" data-act="${a.id}" data-tec="${tecId}" ${seleccion.has(a.id) ? 'checked' : ''} style="width:17px; height:17px; margin-top:2px;" />
                        <span>${esc(a.titulo)}</span>
                      </label>
                    </td>
                    <td data-label="Tipo"><span class="pill tipo-${esc(a.tipo)}">${ETIQUETA_TIPO[a.tipo] || esc(a.tipo)}</span></td>
                    <td data-label="Cliente">${a.cliente_folio ? `<span class="folio">${esc(a.cliente_folio)}</span> ${esc(a.cliente_nombre)}` : '—'}</td>
                    <td data-label="Terminada">${fechaAct(a)}</td>
                    <td class="celda-acciones-movil"><button class="btn btn-secundario btn-sm" data-excluir="${a.id}" title="Dejarla fuera: no genera pago" style="white-space:nowrap;">🚫 No genera pago</button></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`).join('');
    actualizarBotonesAgrupar();
  }

  function actualizarBotonesAgrupar() {
    document.querySelectorAll('[data-agrupar]').forEach(btn => {
      const tecId = Number(btn.dataset.agrupar);
      const n = [...seleccion].filter(id => (porAgrupar.find(a => a.id === id) || {}).tecnico_id === tecId).length;
      btn.disabled = n === 0;
      btn.textContent = n ? `Agrupar ${n} seleccionada${n === 1 ? '' : 's'} y poner monto` : 'Agrupar y poner monto';
    });
    document.querySelectorAll('[data-todas]').forEach(chk => {
      const tecId = Number(chk.dataset.todas);
      const delTec = porAgrupar.filter(a => a.tecnico_id === tecId);
      chk.checked = delTec.length > 0 && delTec.every(a => seleccion.has(a.id));
    });
  }

  // ---------- ventana: nuevo pago ----------
  function abrirModalNuevoPago(tecId) {
    const ids = [...seleccion].filter(id => (porAgrupar.find(a => a.id === id) || {}).tecnico_id === tecId);
    if (!ids.length) return;
    const acts = ids.map(id => porAgrupar.find(a => a.id === id));
    const nombre = acts[0].tecnico_nombre;

    modalCont.innerHTML = `
      <div class="modal-fondo"><div class="modal">
        <div class="modal-cabecera"><h3>Nuevo pago para ${esc(nombre)}</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
        <div class="modal-cuerpo">
          <div id="np-error" class="error-msg oculto"></div>
          <p style="margin-top:0; font-size:13px;"><b>${textoActividades(acts.length)}</b> incluida${acts.length === 1 ? '' : 's'}:</p>
          <div class="lista-check" style="margin-bottom:14px;">
            ${acts.slice(0, 6).map(a => `<label style="cursor:default;">• ${esc(a.titulo)} <span class="texto-gris">· ${fechaAct(a)}</span></label>`).join('')}
            ${acts.length > 6 ? `<label style="cursor:default;" class="texto-gris">… y ${acts.length - 6} más</label>` : ''}
          </div>
          <div class="grid-formulario">
            <div class="campo">
              <label>Total a pagar</label>
              <input type="number" id="np-monto" min="0.01" step="0.01" inputmode="decimal" placeholder="Ej. 1500" />
            </div>
            <div class="campo ancho-total">
              <label>Notas (opcional)</label>
              <textarea id="np-notas" rows="2" placeholder="Ej. Las 3 instalaciones de la semana, una con difícil acceso"></textarea>
            </div>
          </div>
          <div class="texto-gris" style="font-size:12px; margin-top:6px;">
            Se guarda como <b>pendiente</b>. Después podrás pagarlo completo o en partes; no se refleja en Finanzas hasta que registres un pago.
          </div>
        </div>
        <div class="modal-pie">
          <button class="btn btn-secundario" id="np-cancelar">Cancelar</button>
          <button class="btn btn-primario" id="np-guardar">Guardar como pendiente</button>
        </div>
      </div></div>`;
    document.getElementById('cerrar-modal').addEventListener('click', cerrarModal);
    document.getElementById('np-cancelar').addEventListener('click', cerrarModal);
    document.getElementById('np-monto').focus();

    document.getElementById('np-guardar').addEventListener('click', async (e) => {
      const err = document.getElementById('np-error');
      const monto = Number(document.getElementById('np-monto').value);
      if (!(monto > 0)) { err.textContent = 'Escribe el monto a pagar (mayor a 0).'; err.classList.remove('oculto'); return; }
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        await API.post(BASE, { tecnico_id: tecId, actividad_ids: ids, monto, notas: document.getElementById('np-notas').value.trim() });
        ids.forEach(id => seleccion.delete(id));
        cerrarModal();
        aviso = `✅ Pago de <b>${mxn(monto)}</b> para ${esc(nombre)} guardado como <b>pendiente</b>. Todavía no aparece en Finanzas; regístralo cuando lo pagues, completo o en partes.`;
        pestana = 'pagos'; filtroEstadoPago = 'por_pagar';
        await recargar();
      } catch (e2) {
        err.textContent = e2.message; err.classList.remove('oculto');
        btn.disabled = false; btn.textContent = 'Guardar como pendiente';
        if (/ya no están disponibles/.test(e2.message)) recargar();
      }
    });
  }

  // ==========================================================
  // PESTAÑA 2: pagos
  // ==========================================================
  function renderPagos() {
    const c = document.getElementById('pt-contenido');
    const filtro = `
      <div class="tarjeta"><div class="tarjeta-cuerpo flex-gap">
        <select id="pt-estado-pago" style="padding:9px 12px; border:1px solid var(--borde); border-radius:6px;">
          <option value="por_pagar" ${filtroEstadoPago === 'por_pagar' ? 'selected' : ''}>Por pagar (pendientes y en partes)</option>
          <option value="pagado" ${filtroEstadoPago === 'pagado' ? 'selected' : ''}>Solo pagados</option>
          <option value="" ${filtroEstadoPago === '' ? 'selected' : ''}>Todos</option>
        </select>
      </div></div>`;
    if (!pagos.length) {
      c.innerHTML = filtro + `<div class="tarjeta"><div class="tarjeta-cuerpo estado-vacio">${
        filtroEstadoPago === 'por_pagar' ? 'No tienes pagos por pagar.' : filtroEstadoPago === 'pagado' ? 'Aún no has liquidado ningún pago.' : 'Todavía no hay pagos.'}</div></div>`;
      return;
    }
    c.innerHTML = filtro + `
      <div class="tarjeta"><div class="tarjeta-cuerpo tabla-envoltura">
        <table class="tabla">
          <thead><tr><th>Técnico</th><th>Actividades</th><th>Total</th><th>Pagado</th><th>Falta</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${pagos.map(p => `
              <tr>
                <td class="celda-tarjeta-titulo">${esc(p.tecnico_nombre)}${p.notas ? `<div class="celda-meta" style="white-space:normal;">${esc(p.notas)}</div>` : ''}<div class="celda-meta">Creado ${fechaLocal(p.creado_en)}</div></td>
                <td data-label="Actividades">${p.num_actividades}</td>
                <td data-label="Total"><b>${mxn(p.monto)}</b></td>
                <td data-label="Pagado">${p.pagado > 0 ? `${mxn(p.pagado)}${p.num_abonos > 1 ? `<div class="celda-meta">${p.num_abonos} pagos</div>` : ''}` : '—'}</td>
                <td data-label="Falta">${p.saldo > 0 ? `<b>${mxn(p.saldo)}</b>` : '—'}</td>
                <td data-label="Estado">${pillPago(p.estado)}${p.fecha_pago ? `<div class="celda-meta">${fechaCorta(p.fecha_pago)}</div>` : ''}</td>
                <td class="celda-acciones-movil"><div class="fila-acciones">
                  <button class="btn btn-secundario btn-sm" data-ver-pago="${p.id}">Ver</button>
                  ${p.estado !== 'pagado' ? `<button class="btn btn-verde btn-sm" data-pagar="${p.id}" style="white-space:nowrap;">Registrar pago</button>` : ''}
                </div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div></div>`;
  }

  // ---------- ventana: detalle de un pago ----------
  async function abrirDetallePago(id) {
    modalCont.innerHTML = `<div class="modal-fondo"><div class="modal"><div class="modal-cuerpo"><div class="cargando">Cargando…</div></div></div></div>`;
    let p, disponibles = [];
    try {
      p = await API.get(`${BASE}/${id}`);
      if (p.estado === 'pendiente') disponibles = await API.get(`${BASE}/por-agrupar?tecnico_id=${p.tecnico_id}`);
    } catch (err) { modalCont.innerHTML = ''; alert(err.message); return; }

    const editable = p.estado !== 'pagado';          // total y notas
    const editaActs = p.estado === 'pendiente';      // actividades (solo mientras no haya abonos)
    const porcentaje = p.monto > 0 ? Math.min(100, Math.round((p.pagado / p.monto) * 100)) : 0;
    const lineaAct = (a, incluida) => `
      <label ${editaActs ? '' : 'style="cursor:default;"'}>
        ${editaActs ? `<input type="checkbox" data-incl="${a.id}" ${incluida ? 'checked' : ''} />` : '<span>•</span>'}
        <span>${esc(a.titulo)}<span class="texto-gris"> · ${ETIQUETA_TIPO[a.tipo] || esc(a.tipo)} · ${fechaAct(a)}${a.cliente_folio ? ` · ${esc(a.cliente_folio)}` : ''}</span></span>
      </label>`;

    modalCont.innerHTML = `
      <div class="modal-fondo"><div class="modal">
        <div class="modal-cabecera">
          <h3>Pago a ${esc(p.tecnico_nombre)} <span style="margin-left:8px; vertical-align:middle;">${pillPago(p.estado)}</span></h3>
          <button class="cerrar-modal" id="cerrar-modal">&times;</button>
        </div>
        <div class="modal-cuerpo">
          <div id="dp-error" class="error-msg oculto"></div>

          <div class="grid-kpi" style="grid-template-columns: repeat(3, 1fr); gap:10px; margin-bottom:${p.pagado > 0 ? '10px' : '16px'};">
            <div class="kpi borde-azul" style="padding:10px 12px;"><div class="kpi-etiqueta">Total</div><div class="kpi-valor" style="font-size:18px;">${mxn(p.monto)}</div></div>
            <div class="kpi borde-verde" style="padding:10px 12px;"><div class="kpi-etiqueta">Pagado</div><div class="kpi-valor" style="font-size:18px;">${mxn(p.pagado)}</div></div>
            <div class="kpi ${p.saldo > 0 ? 'borde-naranja' : 'borde-verde'}" style="padding:10px 12px;"><div class="kpi-etiqueta">Falta</div><div class="kpi-valor" style="font-size:18px;">${p.saldo > 0 ? mxn(p.saldo) : '✅ $0.00'}</div></div>
          </div>
          ${p.pagado > 0 ? `<div class="barra-progreso" style="margin:0 0 16px;"><div class="barra-progreso-relleno" style="width:${porcentaje}%;"></div></div>` : ''}

          ${editable ? `
            <div class="grid-formulario">
              <div class="campo"><label>Total del pago${p.pagado > 0 ? ` (no menor a ${mxn(p.pagado)})` : ''}</label>
                <input type="number" id="dp-monto" min="${p.pagado > 0 ? p.pagado : 0.01}" step="0.01" inputmode="decimal" value="${p.monto}" /></div>
              <div class="campo ancho-total"><label>Notas</label><textarea id="dp-notas" rows="2">${esc(p.notas || '')}</textarea></div>
            </div>` : (p.notas ? `<div style="font-size:13px; margin-bottom:12px;"><b>Notas:</b> ${esc(p.notas)}</div>` : '')}

          ${p.abonos.length ? `
            <h4 style="font-size:13px; margin:${editable ? '4px' : '0'} 0 8px;">Pagos registrados (cada uno ya está en <a href="/finanzas.html">Finanzas</a>)</h4>
            <div class="lista-check" style="margin-bottom:16px;">
              ${p.abonos.map((a, i) => `
                <label style="cursor:default; align-items:center; justify-content:space-between;">
                  <span><b>${mxn(a.monto)}</b> <span class="texto-gris">· ${fechaCorta(a.fecha)} · ${esc(METODOS[a.metodo_pago] || a.metodo_pago)}${a.notas ? ` · ${esc(a.notas)}` : ''}</span></span>
                  <button type="button" class="btn btn-peligro btn-sm" data-deshacer-abono="${a.id}" data-monto="${a.monto}" data-fecha="${esc(String(a.fecha).slice(0, 10))}">Deshacer</button>
                </label>`).join('')}
            </div>` : ''}

          <h4 style="font-size:13px; margin:0 0 8px;">${editaActs ? 'Actividades incluidas (quita la palomita para sacar alguna)' : `Actividades incluidas (${p.actividades.length})`}</h4>
          ${!editaActs && p.estado === 'parcial' ? `<div class="texto-gris" style="font-size:11.5px; margin:-4px 0 8px;">Como ya tiene pagos registrados, las actividades quedan fijas.</div>` : ''}
          <div class="lista-check">${p.actividades.length ? p.actividades.map(a => lineaAct(a, true)).join('') : '<label class="texto-gris">Este pago se quedó sin actividades.</label>'}</div>
          ${editaActs && disponibles.length ? `
            <h4 style="font-size:13px; margin:16px 0 8px;">Agregar otras actividades terminadas de ${esc(p.tecnico_nombre)}</h4>
            <div class="lista-check">${disponibles.map(a => lineaAct(a, false)).join('')}</div>` : ''}
        </div>
        <div class="modal-pie" style="justify-content:space-between; flex-wrap:wrap;">
          <div>${p.estado === 'pendiente' ? `<button class="btn btn-peligro" id="dp-cancelar-pago">Cancelar este pago</button>`
            : p.estado === 'parcial' ? `<span class="texto-gris" style="font-size:11.5px;">Para cancelarlo, deshaz antes sus pagos.</span>` : ''}</div>
          <div class="flex-gap" style="margin-left:auto;">
            <button class="btn btn-secundario" id="dp-cerrar">Cerrar</button>
            ${editable ? `<button class="btn btn-secundario" id="dp-guardar">Guardar cambios</button>
                          <button class="btn btn-verde" id="dp-pagar">Registrar pago…</button>` : ''}
          </div>
        </div>
      </div></div>`;
    const err = document.getElementById('dp-error');
    const mostrarError = (m) => { err.textContent = m; err.classList.remove('oculto'); };
    document.getElementById('cerrar-modal').addEventListener('click', cerrarModal);
    document.getElementById('dp-cerrar').addEventListener('click', cerrarModal);

    // deshacer UN pago registrado
    modalCont.querySelectorAll('[data-deshacer-abono]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm(`¿Deshacer el pago de ${mxn(btn.dataset.monto)} del ${btn.dataset.fecha}?\n\nSe borrará su egreso de Finanzas y ese dinero volverá a figurar como pendiente.`)) return;
      try {
        await API.del(`${BASE}/${id}/abonos/${btn.dataset.deshacerAbono}`);
        aviso = `↩️ Pago de ${mxn(btn.dataset.monto)} deshecho: su egreso ya no aparece en Finanzas.`;
        if (filtroEstadoPago === 'pagado') filtroEstadoPago = 'por_pagar'; // ya no está liquidado: que no desaparezca de la lista
        await recargar();
        abrirDetallePago(id);
      } catch (e2) { mostrarError(e2.message); }
    }));

    if (editable) {
      document.getElementById('dp-guardar').addEventListener('click', async (e) => {
        const monto = Number(document.getElementById('dp-monto').value);
        if (!(monto > 0)) return mostrarError('El total debe ser mayor a 0.');
        if (monto < p.pagado) return mostrarError(`Ya se han pagado ${mxn(p.pagado)}: el total no puede ser menor.`);
        const cambios = { monto, notas: document.getElementById('dp-notas').value.trim() };
        if (editaActs) {
          const ids = [...modalCont.querySelectorAll('[data-incl]:checked')].map(x => Number(x.dataset.incl));
          if (!ids.length) return mostrarError('Deja al menos una actividad, o usa "Cancelar este pago".');
          cambios.actividad_ids = ids;
        }
        const btn = e.currentTarget; btn.disabled = true;
        try {
          await API.put(`${BASE}/${id}`, cambios);
          cerrarModal(); aviso = monto === p.pagado ? '✅ Cambios guardados: con ese total el pago quedó liquidado.' : '✅ Cambios guardados.'; await recargar();
        } catch (e2) { mostrarError(e2.message); btn.disabled = false; }
      });
      document.getElementById('dp-pagar').addEventListener('click', () => abrirModalPagar(p));
    }
    if (p.estado === 'pendiente') {
      document.getElementById('dp-cancelar-pago').addEventListener('click', async () => {
        if (!confirm(`¿Cancelar este pago de ${mxn(p.monto)} a ${p.tecnico_nombre}?\nSus actividades quedarán libres otra vez para agruparlas de nuevo.`)) return;
        try { await API.del(`${BASE}/${id}`); cerrarModal(); aviso = 'Pago cancelado. Sus actividades quedaron libres otra vez.'; pestana = 'agrupar'; await recargar(); }
        catch (e2) { mostrarError(e2.message); }
      });
    }
  }

  // ---------- ventana: registrar un pago (completo o una parte) ----------
  function abrirModalPagar(p) {
    const saldo = p.saldo;
    modalCont.innerHTML = `
      <div class="modal-fondo"><div class="modal">
        <div class="modal-cabecera"><h3>Registrar pago</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
        <div class="modal-cuerpo">
          <div id="mp-error" class="error-msg oculto"></div>
          <p style="margin-top:0; font-size:14px;"><b>${esc(p.tecnico_nombre)}</b> · ${textoActividades(p.num_actividades ?? (p.actividades || []).length)}</p>
          <div class="grid-kpi" style="grid-template-columns: repeat(3, 1fr); gap:10px; margin-bottom:14px;">
            <div class="kpi borde-azul" style="padding:10px 12px;"><div class="kpi-etiqueta">Total</div><div class="kpi-valor" style="font-size:17px;">${mxn(p.monto)}</div></div>
            <div class="kpi borde-verde" style="padding:10px 12px;"><div class="kpi-etiqueta">Ya pagado</div><div class="kpi-valor" style="font-size:17px;">${mxn(p.pagado)}</div></div>
            <div class="kpi borde-naranja" style="padding:10px 12px;"><div class="kpi-etiqueta">Falta</div><div class="kpi-valor" style="font-size:17px;">${mxn(saldo)}</div></div>
          </div>
          <div class="grid-formulario">
            <div class="campo ancho-total">
              <label>¿Cuánto le pagas ahora?</label>
              <div class="ubicacion-campo">
                <input type="number" id="mp-monto" min="0.01" max="${saldo}" step="0.01" inputmode="decimal" value="${saldo}" />
                <button type="button" class="btn btn-secundario btn-sm" id="mp-todo" style="white-space:nowrap;">Todo lo que falta</button>
              </div>
            </div>
            <div class="campo"><label>Fecha de pago</label><input type="date" id="mp-fecha" value="${hoyLocal()}" /></div>
            <div class="campo"><label>Método</label>
              <select id="mp-metodo">${Object.entries(METODOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
            </div>
            <div class="campo ancho-total"><label>Nota de este pago (opcional)</label><input type="text" id="mp-notas" placeholder="Ej. Anticipo, o segunda parte" /></div>
          </div>
          <div class="aviso-ok" id="mp-resumen" style="margin-top:6px; background:var(--sem-amarillo-bg); color:var(--sem-amarillo);"></div>
        </div>
        <div class="modal-pie">
          <button class="btn btn-secundario" id="mp-volver">Volver</button>
          <button class="btn btn-verde" id="mp-confirmar">Confirmar pago</button>
        </div>
      </div></div>`;
    const inputMonto = document.getElementById('mp-monto');
    const resumenEl = document.getElementById('mp-resumen');
    const centavos = (n) => Math.round(Number(n) * 100);
    const actualizarResumen = () => {
      const m = Number(inputMonto.value);
      if (!(m > 0)) { resumenEl.innerHTML = 'Escribe cuánto le vas a pagar ahora.'; return; }
      const resta = centavos(saldo) - centavos(m);
      resumenEl.innerHTML = resta < 0
        ? `⚠️ Eso es más de lo que falta (${mxn(saldo)}).`
        : `Se registrará un <b>egreso de ${mxn(m)}</b> en Finanzas (categoría “Pago a técnicos”), en el mes de la fecha de pago. ${
            resta === 0 ? '<b>Con esto queda liquidado.</b>' : `Después faltarán <b>${mxn(resta / 100)}</b>.`} Si te equivocas puedes deshacerlo.`;
    };
    inputMonto.addEventListener('input', actualizarResumen);
    document.getElementById('mp-todo').addEventListener('click', () => { inputMonto.value = saldo; actualizarResumen(); });
    actualizarResumen();
    document.getElementById('cerrar-modal').addEventListener('click', cerrarModal);
    document.getElementById('mp-volver').addEventListener('click', () => abrirDetallePago(p.id));
    document.getElementById('mp-confirmar').addEventListener('click', async (e) => {
      const err = document.getElementById('mp-error');
      const mostrar = (m) => { err.textContent = m; err.classList.remove('oculto'); };
      const monto = Number(inputMonto.value);
      const fecha = document.getElementById('mp-fecha').value;
      if (!(monto > 0)) return mostrar('Escribe cuánto le vas a pagar ahora (mayor a 0).');
      if (centavos(monto) > centavos(saldo)) return mostrar(`No puedes pagar más de lo que falta (${mxn(saldo)}).`);
      if (!fecha) return mostrar('Elige la fecha de pago.');
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Registrando…';
      try {
        const r = await API.post(`${BASE}/${p.id}/abonos`, {
          monto, fecha_pago: fecha, metodo_pago: document.getElementById('mp-metodo').value, notas: document.getElementById('mp-notas').value.trim()
        });
        cerrarModal();
        aviso = r.estado === 'pagado'
          ? `✅ <b>${mxn(monto)}</b> a ${esc(p.tecnico_nombre)} registrado: el pago quedó <b>liquidado</b>. Ya aparece como egreso en <a href="/finanzas.html">Finanzas</a>.`
          : `✅ <b>${mxn(monto)}</b> a ${esc(p.tecnico_nombre)} registrado (ya aparece en <a href="/finanzas.html">Finanzas</a>). Todavía falta <b>${mxn(r.saldo)}</b>.`;
        filtroEstadoPago = 'por_pagar';
        await recargar();
      } catch (e2) { mostrar(e2.message); btn.disabled = false; btn.textContent = 'Confirmar pago'; }
    });
  }

  // ==========================================================
  // PESTAÑA 3: fuera de pago
  // ==========================================================
  function renderFuera() {
    const c = document.getElementById('pt-contenido');
    c.innerHTML = `
      <div class="tarjeta">
        <div class="tarjeta-cabecera"><h3>Actividades que dejaste fuera del control de pago</h3></div>
        <div class="tarjeta-cuerpo tabla-envoltura">
          ${fuera.length ? `
            <table class="tabla">
              <thead><tr><th>Actividad</th><th>Técnico</th><th>Tipo</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
              <tbody>
                ${fuera.map(a => `
                  <tr>
                    <td class="celda-tarjeta-titulo">${esc(a.titulo)}${a.cliente_folio ? `<div class="celda-meta"><span class="folio">${esc(a.cliente_folio)}</span> ${esc(a.cliente_nombre)}</div>` : ''}</td>
                    <td data-label="Técnico">${esc(a.tecnico_nombre)}</td>
                    <td data-label="Tipo"><span class="pill tipo-${esc(a.tipo)}">${ETIQUETA_TIPO[a.tipo] || esc(a.tipo)}</span></td>
                    <td data-label="Estado"><span class="pill ${esc(a.estado)}">${ETIQUETA_ESTADO_ACT[a.estado] || esc(a.estado)}</span></td>
                    <td data-label="Fecha">${fechaAct(a)}</td>
                    <td class="celda-acciones-movil"><button class="btn btn-secundario btn-sm" data-incluir="${a.id}">Volver a incluir</button></td>
                  </tr>`).join('')}
              </tbody>
            </table>` : `<div class="estado-vacio">No has dejado ninguna actividad fuera.</div>`}
          <p class="texto-gris" style="font-size:12px; margin:14px 0 0;">
            Las actividades asignadas a un administrador, y las de categoría Libranza, nunca cuentan para pago y no aparecen en esta lista.
          </p>
        </div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-cabecera"><h3>Dejar fuera lo anterior a una fecha</h3></div>
        <div class="tarjeta-cuerpo">
          <p class="texto-gris" style="margin-top:0; font-size:12.5px;">
            Útil para no arrancar con todo tu historial como “por pagar”: lo que se terminó <b>antes</b> de la fecha que elijas
            (y que aún no está en un pago) se deja fuera del control. Es reversible con “Volver a incluir”.
          </p>
          <div class="flex-gap" style="gap:12px;">
            <div class="campo" style="margin:0;"><label>Terminadas antes de</label><input type="date" id="pt-corte-fecha" /></div>
            <div class="campo" style="margin:0;"><label>Técnico</label>
              <select id="pt-corte-tec" style="padding:10px 12px; border:1px solid var(--borde); border-radius:6px;">
                <option value="">Todos</option>
                ${tecnicos.map(t => `<option value="${t.id}" ${String(t.id) === filtroTecnico ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}
              </select>
            </div>
            <button class="btn btn-secundario" id="pt-corte-revisar" style="align-self:flex-end;">Ver cuántas son</button>
          </div>
          <div id="pt-corte-resultado" style="margin-top:14px;"></div>
        </div>
      </div>`;
  }

  async function revisarCorte() {
    const fecha = document.getElementById('pt-corte-fecha').value;
    const tec = document.getElementById('pt-corte-tec').value;
    const out = document.getElementById('pt-corte-resultado');
    if (!fecha) { out.innerHTML = '<div class="error-msg">Elige una fecha.</div>'; return; }
    const body = { hasta: fecha, tecnico_id: tec || undefined };
    try {
      const r = await API.post(`${BASE}/excluir-anteriores`, { ...body, solo_contar: true });
      if (!r.cantidad) { out.innerHTML = '<div class="texto-gris">No hay actividades por pagar anteriores a esa fecha.</div>'; return; }
      out.innerHTML = `
        <div class="aviso-ok" style="background:var(--sem-amarillo-bg); color:var(--sem-amarillo);">
          Se dejarían fuera <b>${textoActividades(r.cantidad)}</b> terminadas antes del ${fechaCorta(fecha)}.
        </div>
        <button class="btn btn-primario" id="pt-corte-aplicar">Dejar fuera estas ${r.cantidad}</button>`;
      document.getElementById('pt-corte-aplicar').addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        try {
          const a = await API.post(`${BASE}/excluir-anteriores`, body);
          aviso = `✅ Se dejaron fuera ${textoActividades(a.cantidad)}. Puedes regresarlas con “Volver a incluir”.`;
          await recargar();
        } catch (err) { out.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`; }
      });
    } catch (err) { out.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`; }
  }

  // ==========================================================
  // EVENTOS (delegados: sobreviven a los re-renders)
  // ==========================================================
  function conectarEventos() {
    cont.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-tab],[data-agrupar],[data-excluir],[data-ver-pago],[data-pagar],[data-incluir],#pt-corte-revisar');
      if (!t) return;

      if (t.dataset.tab) { pestana = t.dataset.tab; aviso = ''; render(); return; }
      if (t.dataset.agrupar) { abrirModalNuevoPago(Number(t.dataset.agrupar)); return; }
      if (t.dataset.verPago) { abrirDetallePago(Number(t.dataset.verPago)); return; }
      if (t.dataset.pagar) {
        const p = pagos.find(x => x.id === Number(t.dataset.pagar));
        if (p) abrirModalPagar(p);
        return;
      }
      if (t.id === 'pt-corte-revisar') { revisarCorte(); return; }

      try {
        if (t.dataset.excluir) {
          const id = Number(t.dataset.excluir);
          await API.post(`${BASE}/excluir`, { actividad_ids: [id] });
          seleccion.delete(id); aviso = '🚫 Actividad dejada fuera: ya no cuenta para pago. La encuentras en la pestaña “Sin pago”.';
          await recargar();
        } else if (t.dataset.incluir) {
          await API.post(`${BASE}/incluir`, { actividad_ids: [Number(t.dataset.incluir)] });
          aviso = '✅ Actividad incluida de nuevo: ya aparece en “Por agrupar”.';
          await recargar();
        }
      } catch (err) { alert(err.message); recargar(); }
    });

    cont.addEventListener('change', (e) => {
      const chk = e.target;
      if (chk.matches('[data-act]')) {
        const id = Number(chk.dataset.act);
        chk.checked ? seleccion.add(id) : seleccion.delete(id);
        actualizarBotonesAgrupar();
      } else if (chk.matches('#pt-estado-pago')) {
        // (delegado aquí para que funcione también cuando la lista está vacía)
        filtroEstadoPago = chk.value;
        recargar();
      } else if (chk.matches('[data-todas]')) {
        porAgrupar.filter(a => a.tecnico_id === Number(chk.dataset.todas)).forEach(a => chk.checked ? seleccion.add(a.id) : seleccion.delete(a.id));
        document.querySelectorAll(`[data-act][data-tec="${chk.dataset.todas}"]`).forEach(x => { x.checked = chk.checked; });
        actualizarBotonesAgrupar();
      }
    });
  }
})();
