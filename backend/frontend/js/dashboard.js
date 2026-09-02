(async function () {
  const usuario = protegerPagina();
  if (!usuario) return;

  renderLayout('dashboard', 'Panel general');
  const cont = document.getElementById('pagina-contenido');
  cont.innerHTML = `<div class="cargando">Cargando información…</div>`;

  try {
    const [resumenPagos, resumenFinanzas, clientes] = await Promise.all([
      API.get('/api/clientes/resumen-semaforo'),
      API.get('/api/finanzas/resumen-mes'),
      API.get('/api/clientes?semaforo=rojo')
    ]);

    const clientesPorVencer = await API.get('/api/clientes?semaforo=amarillo');
    const clientesEnTolerancia = await API.get('/api/clientes?semaforo=naranja');

    cont.innerHTML = `
      <div class="grid-kpi">
        <div class="kpi borde-azul">
          <div class="kpi-etiqueta">Clientes activos</div>
          <div class="kpi-valor">${resumenFinanzas.clientes_activos}</div>
        </div>
        <div class="kpi borde-verde">
          <div class="kpi-etiqueta">Ingresos del mes</div>
          <div class="kpi-valor">${mxn(resumenFinanzas.ingresos)}</div>
        </div>
        <div class="kpi borde-rojo">
          <div class="kpi-etiqueta">Egresos del mes</div>
          <div class="kpi-valor">${mxn(resumenFinanzas.egresos)}</div>
        </div>
        <div class="kpi ${resumenFinanzas.balance >= 0 ? 'borde-verde' : 'borde-rojo'}">
          <div class="kpi-etiqueta">Balance del mes</div>
          <div class="kpi-valor">${mxn(resumenFinanzas.balance)}</div>
        </div>
      </div>

      <div class="grid-kpi">
        <div class="kpi borde-verde">
          <div class="kpi-etiqueta">Al corriente</div>
          <div class="kpi-valor">${resumenPagos.verde}</div>
        </div>
        <div class="kpi borde-amarillo">
          <div class="kpi-etiqueta">Por vencer</div>
          <div class="kpi-valor">${resumenPagos.amarillo}</div>
        </div>
        <div class="kpi borde-naranja">
          <div class="kpi-etiqueta">En tolerancia</div>
          <div class="kpi-valor">${resumenPagos.naranja}</div>
        </div>
        <div class="kpi borde-rojo">
          <div class="kpi-etiqueta">Vencidos</div>
          <div class="kpi-valor">${resumenPagos.rojo}</div>
        </div>
      </div>

      <div class="grid-kpi">
        <div class="kpi borde-rojo">
          <div class="kpi-etiqueta">Clientes con adeudo acumulado</div>
          <div class="kpi-valor">${resumenPagos.clientes_con_deuda}</div>
        </div>
        <div class="kpi borde-rojo">
          <div class="kpi-etiqueta">Cartera vencida total (todos los meses)</div>
          <div class="kpi-valor">${mxn(resumenPagos.saldo_total)}</div>
        </div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-cabecera">
          <h3>🔴 Clientes vencidos (fuera de tolerancia)</h3>
          <a href="/clientes.html?semaforo=rojo" class="btn btn-secundario btn-sm">Ver todos</a>
        </div>
        <div class="tarjeta-cuerpo tabla-envoltura">
          ${tablaResumen(clientes.rows || clientes)}
        </div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-cabecera">
          <h3>🟠 Clientes en periodo de tolerancia</h3>
          <a href="/clientes.html?semaforo=naranja" class="btn btn-secundario btn-sm">Ver todos</a>
        </div>
        <div class="tarjeta-cuerpo tabla-envoltura">
          ${tablaResumen(clientesEnTolerancia)}
        </div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-cabecera">
          <h3>🟡 Próximos a vencer (siguientes 3 días)</h3>
          <a href="/clientes.html?semaforo=amarillo" class="btn btn-secundario btn-sm">Ver todos</a>
        </div>
        <div class="tarjeta-cuerpo tabla-envoltura">
          ${tablaResumen(clientesPorVencer)}
        </div>
      </div>
    `;
  } catch (err) {
    cont.innerHTML = `<div class="error-msg">${err.message}</div>`;
  }

  function tablaResumen(lista) {
    if (!lista || lista.length === 0) {
      return `<div class="estado-vacio">No hay clientes en esta categoría 🎉</div>`;
    }
    const filas = lista.slice(0, 8).map(c => `
      <tr>
        <td><span class="folio">${c.cliente_id}</span></td>
        <td>${c.nombre}</td>
        <td>${c.zona}</td>
        <td>${c.plan}</td>
        <td>${fechaCorta(c.fecha_vencimiento)}</td>
        <td><span class="semaforo ${c.semaforo}">${ETIQUETA_SEMAFORO[c.semaforo]}</span></td>
        <td>${c.meses_adeudados > 0 ? `<span class="pill baja">${c.meses_adeudados} mes${c.meses_adeudados > 1 ? 'es' : ''}</span>` : '—'}</td>
      </tr>
    `).join('');
    return `
      <table class="tabla">
        <thead><tr><th>Folio</th><th>Cliente</th><th>Zona</th><th>Plan</th><th>Vence</th><th>Estado</th><th>Adeudo</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    `;
  }
})();
