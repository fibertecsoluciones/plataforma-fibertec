(async function () {
  const usuario = protegerPagina(['admin']);
  if (!usuario) return;

  renderLayout('proyeccion', 'Proyección de ingresos');
  const cont = document.getElementById('pagina-contenido');

  let meses = 12;
  let vista = 'resumen';      // 'resumen' | 'zona' | 'plan'
  let datos = null;
  let grafica = null;

  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const cambioHtml = (delta) => {
    if (delta === null) return '<span class="texto-gris">—</span>';
    if (Math.abs(delta) < 0.005) return '<span class="texto-gris">sin cambio</span>';
    return `<b style="color:${delta > 0 ? 'var(--sem-verde)' : 'var(--sem-rojo)'};">${delta > 0 ? '+' : '−'}${mxn(Math.abs(delta))}</b>`;
  };

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
    <div id="proy-cuerpo"><div class="cargando">Calculando…</div></div>`;
  if (cabeceraAcciones) cabeceraAcciones.innerHTML = controles;

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
      if (cabeceraSub) cabeceraSub.textContent = `Lo que deberías cobrar cada mes con tu cartera actual · ${datos.resumen.clientes_activos} clientes activos`;
      render();
    } catch (err) {
      cuerpo.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
    }
  }

  function render() {
    const d = datos, r = d.resumen, nc = r.no_cuentan;
    const cuerpo = document.getElementById('proy-cuerpo');

    if (!r.clientes_activos) {
      cuerpo.innerHTML = `<div class="tarjeta"><div class="estado-vacio">Aún no hay clientes activos, así que no hay ingresos que proyectar.</div></div>`;
      return;
    }

    cuerpo.innerHTML = `
      <div class="grid-kpi">
        <div class="kpi borde-verde"><div class="kpi-etiqueta">Ingreso esperado este mes</div><div class="kpi-valor">${mxn(r.ingreso_mes_actual)}</div>
          <div class="texto-gris" style="font-size:11.5px; margin-top:2px;">${r.clientes_mes_actual} cliente${r.clientes_mes_actual === 1 ? '' : 's'} pagando</div></div>
        <div class="kpi borde-azul"><div class="kpi-etiqueta">Proyección a ${d.horizonte} mes${d.horizonte === 1 ? '' : 'es'}</div><div class="kpi-valor">${mxn(r.ingreso_proyectado)}</div>
          <div class="texto-gris" style="font-size:11.5px; margin-top:2px;">suma de todos los meses</div></div>
        <div class="kpi borde-azul"><div class="kpi-etiqueta">Clientes activos</div><div class="kpi-valor">${r.clientes_activos}</div>
          <div class="texto-gris" style="font-size:11.5px; margin-top:2px;">${nc.mes_gratis ? `${nc.mes_gratis} aún en mes gratis` : 'todos ya cobran'}</div></div>
        <div class="kpi borde-naranja"><div class="kpi-etiqueta">No se cuentan</div><div class="kpi-valor">${nc.suspendidos + nc.bajas}</div>
          <div class="texto-gris" style="font-size:11.5px; margin-top:2px;">${nc.suspendidos} suspendido${nc.suspendidos === 1 ? '' : 's'} · ${nc.bajas} baja${nc.bajas === 1 ? '' : 's'}</div></div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-cabecera"><h3>Ingreso esperado por mes</h3></div>
        <div class="tarjeta-cuerpo"><div class="grafica-contenedor"><canvas id="proy-grafica"></canvas></div></div>
      </div>

      <div class="tarjeta">
        <div class="tarjeta-cuerpo" style="padding-bottom:0;">
          <div class="tabs" id="proy-tabs" style="margin-bottom:0;">
            <button class="tab ${vista === 'resumen' ? 'activa' : ''}" data-vista="resumen">Mes por mes</button>
            <button class="tab ${vista === 'zona' ? 'activa' : ''}" data-vista="zona">Por zona</button>
            <button class="tab ${vista === 'plan' ? 'activa' : ''}" data-vista="plan">Por plan</button>
          </div>
        </div>
        <div class="tabla-envoltura" id="proy-tabla" style="padding:0 16px 8px;"></div>
      </div>

      <div class="tarjeta"><div class="tarjeta-cuerpo texto-gris" style="font-size:12.5px; line-height:1.6;">
        <b style="color:var(--tinta);">Cómo se calcula</b><br>
        Cada cliente <b>activo</b> suma el precio de su plan en cada mes que le corresponde pagar. Los <b>suspendidos</b> y los dados de <b>baja</b> no se cuentan.
        Quien está en <b>mes gratis</b> empieza a contar cuando ese mes termina. Se supone que tu cartera se queda como está hoy (sin clientes nuevos ni bajas),
        y no se incluyen egresos ni lo que ya se cobró: es lo que <b>debería</b> entrar.
      </div></div>`;

    document.getElementById('proy-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-vista]'); if (!b) return;
      vista = b.dataset.vista;
      document.querySelectorAll('#proy-tabs .tab').forEach(t => t.classList.toggle('activa', t.dataset.vista === vista));
      renderTabla();
    });
    renderTabla();
    renderGrafica();
  }

  function renderTabla() {
    const d = datos;
    const filaMes = (m, i) => `${m.etiqueta}${i === 0 ? '<div class="celda-meta">mes en curso</div>' : ''}`;
    let html;

    if (vista === 'resumen') {
      const total = d.meses.reduce((a, m) => a + m.total, 0);
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
          <tr style="background:var(--ft-hover, #F3F6F7);"><td class="celda-tarjeta-titulo celda-principal">Total de ${d.horizonte} mes${d.horizonte === 1 ? '' : 'es'}</td><td></td><td data-label="Ingreso esperado"><b>${mxn(total)}</b></td><td></td><td></td></tr>
        </tbody></table>`;
    } else {
      const nombres = vista === 'zona' ? d.zonas : d.planes;
      const campo = vista === 'zona' ? 'por_zona' : 'por_plan', clave = vista === 'zona' ? 'zona' : 'plan';
      const celdas = (m) => nombres.map(n => { const x = m[campo].find(y => y[clave] === n); return x ? x : null; });
      const totales = nombres.map(n => d.meses.reduce((a, m) => { const x = m[campo].find(y => y[clave] === n); return a + (x ? x.total : 0); }, 0));
      html = `<table class="tabla">
        <thead><tr><th>Mes</th>${nombres.map(n => `<th>${esc(n)}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>
          ${d.meses.map((m, i) => `<tr>
            <td class="celda-tarjeta-titulo celda-principal">${filaMes(m, i)}</td>
            ${celdas(m).map((x, j) => `<td data-label="${esc(nombres[j])}">${x ? `${mxn(x.total)}<div class="celda-meta">${x.clientes} cliente${x.clientes === 1 ? '' : 's'}</div>` : '<span class="texto-gris">—</span>'}</td>`).join('')}
            <td data-label="Total"><b>${mxn(m.total)}</b></td>
          </tr>`).join('')}
          <tr style="background:var(--ft-hover, #F3F6F7);"><td class="celda-tarjeta-titulo celda-principal">Total de ${d.horizonte} mes${d.horizonte === 1 ? '' : 'es'}</td>
            ${totales.map((t, j) => `<td data-label="${esc(nombres[j])}"><b>${mxn(t)}</b></td>`).join('')}
            <td data-label="Total"><b>${mxn(d.meses.reduce((a, m) => a + m.total, 0))}</b></td></tr>
        </tbody></table>`;
    }
    document.getElementById('proy-tabla').innerHTML = html;
  }

  function renderGrafica() {
    const lienzo = document.getElementById('proy-grafica');
    if (grafica) { grafica.destroy(); grafica = null; }
    if (!lienzo) return;
    if (typeof Chart === 'undefined') { lienzo.closest('.tarjeta').style.display = 'none'; return; }   // si no cargó la librería, la tabla basta
    const corto = (et) => { const [mes, , a] = et.split(' '); return `${mes.slice(0, 3)} ${String(a).slice(2)}`; };
    grafica = new Chart(lienzo, {
      type: 'bar',
      data: {
        labels: datos.meses.map(m => corto(m.etiqueta)),
        datasets: [{ label: 'Ingreso esperado', data: datos.meses.map(m => m.total), backgroundColor: datos.meses.map((m, i) => i === 0 ? '#3E9E6D' : '#1E93D4'), borderRadius: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${mxn(c.parsed.y)}`, afterLabel: (c) => ` ${datos.meses[c.dataIndex].clientes} clientes` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => '$' + Number(v).toLocaleString('es-MX') } } }
      }
    });
  }

  await cargar();
})();
