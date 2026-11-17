(async function () {
  const usuario = protegerPagina(['admin']);
  if (!usuario) return;

  renderLayout('cuentas-por-pagar', 'Cuentas por pagar');
  const cont = document.getElementById('pagina-contenido');
  const BASE = '/api/finanzas/cuentas-por-pagar';

  const METODOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', deposito: 'Depósito', tarjeta: 'Tarjeta' };

  let pestana = 'por_pagar';   // 'por_pagar' | 'vencida' | 'pagada'
  let busqueda = '';
  let cuentas = [], resumen = null, categorias = [];
  let aviso = '';

  // ---------- utilidades ----------
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const centavos = (n) => Math.round(Number(n) * 100);
  const fechaInput = (f) => (f ? String(f).slice(0, 10) : '');

  function estadoVisible(c) {
    if (c.estado === 'pagada') return ['cx-pagada', 'Pagada'];
    if (c.vencida) return ['cx-vencida', 'Vencida'];
    if (c.estado === 'parcial') return ['cx-parcial', 'Parcial'];
    return ['cx-pendiente', 'Por pagar'];
  }
  const pill = (c) => { const [clase, txt] = estadoVisible(c); return `<span class="pill ${clase}">${txt}</span>`; };

  function textoVence(c) {
    if (c.estado === 'pagada') return '';
    const d = c.dias_para_vencer;
    if (d < 0) return `<span class="cx-vence-rojo">venció hace ${-d} día${d === -1 ? '' : 's'}</span>`;
    if (d === 0) return `<span class="cx-vence-ambar">vence hoy</span>`;
    if (d === 1) return `<span class="cx-vence-ambar">vence mañana</span>`;
    if (d <= 7) return `<span class="cx-vence-ambar">vence en ${d} días</span>`;
    return `vence en ${d} días`;
  }

  cont.innerHTML = `
    <div class="grid-kpi" id="cx-kpis"></div>
    <div class="tarjeta">
      <div class="tarjeta-cuerpo">
        <div class="flex-entre" style="flex-wrap:wrap; gap:12px;">
          <div class="flex-gap" style="flex:1; gap:12px;">
            <input type="text" id="cx-buscar" class="cx-buscador" placeholder="Buscar por proveedor o concepto…" />
            <span class="texto-gris" style="font-size:12px; flex:1; min-width:240px;">
              Captura lo que debes a tus proveedores. <b>No se refleja en Finanzas</b> hasta que registres un pago
              (completo o en partes): cada pago crea su egreso.
            </span>
          </div>
          <button class="btn btn-verde" id="cx-nueva">+ Nueva cuenta</button>
        </div>
      </div>
    </div>
    <div id="cx-aviso"></div>
    <div class="tabs" id="cx-tabs"></div>
    <div id="cx-contenido"><div class="cargando">Cargando…</div></div>
    <div id="modal-contenedor"></div>
  `;

  const modalCont = document.getElementById('modal-contenedor');
  const cerrarModal = () => { modalCont.innerHTML = ''; };

  try { categorias = await API.get('/api/catalogos/egresos-categorias'); } catch (e) { categorias = []; }

  let temporizador;
  document.getElementById('cx-buscar').addEventListener('input', (e) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { busqueda = e.target.value.trim(); recargar(); }, 300);
  });
  document.getElementById('cx-nueva').addEventListener('click', () => abrirModalNueva());
  cont.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab],[data-ver],[data-pagar]');
    if (!t) return;
    if (t.dataset.tab) { pestana = t.dataset.tab; aviso = ''; recargar(); return; }
    if (t.dataset.ver) { abrirDetalle(Number(t.dataset.ver)); return; }
    if (t.dataset.pagar) {
      const c = cuentas.find(x => x.id === Number(t.dataset.pagar));
      if (c) abrirModalPagar(c);
    }
  });

  await recargar();

  // ==========================================================
  // CARGA
  // ==========================================================
  async function recargar() {
    try {
      const qs = new URLSearchParams({ estado: pestana });
      if (busqueda) qs.set('q', busqueda);
      [resumen, cuentas] = await Promise.all([API.get(`${BASE}/resumen`), API.get(`${BASE}?${qs}`)]);
      render();
    } catch (err) {
      document.getElementById('cx-contenido').innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
    }
  }

  function render() {
    const r = resumen;
    document.getElementById('cx-kpis').innerHTML = `
      <div class="kpi borde-azul">
        <div class="kpi-etiqueta">Total por pagar</div>
        <div class="kpi-valor">${mxn(r.total_por_pagar)}</div>
        <div class="texto-gris" style="font-size:11.5px; margin-top:2px;">${r.cuentas_por_pagar} cuenta${r.cuentas_por_pagar === 1 ? '' : 's'}${r.cuentas_parciales ? ` (${r.cuentas_parciales} en partes)` : ''} · aún no está en Finanzas</div>
      </div>
      <div class="kpi borde-amarillo">
        <div class="kpi-etiqueta">Vence esta semana</div>
        <div class="kpi-valor">${mxn(r.vence_semana)}</div>
        <div class="texto-gris" style="font-size:11.5px; margin-top:2px;">${r.cuentas_semana} cuenta${r.cuentas_semana === 1 ? '' : 's'} en los próximos 7 días</div>
      </div>
      <div class="kpi ${r.vencido > 0 ? 'borde-rojo' : 'borde-verde'}">
        <div class="kpi-etiqueta">Vencido</div>
        <div class="kpi-valor">${mxn(r.vencido)}</div>
        <div class="texto-gris" style="font-size:11.5px; margin-top:2px;">${r.cuentas_vencidas ? `${r.cuentas_vencidas} cuenta${r.cuentas_vencidas === 1 ? '' : 's'} fuera de fecha` : 'nada vencido 🎉'}</div>
      </div>
      <div class="kpi borde-verde">
        <div class="kpi-etiqueta">Pagado este mes</div>
        <div class="kpi-valor">${mxn(r.pagado_mes)}</div>
        <div class="texto-gris" style="font-size:11.5px; margin-top:2px;">ya registrado en Finanzas</div>
      </div>`;

    document.getElementById('cx-aviso').innerHTML = aviso ? `<div class="aviso-ok">${aviso}</div>` : '';

    const tab = (id, texto, n) => `<button class="tab ${pestana === id ? 'activa' : ''}" data-tab="${id}">${texto}<span class="tab-contador">${n}</span></button>`;
    document.getElementById('cx-tabs').innerHTML =
      tab('por_pagar', 'Por pagar', r.cuentas_por_pagar) +
      tab('vencida', 'Vencidas', r.cuentas_vencidas) +
      tab('pagada', 'Pagadas', r.cuentas_pagadas);

    const c = document.getElementById('cx-contenido');
    if (!cuentas.length) {
      const vacio = busqueda ? 'No hay cuentas que coincidan con tu búsqueda.'
        : pestana === 'por_pagar' ? 'No tienes cuentas por pagar. 🎉'
        : pestana === 'vencida' ? 'No tienes cuentas vencidas. 🎉' : 'Aún no has liquidado ninguna cuenta.';
      c.innerHTML = `<div class="tarjeta"><div class="tarjeta-cuerpo estado-vacio">${vacio}</div></div>`;
      return;
    }
    c.innerHTML = `
      <div class="tarjeta"><div class="tarjeta-cuerpo tabla-envoltura">
        <table class="tabla">
          <thead><tr><th>Proveedor</th><th>Vencimiento</th><th>Total</th><th>Pagado</th><th>Falta</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${cuentas.map(x => `
              <tr>
                <td class="celda-tarjeta-titulo"><div class="celda-principal">${esc(x.proveedor)}</div>
                  <div class="celda-meta" style="white-space:normal;">${esc(x.concepto)}${x.categoria_nombre ? ` · ${esc(x.categoria_nombre)}` : ''}</div></td>
                <td data-label="Vencimiento">${fechaCorta(x.fecha_vencimiento)}<div class="celda-meta">${x.estado === 'pagada' ? `pagada ${fechaCorta(x.fecha_pago)}` : textoVence(x)}</div></td>
                <td data-label="Total"><b>${mxn(x.monto)}</b></td>
                <td data-label="Pagado">${x.pagado > 0 ? `${mxn(x.pagado)}${x.num_abonos > 1 ? `<div class="celda-meta">${x.num_abonos} pagos</div>` : ''}` : '—'}</td>
                <td data-label="Falta">${x.saldo > 0 ? `<b>${mxn(x.saldo)}</b>` : '—'}</td>
                <td data-label="Estado">${pill(x)}</td>
                <td class="celda-acciones-movil"><div class="fila-acciones">
                  <button class="btn btn-secundario btn-sm" data-ver="${x.id}">Ver</button>
                  ${x.estado !== 'pagada' ? `<button class="btn btn-verde btn-sm" data-pagar="${x.id}" style="white-space:nowrap;">Registrar pago</button>` : ''}
                </div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div></div>`;
  }

  // ==========================================================
  // VENTANA: nueva cuenta
  // ==========================================================
  const opcionesCategoria = (sel) => `<option value="">Cuentas por pagar (por omisión)</option>` +
    categorias.map(c => `<option value="${c.id}" ${String(c.id) === String(sel) ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');

  function abrirModalNueva() {
    modalCont.innerHTML = `
      <div class="modal-fondo"><div class="modal">
        <div class="modal-cabecera"><h3>Nueva cuenta por pagar</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
        <div class="modal-cuerpo">
          <div id="nc-error" class="error-msg oculto"></div>
          <div class="grid-formulario">
            <div class="campo"><label>Proveedor</label><input type="text" id="nc-proveedor" maxlength="120" placeholder="Ej. Proveedor de internet" /></div>
            <div class="campo"><label>Concepto</label><input type="text" id="nc-concepto" maxlength="150" placeholder="Ej. Renta de enlace, factura 1234" /></div>
            <div class="campo"><label>Monto total</label><input type="number" id="nc-monto" min="0.01" step="0.01" inputmode="decimal" /></div>
            <div class="campo"><label>Fecha de vencimiento</label><input type="date" id="nc-vence" value="${hoyLocal()}" /></div>
            <div class="campo ancho-total"><label>Categoría en Finanzas (al pagar)</label><select id="nc-categoria">${opcionesCategoria('')}</select></div>
            <div class="campo ancho-total"><label>Notas (opcional)</label><textarea id="nc-notas" rows="2"></textarea></div>
          </div>
        </div>
        <div class="modal-pie">
          <button class="btn btn-secundario" id="nc-cancelar">Cancelar</button>
          <button class="btn btn-verde" id="nc-guardar">Guardar cuenta</button>
        </div>
      </div></div>`;
    document.getElementById('cerrar-modal').addEventListener('click', cerrarModal);
    document.getElementById('nc-cancelar').addEventListener('click', cerrarModal);
    document.getElementById('nc-guardar').addEventListener('click', async (e) => {
      const err = document.getElementById('nc-error');
      const mostrar = (m) => { err.textContent = m; err.classList.remove('oculto'); };
      const proveedor = document.getElementById('nc-proveedor').value.trim();
      const concepto = document.getElementById('nc-concepto').value.trim();
      const monto = Number(document.getElementById('nc-monto').value);
      const vence = document.getElementById('nc-vence').value;
      if (!proveedor) return mostrar('Escribe el proveedor.');
      if (!concepto) return mostrar('Escribe el concepto.');
      if (!(monto > 0)) return mostrar('El monto debe ser mayor a 0.');
      if (!vence) return mostrar('Elige la fecha de vencimiento.');
      const btn = e.currentTarget; btn.disabled = true;
      try {
        await API.post(BASE, {
          proveedor, concepto, monto, fecha_vencimiento: vence,
          categoria_id: document.getElementById('nc-categoria').value || null,
          notas: document.getElementById('nc-notas').value.trim()
        });
        cerrarModal();
        aviso = `✅ Cuenta de <b>${esc(proveedor)}</b> por ${mxn(monto)} guardada. No afecta Finanzas hasta que registres un pago.`;
        pestana = 'por_pagar'; busqueda = ''; document.getElementById('cx-buscar').value = '';
        await recargar();
      } catch (e2) { mostrar(e2.message); btn.disabled = false; }
    });
    document.getElementById('nc-proveedor').focus();
  }

  // ==========================================================
  // VENTANA: detalle / edición de una cuenta
  // ==========================================================
  async function abrirDetalle(id) {
    modalCont.innerHTML = `<div class="modal-fondo"><div class="modal"><div class="modal-cuerpo"><div class="cargando">Cargando…</div></div></div></div>`;
    let c;
    try { c = await API.get(`${BASE}/${id}`); }
    catch (err) { modalCont.innerHTML = ''; alert(err.message); return; }

    const editable = c.estado !== 'pagada';
    const porcentaje = c.monto > 0 ? Math.min(100, Math.round((c.pagado / c.monto) * 100)) : 0;
    modalCont.innerHTML = `
      <div class="modal-fondo"><div class="modal">
        <div class="modal-cabecera">
          <h3>${esc(c.proveedor)} <span style="margin-left:8px; vertical-align:middle;">${pill(c)}</span></h3>
          <button class="cerrar-modal" id="cerrar-modal">&times;</button>
        </div>
        <div class="modal-cuerpo">
          <div id="dc-error" class="error-msg oculto"></div>
          <div class="grid-kpi" style="grid-template-columns: repeat(3, 1fr); gap:10px; margin-bottom:${c.pagado > 0 ? '10px' : '16px'};">
            <div class="kpi borde-azul" style="padding:10px 12px;"><div class="kpi-etiqueta">Total</div><div class="kpi-valor" style="font-size:18px;">${mxn(c.monto)}</div></div>
            <div class="kpi borde-verde" style="padding:10px 12px;"><div class="kpi-etiqueta">Pagado</div><div class="kpi-valor" style="font-size:18px;">${mxn(c.pagado)}</div></div>
            <div class="kpi ${c.saldo > 0 ? 'borde-naranja' : 'borde-verde'}" style="padding:10px 12px;"><div class="kpi-etiqueta">Falta</div><div class="kpi-valor" style="font-size:18px;">${c.saldo > 0 ? mxn(c.saldo) : '✅ $0.00'}</div></div>
          </div>
          ${c.pagado > 0 ? `<div class="barra-progreso" style="margin:0 0 16px;"><div class="barra-progreso-relleno" style="width:${porcentaje}%;"></div></div>` : ''}

          ${editable ? `
            <div class="grid-formulario">
              <div class="campo"><label>Proveedor</label><input type="text" id="dc-proveedor" maxlength="120" value="${esc(c.proveedor)}" /></div>
              <div class="campo"><label>Concepto</label><input type="text" id="dc-concepto" maxlength="150" value="${esc(c.concepto)}" /></div>
              <div class="campo"><label>Monto total${c.pagado > 0 ? ` (no menor a ${mxn(c.pagado)})` : ''}</label>
                <input type="number" id="dc-monto" min="${c.pagado > 0 ? c.pagado : 0.01}" step="0.01" inputmode="decimal" value="${c.monto}" /></div>
              <div class="campo"><label>Fecha de vencimiento</label><input type="date" id="dc-vence" value="${fechaInput(c.fecha_vencimiento)}" /></div>
              <div class="campo ancho-total"><label>Categoría en Finanzas (al pagar)</label><select id="dc-categoria">${opcionesCategoria(c.categoria_id)}</select></div>
              <div class="campo ancho-total"><label>Notas</label><textarea id="dc-notas" rows="2">${esc(c.notas || '')}</textarea></div>
            </div>` : `
            <div style="font-size:13px; margin-bottom:12px; line-height:1.7;">
              <b>Concepto:</b> ${esc(c.concepto)}<br>
              <b>Vencía:</b> ${fechaCorta(c.fecha_vencimiento)} · <b>Liquidada:</b> ${fechaCorta(c.fecha_pago)}
              ${c.categoria_nombre ? `<br><b>Categoría:</b> ${esc(c.categoria_nombre)}` : ''}
              ${c.notas ? `<br><b>Notas:</b> ${esc(c.notas)}` : ''}
            </div>`}

          ${c.abonos.length ? `
            <h4 style="font-size:13px; margin:4px 0 8px;">Pagos registrados (cada uno ya está en <a href="/finanzas.html">Finanzas</a>)</h4>
            <div class="lista-check">
              ${c.abonos.map(a => `
                <label style="cursor:default; align-items:center; justify-content:space-between;">
                  <span><b>${mxn(a.monto)}</b> <span class="texto-gris">· ${fechaCorta(a.fecha)} · ${esc(METODOS[a.metodo_pago] || a.metodo_pago)}${a.notas ? ` · ${esc(a.notas)}` : ''}</span></span>
                  <button type="button" class="btn btn-peligro btn-sm" data-deshacer="${a.id}" data-monto="${a.monto}" data-fecha="${esc(fechaInput(a.fecha))}">Deshacer</button>
                </label>`).join('')}
            </div>` : ''}
        </div>
        <div class="modal-pie" style="justify-content:space-between; flex-wrap:wrap;">
          <div>${c.estado === 'pendiente' ? `<button class="btn btn-peligro" id="dc-eliminar">Eliminar cuenta</button>`
            : c.estado === 'parcial' ? `<span class="texto-gris" style="font-size:11.5px;">Para eliminarla, deshaz antes sus pagos.</span>` : ''}</div>
          <div class="flex-gap" style="margin-left:auto;">
            <button class="btn btn-secundario" id="dc-cerrar">Cerrar</button>
            ${editable ? `<button class="btn btn-secundario" id="dc-guardar">Guardar cambios</button>
                          <button class="btn btn-verde" id="dc-pagar">Registrar pago…</button>` : ''}
          </div>
        </div>
      </div></div>`;
    const err = document.getElementById('dc-error');
    const mostrarError = (m) => { err.textContent = m; err.classList.remove('oculto'); };
    document.getElementById('cerrar-modal').addEventListener('click', cerrarModal);
    document.getElementById('dc-cerrar').addEventListener('click', cerrarModal);

    modalCont.querySelectorAll('[data-deshacer]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm(`¿Deshacer el pago de ${mxn(btn.dataset.monto)} del ${btn.dataset.fecha}?\n\nSe borrará su egreso de Finanzas y ese dinero volverá a figurar como pendiente.`)) return;
      try {
        await API.del(`${BASE}/${id}/abonos/${btn.dataset.deshacer}`);
        aviso = `↩️ Pago de ${mxn(btn.dataset.monto)} deshecho: su egreso ya no aparece en Finanzas.`;
        if (pestana === 'pagada') pestana = 'por_pagar'; // ya no está liquidada: que no desaparezca de la vista
        await recargar();
        abrirDetalle(id);
      } catch (e2) { mostrarError(e2.message); }
    }));

    if (editable) {
      document.getElementById('dc-guardar').addEventListener('click', async (e) => {
        const monto = Number(document.getElementById('dc-monto').value);
        const proveedor = document.getElementById('dc-proveedor').value.trim();
        const concepto = document.getElementById('dc-concepto').value.trim();
        const vence = document.getElementById('dc-vence').value;
        if (!proveedor || !concepto) return mostrarError('El proveedor y el concepto son obligatorios.');
        if (!(monto > 0)) return mostrarError('El monto debe ser mayor a 0.');
        if (centavos(monto) < centavos(c.pagado)) return mostrarError(`Ya se han pagado ${mxn(c.pagado)}: el monto no puede ser menor.`);
        if (!vence) return mostrarError('Elige la fecha de vencimiento.');
        const btn = e.currentTarget; btn.disabled = true;
        try {
          await API.put(`${BASE}/${id}`, {
            proveedor, concepto, monto, fecha_vencimiento: vence,
            categoria_id: document.getElementById('dc-categoria').value || null,
            notas: document.getElementById('dc-notas').value.trim()
          });
          cerrarModal();
          aviso = centavos(monto) === centavos(c.pagado) ? '✅ Cambios guardados: con ese monto la cuenta quedó liquidada.' : '✅ Cambios guardados.';
          await recargar();
        } catch (e2) { mostrarError(e2.message); btn.disabled = false; }
      });
      document.getElementById('dc-pagar').addEventListener('click', () => abrirModalPagar(c));
    }
    if (c.estado === 'pendiente') {
      document.getElementById('dc-eliminar').addEventListener('click', async () => {
        if (!confirm(`¿Eliminar la cuenta de ${c.proveedor} por ${mxn(c.monto)}?`)) return;
        try { await API.del(`${BASE}/${id}`); cerrarModal(); aviso = 'Cuenta eliminada.'; await recargar(); }
        catch (e2) { mostrarError(e2.message); }
      });
    }
  }

  // ==========================================================
  // VENTANA: registrar un pago (completo o una parte)
  // ==========================================================
  function abrirModalPagar(c) {
    const saldo = c.saldo;
    modalCont.innerHTML = `
      <div class="modal-fondo"><div class="modal">
        <div class="modal-cabecera"><h3>Registrar pago</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
        <div class="modal-cuerpo">
          <div id="mp-error" class="error-msg oculto"></div>
          <p style="margin-top:0; font-size:14px;"><b>${esc(c.proveedor)}</b> · ${esc(c.concepto)}</p>
          <div class="grid-kpi" style="grid-template-columns: repeat(3, 1fr); gap:10px; margin-bottom:14px;">
            <div class="kpi borde-azul" style="padding:10px 12px;"><div class="kpi-etiqueta">Total</div><div class="kpi-valor" style="font-size:17px;">${mxn(c.monto)}</div></div>
            <div class="kpi borde-verde" style="padding:10px 12px;"><div class="kpi-etiqueta">Ya pagado</div><div class="kpi-valor" style="font-size:17px;">${mxn(c.pagado)}</div></div>
            <div class="kpi borde-naranja" style="padding:10px 12px;"><div class="kpi-etiqueta">Falta</div><div class="kpi-valor" style="font-size:17px;">${mxn(saldo)}</div></div>
          </div>
          <div class="grid-formulario">
            <div class="campo ancho-total">
              <label>¿Cuánto pagas ahora?</label>
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
    const actualizarResumen = () => {
      const m = Number(inputMonto.value);
      if (!(m > 0)) { resumenEl.innerHTML = 'Escribe cuánto vas a pagar ahora.'; return; }
      const resta = centavos(saldo) - centavos(m);
      resumenEl.innerHTML = resta < 0
        ? `⚠️ Eso es más de lo que falta (${mxn(saldo)}).`
        : `Se registrará un <b>egreso de ${mxn(m)}</b> en Finanzas, en el mes de la fecha de pago. ${
            resta === 0 ? '<b>Con esto queda liquidada.</b>' : `Después faltarán <b>${mxn(resta / 100)}</b>.`} Si te equivocas puedes deshacerlo.`;
    };
    inputMonto.addEventListener('input', actualizarResumen);
    document.getElementById('mp-todo').addEventListener('click', () => { inputMonto.value = saldo; actualizarResumen(); });
    actualizarResumen();
    document.getElementById('cerrar-modal').addEventListener('click', cerrarModal);
    document.getElementById('mp-volver').addEventListener('click', () => abrirDetalle(c.id));
    document.getElementById('mp-confirmar').addEventListener('click', async (e) => {
      const err = document.getElementById('mp-error');
      const mostrar = (m) => { err.textContent = m; err.classList.remove('oculto'); };
      const monto = Number(inputMonto.value);
      const fecha = document.getElementById('mp-fecha').value;
      if (!(monto > 0)) return mostrar('Escribe cuánto vas a pagar ahora (mayor a 0).');
      if (centavos(monto) > centavos(saldo)) return mostrar(`No puedes pagar más de lo que falta (${mxn(saldo)}).`);
      if (!fecha) return mostrar('Elige la fecha de pago.');
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Registrando…';
      try {
        const r = await API.post(`${BASE}/${c.id}/abonos`, {
          monto, fecha_pago: fecha, metodo_pago: document.getElementById('mp-metodo').value, notas: document.getElementById('mp-notas').value.trim()
        });
        cerrarModal();
        aviso = r.estado === 'pagada'
          ? `✅ <b>${mxn(monto)}</b> a ${esc(c.proveedor)} registrado: la cuenta quedó <b>liquidada</b>. Ya aparece como egreso en <a href="/finanzas.html">Finanzas</a>.`
          : `✅ <b>${mxn(monto)}</b> a ${esc(c.proveedor)} registrado (ya aparece en <a href="/finanzas.html">Finanzas</a>). Todavía falta <b>${mxn(r.saldo)}</b>.`;
        pestana = r.estado === 'pagada' ? 'pagada' : 'por_pagar';
        await recargar();
      } catch (e2) { mostrar(e2.message); btn.disabled = false; btn.textContent = 'Confirmar pago'; }
    });
  }
})();
