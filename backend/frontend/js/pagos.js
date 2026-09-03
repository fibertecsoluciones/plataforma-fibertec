(async function () {
  const usuario = protegerPagina();
  if (!usuario) return;

  renderLayout('pagos', 'Pagos');
  const cont = document.getElementById('pagina-contenido');
  const esAdmin = usuario.rol === 'admin';

  const params = new URLSearchParams(window.location.search);
  const clienteIdPk = params.get('cliente');

  if (clienteIdPk) {
    await vistaClienteEspecifico(clienteIdPk);
  } else {
    await vistaGeneral();
  }

  // ==========================================================
  // VISTA: pagos recientes de todos los clientes
  // ==========================================================
  async function vistaGeneral() {
    cont.innerHTML = `
      <div class="tarjeta">
        <div class="tarjeta-cabecera">
          <h3>Pagos registrados recientemente</h3>
        </div>
        <div class="tarjeta-cuerpo tabla-envoltura" id="tabla-pagos">
          <div class="cargando">Cargando…</div>
        </div>
      </div>
      <p class="texto-gris">Tip: entra a un cliente desde <a href="/clientes.html">Clientes</a> para ver su historial mes a mes y registrar un pago.</p>
    `;

    try {
      const pagos = await API.get('/api/pagos');
      const tabla = document.getElementById('tabla-pagos');
      if (!pagos.length) {
        tabla.innerHTML = `<div class="estado-vacio">Aún no hay pagos registrados.</div>`;
        return;
      }
      tabla.innerHTML = `
        <table class="tabla">
          <thead><tr><th>Folio</th><th>Cliente</th><th>Periodo</th><th>Monto</th><th>Fecha de pago</th><th>Método</th><th>Excepción</th></tr></thead>
          <tbody>
            ${pagos.map(p => `
              <tr>
                <td><span class="folio">${p.folio}</span></td>
                <td>${p.cliente_nombre}</td>
                <td>${mesLegible(p.periodo)}</td>
                <td>${mxn(p.monto)}</td>
                <td>${fechaCorta(p.fecha_pago)}</td>
                <td>${p.metodo_pago}</td>
                <td>${p.es_excepcion ? `<span class="pill suspendido">${p.meses_cubiertos} meses en 1 pago</span>` : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      document.getElementById('tabla-pagos').innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  }

  // ==========================================================
  // VISTA: historial de un cliente + registrar pago
  // ==========================================================
  async function vistaClienteEspecifico(id) {
    cont.innerHTML = `<div class="cargando">Cargando cliente…</div>`;

    try {
      const cliente = await API.get(`/api/clientes/${id}`);
      const historial = await API.get(`/api/pagos/cliente/${id}`);
      const { desglose } = await API.get(`/api/pagos/cliente/${id}/desglose`);

      cont.innerHTML = `
        <div class="tarjeta">
          <div class="tarjeta-cuerpo flex-entre" style="flex-wrap:wrap; gap:14px;">
            <div>
              <div class="flex-gap" style="margin-bottom:6px;">
                <span class="folio">${cliente.cliente_id}</span>
                <h3 style="margin:0;">${cliente.nombre}</h3>
                ${cliente.meses_adeudados > 0 ? `<span class="pill baja">Debe ${cliente.meses_adeudados} mes${cliente.meses_adeudados > 1 ? 'es' : ''} — ${mxn(cliente.saldo_pendiente)}</span>` : `<span class="pill activo">Al día</span>`}
              </div>
              <div class="texto-gris">${cliente.zona_nombre} · Plan ${cliente.plan_nombre} (${mxn(cliente.precio)}) · Día de pago ${cliente.dia_pago}</div>
              ${cliente.adeudo_manual_meses > 0 ? `<div class="texto-gris" style="font-size:12px; margin-top:4px;">📌 Incluye ${cliente.adeudo_manual_meses} mes(es) capturados a mano${cliente.adeudo_manual_detalle ? ': ' + cliente.adeudo_manual_detalle : ''}</div>` : ''}
            </div>
            ${esAdmin ? `<button class="btn btn-verde" id="btn-registrar-pago">+ Registrar pago</button>` : ''}
          </div>
        </div>

        <div class="tarjeta">
          <div class="tarjeta-cabecera">
            <h3>Desglose mensual</h3>
            <span class="texto-gris" style="font-size:12px;">Últimos 12 meses (o desde su alta, lo que sea más corto)</span>
          </div>
          <div class="tarjeta-cuerpo tabla-envoltura">
            <table class="tabla">
              <thead><tr><th>Mes</th><th>Esperado</th><th>Pagado</th><th>Saldo</th><th>Estado</th></tr></thead>
              <tbody>
                ${desglose.map(m => `
                  <tr>
                    <td>${mesLegible(m.periodo)}${m.esMesActual ? ' <span class="texto-gris" style="font-size:11px;">(mes actual)</span>' : ''}</td>
                    <td>${mxn(m.esperado)}</td>
                    <td>${mxn(m.pagado)}${m.abonos > 1 ? ` <span class="texto-gris" style="font-size:11px;">(${m.abonos} abonos)</span>` : ''}</td>
                    <td>${m.saldo > 0 ? mxn(m.saldo) : '—'}</td>
                    <td>
                      ${m.estado === 'completo' ? '<span class="pill activo">Completo</span>' : ''}
                      ${m.estado === 'parcial' ? '<span class="pill suspendido">Parcial</span>' : ''}
                      ${m.estado === 'sin_pago' ? '<span class="pill baja">Sin pago</span>' : ''}
                      ${m.estado === 'pendiente' ? '<span class="pill">Pendiente (aún no vence)</span>' : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="tarjeta">
          <div class="tarjeta-cabecera"><h3>Historial de abonos (todos los registros individuales)</h3></div>
          <div class="tarjeta-cuerpo tabla-envoltura">
            ${historial.length ? `
              <table class="tabla">
                <thead><tr><th>Periodo</th><th>Monto</th><th>Fecha de pago</th><th>Método</th><th>Excepción</th>${esAdmin ? '<th></th>' : ''}</tr></thead>
                <tbody>
                  ${historial.map(p => `
                    <tr>
                      <td>${mesLegible(p.periodo)}</td>
                      <td>${mxn(p.monto)}</td>
                      <td>${fechaCorta(p.fecha_pago)}</td>
                      <td>${p.metodo_pago}</td>
                      <td>${p.es_excepcion ? `<span class="pill suspendido">Pago de ${p.meses_cubiertos} meses</span>` : '—'}</td>
                      ${esAdmin ? `<td><button class="btn btn-peligro btn-sm" data-borrar="${p.id}">Eliminar</button></td>` : ''}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `<div class="estado-vacio">Este cliente aún no tiene pagos registrados.</div>`}
          </div>
        </div>

        <div id="modal-contenedor"></div>
      `;

      cont.querySelectorAll('[data-borrar]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Eliminar este pago? Esta acción no se puede deshacer.')) return;
          try {
            await API.del(`/api/pagos/${btn.dataset.borrar}`);
            vistaClienteEspecifico(id);
          } catch (err) { alert(err.message); }
        });
      });

      const btnRegistrar = document.getElementById('btn-registrar-pago');
      if (btnRegistrar) {
        btnRegistrar.addEventListener('click', () => abrirModalPago(cliente, id));
      }
    } catch (err) {
      cont.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  }

  function abrirModalPago(cliente, clientePk) {
    const hoy = new Date();
    const periodoActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera">
            <h3>Registrar pago — ${cliente.nombre}</h3>
            <button class="cerrar-modal" id="cerrar-modal">&times;</button>
          </div>
          <div class="modal-cuerpo">
            <div id="error-pago" class="error-msg oculto"></div>
            <div class="grid-formulario">
              <div class="campo">
                <label>Mes que cubre este pago</label>
                <input type="month" id="p-periodo" value="${periodoActual}" required />
              </div>
              <div class="campo">
                <label>Meses cubiertos en esta exhibición</label>
                <select id="p-meses">
                  <option value="1">1 mes (pago normal)</option>
                  <option value="2">2 meses (excepción)</option>
                  <option value="3">3 meses (excepción máxima)</option>
                </select>
              </div>
              <div class="campo">
                <label>Monto total pagado</label>
                <input type="number" id="p-monto" min="0" step="0.01" value="${cliente.precio}" required />
                <div class="texto-gris" style="font-size:11.5px; margin-top:4px;">
                  ¿Solo te dio una parte? Cambia este monto por lo que sí pagó — el sistema lo marcará como
                  "parcial" y podrás registrar el resto después, para el mismo mes, cuando te complete.
                </div>
              </div>
              <div class="campo">
                <label>Método de pago</label>
                <select id="p-metodo">
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="deposito">Depósito</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
              </div>
              <div class="campo">
                <label>Fecha de pago</label>
                <input type="date" id="p-fecha" value="${hoy.toISOString().slice(0, 10)}" />
              </div>
              <div class="campo ancho-total">
                <label>Notas (motivo de la excepción, etc.)</label>
                <textarea id="p-notas" rows="2" placeholder="Ej: cliente solicitó cubrir 2 meses por viaje de trabajo"></textarea>
              </div>
            </div>
            <div id="aviso-excepcion" class="oculto" style="margin-top:10px; padding:10px 12px; background:var(--sem-amarillo-bg); color:var(--sem-amarillo); border-radius:6px; font-size:13px;">
              Estás registrando un pago que cubre varios meses de una sola vez. El monto se dividirá entre los meses cubiertos automáticamente.
            </div>
          </div>
          <div class="modal-pie">
            <button class="btn btn-secundario" id="cancelar-pago">Cancelar</button>
            <button class="btn btn-primario" id="guardar-pago">Guardar pago</button>
          </div>
        </div>
      </div>
    `;

    const cerrar = () => { modalCont.innerHTML = ''; };
    document.getElementById('cerrar-modal').addEventListener('click', cerrar);
    document.getElementById('cancelar-pago').addEventListener('click', cerrar);

    const selectMeses = document.getElementById('p-meses');
    const inputMonto = document.getElementById('p-monto');
    selectMeses.addEventListener('change', () => {
      const meses = Number(selectMeses.value);
      document.getElementById('aviso-excepcion').classList.toggle('oculto', meses <= 1);
      inputMonto.value = (Number(cliente.precio) * meses).toFixed(2);
    });

    document.getElementById('guardar-pago').addEventListener('click', async () => {
      const errorBox = document.getElementById('error-pago');
      const periodo = document.getElementById('p-periodo').value; // formato YYYY-MM
      const payload = {
        cliente_id: clientePk,
        periodo,
        monto: Number(inputMonto.value),
        meses_cubiertos: Number(selectMeses.value),
        metodo_pago: document.getElementById('p-metodo').value,
        fecha_pago: document.getElementById('p-fecha').value,
        notas: document.getElementById('p-notas').value.trim()
      };

      if (!periodo || !payload.monto) {
        errorBox.textContent = 'El mes y el monto son obligatorios.';
        errorBox.classList.remove('oculto');
        return;
      }

      try {
        await API.post('/api/pagos', payload);
        cerrar();
        vistaClienteEspecifico(clientePk);
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.remove('oculto');
      }
    });
  }

  function mesLegible(periodo) {
    const d = fechaLocalDesdeTexto(periodo);
    return d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  }
})();
