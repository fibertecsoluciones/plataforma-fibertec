(async function () {
  const usuario = protegerPagina(['admin']);
  if (!usuario) return;

  renderLayout('finanzas', 'Finanzas');
  const cont = document.getElementById('pagina-contenido');

  let categorias = [];

  cont.innerHTML = `<div class="cargando">Cargando finanzas…</div>`;

  try {
    categorias = await API.get('/api/catalogos/egresos-categorias');
  } catch (err) {
    cont.innerHTML = `<div class="error-msg">${err.message}</div>`;
    return;
  }

  cont.innerHTML = `
    <div class="grid-kpi" id="kpis-finanzas"></div>

    <div class="tarjeta">
      <div class="tarjeta-cabecera"><h3>Ingresos vs egresos (últimos 6 meses)</h3></div>
      <div class="tarjeta-cuerpo">
        <canvas id="grafica-ie" height="90"></canvas>
      </div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cabecera"><h3>Egresos del mes por categoría</h3></div>
      <div class="tarjeta-cuerpo">
        <canvas id="grafica-categorias" height="90"></canvas>
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

  document.getElementById('btn-nuevo-egreso').addEventListener('click', abrirModalEgreso);

  await cargarKpis();
  await cargarGraficas();
  await cargarEgresos();

  async function cargarKpis() {
    const resumen = await API.get('/api/finanzas/resumen-mes');
    document.getElementById('kpis-finanzas').innerHTML = `
      <div class="kpi borde-verde"><div class="kpi-etiqueta">Ingresos del mes</div><div class="kpi-valor">${mxn(resumen.ingresos)}</div></div>
      <div class="kpi borde-rojo"><div class="kpi-etiqueta">Egresos del mes</div><div class="kpi-valor">${mxn(resumen.egresos)}</div></div>
      <div class="kpi ${resumen.balance >= 0 ? 'borde-verde' : 'borde-rojo'}"><div class="kpi-etiqueta">Balance</div><div class="kpi-valor">${mxn(resumen.balance)}</div></div>
      <div class="kpi borde-azul"><div class="kpi-etiqueta">Clientes activos</div><div class="kpi-valor">${resumen.clientes_activos}</div></div>
    `;
  }

  async function cargarGraficas() {
    const { ingresos, egresos } = await API.get('/api/finanzas/resumen-mensual?meses=6');
    const meses = Array.from(new Set([...ingresos.map(i => i.mes), ...egresos.map(e => e.mes)])).sort();

    const mapaIngresos = Object.fromEntries(ingresos.map(i => [i.mes, Number(i.total)]));
    const mapaEgresos = Object.fromEntries(egresos.map(e => [e.mes, Number(e.total)]));

    new Chart(document.getElementById('grafica-ie'), {
      type: 'bar',
      data: {
        labels: meses.map(formatearMes),
        datasets: [
          { label: 'Ingresos', data: meses.map(m => mapaIngresos[m] || 0), backgroundColor: '#2FA86A' },
          { label: 'Egresos', data: meses.map(m => mapaEgresos[m] || 0), backgroundColor: '#C94F4F' }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    const categoriasData = await API.get('/api/finanzas/egresos-por-categoria');
    const conDatos = categoriasData.filter(c => Number(c.total) > 0);

    new Chart(document.getElementById('grafica-categorias'), {
      type: 'doughnut',
      data: {
        labels: (conDatos.length ? conDatos : categoriasData).map(c => c.categoria),
        datasets: [{
          data: (conDatos.length ? conDatos : categoriasData).map(c => Number(c.total)),
          backgroundColor: ['#1E93D4','#3E9E6D','#C9962B','#D4722F','#C94F4F','#6B7A85','#146190']
        }]
      },
      options: { responsive: true, plugins: { legend: { position: 'right' } } }
    });
  }

  async function cargarEgresos() {
    const tabla = document.getElementById('tabla-egresos');
    try {
      const egresos = await API.get('/api/finanzas/egresos');
      if (!egresos.length) {
        tabla.innerHTML = `<div class="estado-vacio">Aún no has registrado egresos.</div>`;
        return;
      }
      tabla.innerHTML = `
        <table class="tabla">
          <thead><tr><th>Concepto</th><th>Categoría</th><th>Monto</th><th>Fecha</th><th>Comprobante</th><th></th></tr></thead>
          <tbody>
            ${egresos.map(e => `
              <tr>
                <td>${e.concepto}</td>
                <td>${e.categoria_nombre || '—'}</td>
                <td>${mxn(e.monto)}</td>
                <td>${fechaCorta(e.fecha)}</td>
                <td>${e.comprobante_url ? `<a href="${e.comprobante_url}" target="_blank">Ver</a>` : '—'}</td>
                <td><button class="btn btn-peligro btn-sm" data-borrar="${e.id}">Eliminar</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      tabla.querySelectorAll('[data-borrar]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Eliminar este egreso?')) return;
          try {
            await API.del(`/api/finanzas/egresos/${btn.dataset.borrar}`);
            cargarEgresos(); cargarKpis(); cargarGraficas();
          } catch (err) { alert(err.message); }
        });
      });
    } catch (err) {
      tabla.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  }

  function abrirModalEgreso() {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera"><h3>Registrar egreso</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
          <div class="modal-cuerpo">
            <div id="error-egreso" class="error-msg oculto"></div>
            <div class="grid-formulario">
              <div class="campo ancho-total"><label>Concepto</label><input type="text" id="e-concepto" required /></div>
              <div class="campo">
                <label>Categoría</label>
                <select id="e-categoria">
                  <option value="">Sin categoría</option>
                  ${categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
                </select>
              </div>
              <div class="campo"><label>Monto</label><input type="number" id="e-monto" min="0" step="0.01" required /></div>
              <div class="campo"><label>Fecha</label><input type="date" id="e-fecha" value="${new Date().toISOString().slice(0,10)}" /></div>
              <div class="campo ancho-total"><label>Comprobante (opcional)</label><input type="file" id="e-comprobante" accept="image/*,.pdf" /></div>
              <div class="campo ancho-total"><label>Notas</label><textarea id="e-notas" rows="2"></textarea></div>
            </div>
          </div>
          <div class="modal-pie">
            <button class="btn btn-secundario" id="cancelar">Cancelar</button>
            <button class="btn btn-primario" id="guardar-egreso">Guardar</button>
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

        await API.solicitarConArchivo('/api/finanzas/egresos', formData, 'POST');
        cerrar();
        cargarEgresos(); cargarKpis(); cargarGraficas();
      } catch (err) { errorBox.textContent = err.message; errorBox.classList.remove('oculto'); }
    });
  }

  function formatearMes(mesStr) {
    const [anio, mes] = mesStr.split('-');
    const d = new Date(Number(anio), Number(mes) - 1, 1);
    return d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });
  }
})();
