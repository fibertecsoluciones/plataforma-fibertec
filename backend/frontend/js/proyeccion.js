(async function () {
  const usuario = protegerPagina(['admin']);
  if (!usuario) return;

  renderLayout('proyeccion', 'Proyección de ingresos');
  const cont = document.getElementById('pagina-contenido');

  let meses = 12;
  let vista = 'balance';      // 'balance' | 'categoria' | 'resumen' | 'zona' | 'plan'
  let datos = null;
  let grafica = null;

  const MESES_TXT = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const etiquetaMes = (clave) => { const [a, m] = clave.split('-'); return `${MESES_TXT[Number(m) - 1]} de ${a}`; };
  const sumaMes = (clave, k) => { let [a, m] = clave.split('-').map(Number); m += k; a += Math.floor((m - 1) / 12); m = ((m - 1) % 12) + 1; return `${a}-${String(m).padStart(2, '0')}`; };
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const colorSigno = (n) => (n < -0.005 ? 'var(--sem-rojo)' : 'var(--sem-verde)');
  const signado = (n) => `${n < -0.005 ? '−' : ''}${mxn(Math.abs(n))}`;
  const cambioHtml = (delta) => {
    if (delta === null) return '<span class="texto-gris">—</span>';
    if (Math.abs(delta) < 0.005) return '<span class="texto-gris">sin cambio</span>';
    return `<b style="color:${delta > 0 ? 'var(--sem-verde)' : 'var(--sem-rojo)'};">${delta > 0 ? '+' : '−'}${mxn(Math.abs(delta))}</b>`;
  };
  const balanceHtml = (n) => `<b style="color:${colorSigno(n)};">${signado(n)}</b>`;
  const pct = (n) => (n === null || n === undefined ? '—' : `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`);

  // Los controles van en la cabecera de la página; si esa cabecera no existe, en una tarjeta arriba
  const controles = `
    <select id="proy-meses" aria-label="Meses a proyectar">
      <option value="6">Próximos 6 meses</option>
      <option value="12" selected>Próximos 12 meses</option>
      <option value="24">Próximos 24 meses</option>
    </select>
    <button class="btn btn-secundario" id="proy-excel">⬇️ Descargar Excel</button>`;
  const cabeceraAcciones = document.getElementById('ft-ph-acciones');
  const cabeceraSub = document.getElementById('ft-ph-sub');
  cont.innerHTML = `${cabeceraAcciones ? '' : `<div class="tarjeta"><div class="tarjeta-cuerpo flex-gap" id="proy-barra">${controles}</div></div>`}
    <div id="proy-cuerpo"><div class="cargando">Calculando…</div></div>
    <div id="modal-contenedor"></div>`;
  if (cabeceraAcciones) cabeceraAcciones.innerHTML = controles;
  const modalCont = document.getElementById('modal-contenedor');

  document.getElementById('proy-meses').addEventListener('change', (e) => { meses = Number(e.target.value); cargar(); });
  document.getElementById('proy-excel').addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try { await API.descargarArchivo(`/api/finanzas/proyeccion/excel?meses=${meses}`, `proyeccion_ingresos_${hoyLocal()}.xlsx`); }
    catch (err) { alert(err.message); }
    btn.disabled = false;
  });

  async function cargar() {
    const cuerpo = document.getElementById('proy-cuerpo');
    try {
      datos = await API.get(`/api/finanzas/proyeccion?meses=${meses}`);
      if (cabeceraSub) cabeceraSub.textContent = `Lo que deberías cobrar cada mes con tu cartera actual, contra los gastos que planeas · ${datos.resumen.clientes_activos} clientes activos`;
      render();
    } catch (err) {
      cuerpo.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
    }
  }

  // ==========================================================
  // RENDER
  // ==========================================================
  function render() {
    const d = datos, r = d.resumen, nc = r.no_cuentan;
    const cuerpo = document.getElementById('proy-cuerpo');
    const activos = d.gastos.filter(g => g.activo).length;
    const hayGastos = activos > 0;

    if (!r.clientes_activos) {
      cuerpo.innerHTML = `<div class="tarjeta"><div class="estado-vacio">Aún no hay clientes activos, así que no hay ingresos que proyectar.</div></div>`;
      return;
    }

    const kpi = (clase, titulo, valor, sub) => `<div class="kpi ${clase}"><div class="kpi-etiqueta">${titulo}</div><div class="kpi-valor">${valor}</div><div class="texto-gris" style="font-size:11.5px; margin-top:2px;">${sub}</div></div>`;
    const cubre = !hayGastos ? 'captura tus gastos para calcularlo' : (r.clientes_que_faltan > 0 ? `hoy tienes ${r.clientes_mes_actual}: te faltan ${r.clientes_que_faltan}` : `hoy tienes ${r.clientes_mes_actual}: ya los cubres`);

    cuerpo.innerHTML = `
      <div class="grid-kpi" style="grid-template-columns:repeat(auto-fit,minmax(min(330px,100%),1fr));">
        ${kpi('borde-verde', 'Ingreso esperado este mes', mxn(r.ingreso_mes_actual), `${r.clientes_mes_actual} cliente${r.clientes_mes_actual === 1 ? '' : 's'} pagando`)}
        ${kpi('borde-naranja', 'Gastos planeados este mes', mxn(r.gasto_mes_actual), hayGastos ? `${activos} gasto${activos === 1 ? '' : 's'} incluido${activos === 1 ? '' : 's'}` : 'aún no capturas gastos')}
        ${kpi(r.balance_mes_actual < 0 ? 'borde-rojo' : 'borde-verde', 'Balance este mes', `<span style="color:${colorSigno(r.balance_mes_actual)};">${signado(r.balance_mes_actual)}</span>`, hayGastos ? `margen ${pct(r.margen_mes_actual)} del ingreso` : 'igual al ingreso: sin gastos')}
        ${kpi(r.balance_proyectado < 0 ? 'borde-rojo' : 'borde-azul', `Balance a ${d.horizonte} mes${d.horizonte === 1 ? '' : 'es'}`, `<span style="color:${colorSigno(r.balance_proyectado)};">${signado(r.balance_proyectado)}</span>`, r.meses_en_negativo ? `${r.meses_en_negativo} mes${r.meses_en_negativo === 1 ? '' : 'es'} en negativo` : 'ningún mes en negativo')}
        ${kpi('borde-azul', 'Clientes para cubrir tus gastos', hayGastos ? r.clientes_necesarios : '—', cubre)}
        ${kpi('borde-naranja', 'No se cuentan', nc.suspendidos + nc.bajas, `${nc.suspendidos} suspendido${nc.suspendidos === 1 ? '' : 's'} · ${nc.bajas} baja${nc.bajas === 1 ? '' : 's'}${nc.mes_gratis ? ` · ${nc.mes_gratis} en mes gratis` : ''}`)}
      </div>

      <div class="tarjeta">
        <div class="tarjeta-cabecera">
          <h3>Gastos a simular</h3>
          <button class="btn btn-verde btn-sm" id="proy-agregar">+ Agregar gasto</button>
        </div>
        <div id="proy-gastos"></div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-cabecera"><h3>Ingresos contra gastos, mes por mes</h3></div>
        <div class="tarjeta-cuerpo"><div class="grafica-contenedor"><canvas id="proy-grafica"></canvas></div></div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-cuerpo" style="padding-bottom:0;">
          <div class="tabs" id="proy-tabs" style="margin-bottom:0;">
            ${[['balance', 'Ingresos vs gastos'], ['categoria', 'Gastos por categoría'], ['resumen', 'Ingresos mes por mes'], ['zona', 'Por zona'], ['plan', 'Por plan']]
              .map(([id, txt]) => `<button class="tab ${vista === id ? 'activa' : ''}" data-vista="${id}">${txt}</button>`).join('')}
          </div>
        </div>
        <div class="tabla-envoltura" id="proy-tabla" style="padding:0 16px 8px;"></div>
      </div>

      <div class="tarjeta"><div class="tarjeta-cuerpo texto-gris" style="font-size:12.5px; line-height:1.6;">
        <b style="color:var(--tinta);">Cómo se calcula</b><br>
        <b>Ingresos:</b> cada cliente <b>activo</b> suma el precio de su plan en cada mes que le corresponde pagar. Los <b>suspendidos</b> y los dados de <b>baja</b> no se cuentan.
        Quien está en <b>mes gratis</b> empieza a contar cuando ese mes termina. Se supone que tu cartera se queda como está hoy (sin clientes nuevos ni bajas).<br>
        <b>Gastos:</b> son los que capturas aquí para simular; <b>no son egresos reales</b> y no afectan Finanzas. Solo cuentan los que tienen la casilla “Incluir” marcada,
        así que puedes apagar y encender gastos para comparar escenarios. <b>Balance</b> = ingreso esperado − gastos del mes.
      </div></div>`;

    document.getElementById('proy-agregar').addEventListener('click', () => abrirDialogo(null));
    document.getElementById('proy-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-vista]'); if (!b) return;
      vista = b.dataset.vista;
      document.querySelectorAll('#proy-tabs .tab').forEach(t => t.classList.toggle('activa', t.dataset.vista === vista));
      renderTabla();
    });
    renderGastos();
    renderTabla();
    renderGrafica();
  }

  // ---------- lista de gastos capturados ----------
  function cuandoHtml(g) {
    if (g.frecuencia === 'unica') return `Una sola vez<div class="celda-meta">${etiquetaMes(g.mes_inicio)}</div>`;
    const desde = g.mes_inicio ? `desde ${etiquetaMes(g.mes_inicio)}` : 'desde ya';
    const hasta = g.mes_fin ? `hasta ${etiquetaMes(g.mes_fin)}` : 'sin fin';
    return `Cada mes<div class="celda-meta">${desde} · ${hasta}</div>`;
  }
  function renderGastos() {
    const cont2 = document.getElementById('proy-gastos');
    const gs = datos.gastos;
    if (datos.gastos_disponibles === false) {
      document.getElementById('proy-agregar').disabled = true;
      cont2.innerHTML = `<div class="estado-vacio" style="padding:28px 20px;">
        <b>Falta activar la captura de gastos.</b><br>
        <span class="texto-gris" style="font-size:12.5px;">Corre una sola vez esta migración en la Shell del backend y recarga la página:</span><br>
        <code style="display:inline-block; margin-top:8px; padding:6px 10px; background:var(--ft-hover, #F3F6F7); border-radius:6px; font-size:12.5px;">node db/migrate.js migrations/023_proyeccion_gastos.sql</code></div>`;
      return;
    }
    if (!gs.length) {
      cont2.innerHTML = `<div class="estado-vacio" style="padding:28px 20px;">
        Aún no capturas ningún gasto.<br><span class="texto-gris" style="font-size:12.5px;">Agrega el pago de tu servicio de internet, gasolina, refacciones, módems, gastos operativos… y verás cómo se comportan contra tus ingresos.</span></div>`;
      return;
    }
    const totalMensual = gs.filter(g => g.activo && g.frecuencia === 'mensual').reduce((a, g) => a + g.monto, 0);
    cont2.innerHTML = `<div class="tabla-envoltura" style="padding:0 16px 4px;"><table class="tabla">
      <thead><tr><th>Concepto</th><th>Categoría</th><th>Monto</th><th>Cuándo</th><th>Incluir</th><th></th></tr></thead>
      <tbody>
        ${gs.map(g => `<tr style="${g.activo ? '' : 'opacity:.55;'}">
          <td class="celda-tarjeta-titulo celda-principal">${esc(g.concepto)}${g.notas ? `<div class="celda-meta" style="white-space:normal;">${esc(g.notas)}</div>` : ''}</td>
          <td data-label="Categoría">${esc(g.categoria)}</td>
          <td data-label="Monto"><b>${mxn(g.monto)}</b></td>
          <td data-label="Cuándo">${cuandoHtml(g)}</td>
          <td data-label="Incluir"><label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; margin:0;"><input type="checkbox" data-incluir="${g.id}" ${g.activo ? 'checked' : ''} style="width:18px; height:18px;" /> <span class="texto-gris" style="font-size:12px;">${g.activo ? 'Sí' : 'No'}</span></label></td>
          <td class="celda-acciones-movil"><div class="fila-acciones">
            <button class="btn btn-secundario btn-sm btn-icono" data-editar="${g.id}" title="Editar" aria-label="Editar">✏️</button>
            <button class="btn btn-peligro btn-sm btn-icono" data-borrar="${g.id}" title="Eliminar" aria-label="Eliminar">🗑️</button>
          </div></td>
        </tr>`).join('')}
      </tbody></table></div>
      <div class="paginacion" style="justify-content:flex-start;"><div class="paginacion-info">Gastos que se repiten cada mes (incluidos): <b style="color:var(--tinta);">${mxn(totalMensual)}</b></div></div>`;

    cont2.querySelectorAll('[data-incluir]').forEach(chk => chk.addEventListener('change', async () => {
      try { await API.put(`/api/finanzas/proyeccion/gastos/${chk.dataset.incluir}/activo`, { activo: chk.checked }); await cargar(); }
      catch (err) { chk.checked = !chk.checked; alert(err.message); }
    }));
    cont2.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => abrirDialogo(gs.find(g => String(g.id) === b.dataset.editar))));
    cont2.querySelectorAll('[data-borrar]').forEach(b => b.addEventListener('click', async () => {
      const g = gs.find(x => String(x.id) === b.dataset.borrar);
      if (!confirm(`¿Eliminar el gasto “${g.concepto}”?\nSolo se borra de la simulación.`)) return;
      try { await API.del(`/api/finanzas/proyeccion/gastos/${g.id}`); await cargar(); } catch (err) { alert(err.message); }
    }));
  }

  // ---------- diálogo: agregar / editar un gasto ----------
  function abrirDialogo(g) {
    const nuevo = !g;
    const actual = datos.meses[0].mes;
    const opcionesMes = (seleccion, vacioTexto) => {
      const claves = Array.from({ length: 37 }, (_, i) => sumaMes(actual, i));
      if (seleccion && !claves.includes(seleccion)) claves.unshift(seleccion);
      return `${vacioTexto !== null ? `<option value="">${vacioTexto}</option>` : ''}${claves.map(c => `<option value="${c}" ${c === seleccion ? 'selected' : ''}>${etiquetaMes(c)}</option>`).join('')}`;
    };
    const frec0 = g ? g.frecuencia : 'mensual';
    modalCont.innerHTML = `
      <div class="modal-fondo"><div class="modal" role="dialog" aria-label="${nuevo ? 'Agregar gasto' : 'Editar gasto'}">
        <div class="modal-cabecera"><h3>${nuevo ? 'Agregar gasto a la simulación' : 'Editar gasto'}</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
        <div class="modal-cuerpo">
          <div id="gs-error" class="error-msg oculto"></div>
          <div class="grid-formulario">
            <div class="campo ancho-total"><label>Concepto</label><input type="text" id="gs-concepto" maxlength="120" placeholder="Ej. Pago mensual al proveedor de internet" value="${g ? esc(g.concepto) : ''}" /></div>
            <div class="campo"><label>Categoría</label><select id="gs-categoria">${datos.categorias.map(c => `<option ${g && g.categoria === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
            <div class="campo"><label>Monto</label><input type="number" id="gs-monto" min="0.01" step="0.01" inputmode="decimal" placeholder="Ej. 4500" value="${g ? g.monto : ''}" /></div>
            <div class="campo"><label>¿Cada cuándo?</label>
              <select id="gs-frecuencia"><option value="mensual" ${frec0 === 'mensual' ? 'selected' : ''}>Cada mes</option><option value="unica" ${frec0 === 'unica' ? 'selected' : ''}>Una sola vez</option></select></div>
            <div class="campo" id="gs-bloque-unica" style="display:${frec0 === 'unica' ? 'block' : 'none'};"><label>¿En qué mes?</label>
              <select id="gs-mes">${opcionesMes(g && g.frecuencia === 'unica' ? g.mes_inicio : actual, null)}</select></div>
            <div class="campo" id="gs-bloque-desde" style="display:${frec0 === 'mensual' ? 'block' : 'none'};"><label>Desde</label>
              <select id="gs-desde">${opcionesMes(g && g.frecuencia === 'mensual' ? g.mes_inicio : '', 'Desde ya (este mes)')}</select></div>
            <div class="campo" id="gs-bloque-hasta" style="display:${frec0 === 'mensual' ? 'block' : 'none'};"><label>Hasta</label>
              <select id="gs-hasta">${opcionesMes(g && g.frecuencia === 'mensual' ? g.mes_fin : '', 'Sin fin')}</select></div>
            <div class="campo ancho-total"><label>Notas (opcional)</label><textarea id="gs-notas" rows="2" placeholder="Ej. Contrato anual, sube 5% en enero">${g ? esc(g.notas || '') : ''}</textarea></div>
          </div>
          <div class="texto-gris" style="font-size:12px; margin-top:6px;">Es solo para simular: no se registra como egreso en Finanzas.</div>
        </div>
        <div class="modal-pie"><button class="btn btn-secundario" id="gs-cancelar">Cancelar</button><button class="btn btn-verde" id="gs-guardar">${nuevo ? 'Agregar' : 'Guardar'}</button></div>
      </div></div>`;
    const cerrar = () => { modalCont.innerHTML = ''; };
    document.getElementById('cerrar-modal').addEventListener('click', cerrar);
    document.getElementById('gs-cancelar').addEventListener('click', cerrar);
    document.getElementById('gs-concepto').focus();
    document.getElementById('gs-frecuencia').addEventListener('change', (e) => {
      const unica = e.target.value === 'unica';
      document.getElementById('gs-bloque-unica').style.display = unica ? 'block' : 'none';
      document.getElementById('gs-bloque-desde').style.display = unica ? 'none' : 'block';
      document.getElementById('gs-bloque-hasta').style.display = unica ? 'none' : 'block';
    });
    document.getElementById('gs-guardar').addEventListener('click', async (e) => {
      const err = document.getElementById('gs-error');
      const mostrar = (m) => { err.textContent = m; err.classList.remove('oculto'); };
      const frecuencia = document.getElementById('gs-frecuencia').value;
      const cuerpo = {
        concepto: document.getElementById('gs-concepto').value.trim(),
        categoria: document.getElementById('gs-categoria').value,
        monto: document.getElementById('gs-monto').value,
        frecuencia,
        mes_inicio: frecuencia === 'unica' ? document.getElementById('gs-mes').value : document.getElementById('gs-desde').value,
        mes_fin: frecuencia === 'unica' ? '' : document.getElementById('gs-hasta').value,
        notas: document.getElementById('gs-notas').value.trim()
      };
      if (!cuerpo.concepto) return mostrar('Escribe el concepto del gasto.');
      if (!(Number(cuerpo.monto) > 0)) return mostrar('El monto debe ser mayor a 0.');
      if (frecuencia === 'mensual' && cuerpo.mes_inicio && cuerpo.mes_fin && cuerpo.mes_fin < cuerpo.mes_inicio) return mostrar('El mes final no puede ser anterior al mes de inicio.');
      const btn = e.currentTarget; btn.disabled = true;
      try {
        if (nuevo) await API.post('/api/finanzas/proyeccion/gastos', cuerpo); else await API.put(`/api/finanzas/proyeccion/gastos/${g.id}`, cuerpo);
        cerrar(); await cargar();
      } catch (e2) { mostrar(e2.message); btn.disabled = false; }
    });
  }

  // ---------- tablas ----------
  function renderTabla() {
    const d = datos;
    const filaMes = (m, i) => `${m.etiqueta}${i === 0 ? '<div class="celda-meta">mes en curso</div>' : ''}`;
    const sumaIng = d.meses.reduce((a, m) => a + m.total, 0), sumaGas = d.meses.reduce((a, m) => a + m.gastos, 0);
    const filaTotal = (celdas) => `<tr style="background:var(--ft-hover, #F3F6F7);"><td class="celda-tarjeta-titulo celda-principal">Total de ${d.horizonte} mes${d.horizonte === 1 ? '' : 'es'}</td>${celdas}</tr>`;
    let html;

    if (vista === 'balance') {
      html = `<table class="tabla">
        <thead><tr><th>Mes</th><th>Ingreso esperado</th><th>Gastos</th><th>Balance</th><th>Margen</th><th>Balance acumulado</th></tr></thead>
        <tbody>
          ${d.meses.map((m, i) => `<tr>
            <td class="celda-tarjeta-titulo celda-principal">${filaMes(m, i)}</td>
            <td data-label="Ingreso esperado">${mxn(m.total)}<div class="celda-meta">${m.clientes} cliente${m.clientes === 1 ? '' : 's'}</div></td>
            <td data-label="Gastos">${m.gastos ? mxn(m.gastos) : '<span class="texto-gris">—</span>'}</td>
            <td data-label="Balance">${balanceHtml(m.balance)}</td>
            <td data-label="Margen">${pct(m.margen)}</td>
            <td data-label="Balance acumulado">${balanceHtml(m.balance_acumulado)}</td>
          </tr>`).join('')}
          ${filaTotal(`<td data-label="Ingreso esperado"><b>${mxn(sumaIng)}</b></td><td data-label="Gastos"><b>${mxn(sumaGas)}</b></td><td data-label="Balance">${balanceHtml(sumaIng - sumaGas)}</td><td data-label="Margen">${sumaIng > 0 ? pct(Math.round(((sumaIng - sumaGas) / sumaIng) * 1000) / 10) : '—'}</td><td></td>`)}
        </tbody></table>`;
    } else if (vista === 'categoria') {
      const cats = d.categorias.filter(c => d.meses.some(m => m.gastos_por_categoria[c]));
      if (!cats.length) {
        html = `<div class="estado-vacio" style="padding:28px 20px;">No hay gastos incluidos en la simulación. Agrega uno (o marca “Incluir”) para ver el desglose por categoría.</div>`;
      } else {
        html = `<table class="tabla">
          <thead><tr><th>Mes</th>${cats.map(c => `<th>${esc(c)}</th>`).join('')}<th>Total gastos</th></tr></thead>
          <tbody>
            ${d.meses.map((m, i) => `<tr><td class="celda-tarjeta-titulo celda-principal">${filaMes(m, i)}</td>
              ${cats.map(c => `<td data-label="${esc(c)}">${m.gastos_por_categoria[c] ? mxn(m.gastos_por_categoria[c]) : '<span class="texto-gris">—</span>'}</td>`).join('')}
              <td data-label="Total gastos"><b>${mxn(m.gastos)}</b></td></tr>`).join('')}
            ${filaTotal(`${cats.map(c => `<td data-label="${esc(c)}"><b>${mxn(d.meses.reduce((a, m) => a + (m.gastos_por_categoria[c] || 0), 0))}</b></td>`).join('')}<td data-label="Total gastos"><b>${mxn(sumaGas)}</b></td>`)}
          </tbody></table>`;
      }
    } else if (vista === 'resumen') {
      html = `<table class="tabla">
        <thead><tr><th>Mes</th><th>Clientes que pagan</th><th>Ingreso esperado</th><th>Cambio vs mes anterior</th><th>Empiezan a cobrar</th></tr></thead>
        <tbody>
          ${d.meses.map((m, i) => `<tr>
            <td class="celda-tarjeta-titulo celda-principal">${filaMes(m, i)}</td>
            <td data-label="Clientes que pagan">${m.clientes}</td>
            <td data-label="Ingreso esperado"><b>${mxn(m.total)}</b></td>
            <td data-label="Cambio vs mes anterior">${cambioHtml(i === 0 ? null : m.total - d.meses[i - 1].total)}</td>
            <td data-label="Empiezan a cobrar">${m.entran ? `+${m.entran}` : '<span class="texto-gris">—</span>'}</td>
          </tr>`).join('')}
          ${filaTotal(`<td></td><td data-label="Ingreso esperado"><b>${mxn(sumaIng)}</b></td><td></td><td></td>`)}
        </tbody></table>`;
    } else {
      const nombres = vista === 'zona' ? d.zonas : d.planes;
      const campo = vista === 'zona' ? 'por_zona' : 'por_plan', clave = vista === 'zona' ? 'zona' : 'plan';
      const totales = nombres.map(n => d.meses.reduce((a, m) => { const x = m[campo].find(y => y[clave] === n); return a + (x ? x.total : 0); }, 0));
      html = `<table class="tabla">
        <thead><tr><th>Mes</th>${nombres.map(n => `<th>${esc(n)}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>
          ${d.meses.map((m, i) => `<tr>
            <td class="celda-tarjeta-titulo celda-principal">${filaMes(m, i)}</td>
            ${nombres.map(n => { const x = m[campo].find(y => y[clave] === n); return `<td data-label="${esc(n)}">${x ? `${mxn(x.total)}<div class="celda-meta">${x.clientes} cliente${x.clientes === 1 ? '' : 's'}</div>` : '<span class="texto-gris">—</span>'}</td>`; }).join('')}
            <td data-label="Total"><b>${mxn(m.total)}</b></td>
          </tr>`).join('')}
          ${filaTotal(`${totales.map((t, j) => `<td data-label="${esc(nombres[j])}"><b>${mxn(t)}</b></td>`).join('')}<td data-label="Total"><b>${mxn(sumaIng)}</b></td>`)}
        </tbody></table>`;
    }
    document.getElementById('proy-tabla').innerHTML = html;
  }

  // ---------- gráfica ----------
  function renderGrafica() {
    const lienzo = document.getElementById('proy-grafica');
    if (grafica) { grafica.destroy(); grafica = null; }
    if (!lienzo) return;
    if (typeof Chart === 'undefined') { lienzo.closest('.tarjeta').style.display = 'none'; return; }   // si no cargó la librería, la tabla basta
    const corto = (et) => { const [mes, , a] = et.split(' '); return `${mes.slice(0, 3)} ${String(a).slice(2)}`; };
    const hayGastos = datos.meses.some(m => m.gastos > 0);
    const sets = [{ type: 'bar', label: 'Ingreso esperado', data: datos.meses.map(m => m.total), backgroundColor: '#1E93D4', borderRadius: 4, order: 2 }];
    if (hayGastos) {
      sets.push({ type: 'bar', label: 'Gastos', data: datos.meses.map(m => m.gastos), backgroundColor: '#D9822B', borderRadius: 4, order: 2 });
      sets.push({ type: 'line', label: 'Balance', data: datos.meses.map(m => m.balance), borderColor: '#2C7A52', backgroundColor: '#2C7A52', borderWidth: 2.5, pointRadius: 3.5, tension: 0.15, order: 1 });
    }
    grafica = new Chart(lienzo, {
      data: { labels: datos.meses.map(m => corto(m.etiqueta)), datasets: sets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: hayGastos, position: 'bottom' }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${signado(c.parsed.y)}` } } },
        scales: { y: { ticks: { callback: (v) => (v < 0 ? '−$' : '$') + Math.abs(Number(v)).toLocaleString('es-MX') } } }
      }
    });
  }

  await cargar();
})();
