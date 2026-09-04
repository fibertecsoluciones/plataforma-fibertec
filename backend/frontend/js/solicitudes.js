(async function () {
  const usuario = protegerPagina();
  if (!usuario) return;

  renderLayout('solicitudes', 'Solicitudes');
  const cont = document.getElementById('pagina-contenido');
  const esAdmin = usuario.rol === 'admin';

  const ETIQUETA_ESTADO_SOL = {
    nueva: 'Nueva', contactada: 'Contactada', agendada: 'Agendada',
    convertida: 'Convertida', descartada: 'Descartada'
  };

  let zonas = [];
  let planes = [];
  let tecnicosDisponibles = [];
  let filtroEstado = '';
  let ubicacionNueva = { lat: null, lng: null };

  cont.innerHTML = `<div class="cargando">Cargando…</div>`;

  try {
    [zonas, planes] = await Promise.all([
      API.get('/api/catalogos/zonas'),
      API.get('/api/catalogos/planes')
    ]);
    if (esAdmin) tecnicosDisponibles = await API.get('/api/catalogos/tecnicos');
  } catch (err) {
    cont.innerHTML = `<div class="error-msg">${err.message}</div>`;
    return;
  }

  // Para "Plan de interés" de un prospecto nuevo, solo se ofrecen los planes vigentes
  // que sí se venden hoy en día — no los planes viejos/especiales que ya solo tienen
  // clientes antiguos (esos se asignan directo al convertir, no aquí).
  const NOMBRES_PLANES_NUEVOS = ['NAVEGA', 'VUELO', 'ELITE'];
  const planesParaNuevos = planes.filter(p => NOMBRES_PLANES_NUEVOS.includes(String(p.nombre).toUpperCase().trim()));

  cont.innerHTML = `
    <div class="tarjeta">
      <div class="tarjeta-cabecera"><h3>📞 Nueva solicitud (captura rápida en campo)</h3></div>
      <div class="tarjeta-cuerpo">
        <div id="error-solicitud" class="error-msg oculto"></div>
        <div id="exito-solicitud" class="exito-msg oculto"></div>
        <div class="grid-formulario">
          <div class="campo">
            <label>Nombre del prospecto</label>
            <input type="text" id="ns-nombre" placeholder="Ej. Juan Pérez" />
          </div>
          <div class="campo">
            <label>Teléfono</label>
            <input type="text" id="ns-telefono" placeholder="Ej. 9611234567" />
          </div>
          <div class="campo">
            <label>Zona aproximada (opcional)</label>
            <select id="ns-zona">
              <option value="">No estoy seguro</option>
              ${zonas.map(z => `<option value="${z.id}">${z.nombre}</option>`).join('')}
            </select>
          </div>
          <div class="campo">
            <label>Plan de interés (opcional)</label>
            <select id="ns-plan">
              <option value="">Sin especificar</option>
              ${planesParaNuevos.map(p => `<option value="${p.id}">${p.nombre} — ${mxn(p.precio)}</option>`).join('')}
            </select>
          </div>
          <div class="campo ancho-total">
            <label>Dirección aproximada / referencia</label>
            <input type="text" id="ns-direccion" placeholder="Ej. Junto a la tienda de don Beto" />
          </div>
          <div class="campo ancho-total">
            <label>Ubicación (opcional)</label>
            <div id="ns-mapa" class="mapa-selector"></div>
            <div class="ubicacion-campo" style="margin-top:8px;">
              <input type="text" id="ns-texto" placeholder="O pega aquí un link de Google Maps" />
              <button type="button" class="btn btn-secundario btn-sm" id="ns-usar-mi-ubicacion">📍 Usar la mía</button>
            </div>
            <div id="ns-preview" class="ubicacion-vista-previa oculto"></div>
          </div>
          <div class="campo ancho-total">
            <label>Notas</label>
            <textarea id="ns-notas" rows="2" placeholder="Cualquier detalle que te haya dado el prospecto"></textarea>
          </div>
        </div>
        <button class="btn btn-verde" id="btn-guardar-solicitud" style="margin-top:10px;">Guardar solicitud</button>
      </div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cabecera">
        <h3>Solicitudes</h3>
        <select id="filtro-estado-sol" style="padding:8px 12px; border:1px solid var(--borde); border-radius:6px;">
          <option value="">Todas</option>
          <option value="nueva">Nuevas</option>
          <option value="contactada">Contactadas</option>
          <option value="agendada">Agendadas</option>
          <option value="convertida">Convertidas</option>
          <option value="descartada">Descartadas</option>
        </select>
      </div>
      <div class="tarjeta-cuerpo tabla-envoltura" id="tabla-solicitudes">
        <div class="cargando">Cargando…</div>
      </div>
    </div>

    <div id="modal-contenedor"></div>
  `;

  // Ubicación: el mapa deja marcar el punto exacto con clic o arrastrando el pin.
  // También se puede pegar un link de Maps o usar el GPS de quien está capturando
  // (útil para el técnico parado en el sitio; la oficina normalmente usará el mapa
  // o pegará el link que le compartió el cliente).
  activarSelectorUbicacion('ns', null, null, (lat, lng) => { ubicacionNueva = { lat, lng }; });

  document.getElementById('filtro-estado-sol').addEventListener('change', (e) => {
    filtroEstado = e.target.value; cargarLista();
  });

  document.getElementById('btn-guardar-solicitud').addEventListener('click', async () => {
    const errorBox = document.getElementById('error-solicitud');
    const exitoBox = document.getElementById('exito-solicitud');
    errorBox.classList.add('oculto');
    exitoBox.classList.add('oculto');

    const nombre = document.getElementById('ns-nombre').value.trim();
    if (!nombre) {
      errorBox.textContent = 'El nombre del prospecto es obligatorio.';
      errorBox.classList.remove('oculto');
      return;
    }

    const btn = document.getElementById('btn-guardar-solicitud');
    btn.disabled = true; btn.textContent = 'Guardando…';

    try {
      await API.post('/api/solicitudes', {
        nombre,
        telefono: document.getElementById('ns-telefono').value.trim(),
        zona_id: document.getElementById('ns-zona').value || null,
        plan_interes_id: document.getElementById('ns-plan').value || null,
        direccion: document.getElementById('ns-direccion').value.trim(),
        notas: document.getElementById('ns-notas').value.trim(),
        latitud: ubicacionNueva.lat,
        longitud: ubicacionNueva.lng
      });
      exitoBox.textContent = 'Solicitud guardada. La oficina ya la puede ver en sus notificaciones.';
      exitoBox.classList.remove('oculto');
      ['ns-nombre','ns-telefono','ns-direccion','ns-notas','ns-texto'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('ns-zona').value = '';
      document.getElementById('ns-plan').value = '';
      ubicacionNueva = { lat: null, lng: null };
      document.getElementById('ns-preview').classList.add('oculto');
      cargarLista();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('oculto');
    } finally {
      btn.disabled = false; btn.textContent = 'Guardar solicitud';
    }
  });

  await cargarLista();

  async function cargarLista() {
    const tabla = document.getElementById('tabla-solicitudes');
    tabla.innerHTML = `<div class="cargando">Cargando…</div>`;
    try {
      const qs = filtroEstado ? `?estado=${filtroEstado}` : '';
      const lista = await API.get('/api/solicitudes' + qs);
      if (!lista.length) {
        tabla.innerHTML = `<div class="estado-vacio">No hay solicitudes con ese filtro.</div>`;
        return;
      }
      tabla.innerHTML = `
        <table class="tabla">
          <thead><tr><th>Prospecto</th><th>Teléfono</th><th>Zona</th><th>Capturada por</th><th>Fecha</th><th>Estado</th>${esAdmin ? '<th>Acciones</th>' : ''}</tr></thead>
          <tbody>
            ${lista.map(s => `
              <tr>
                <td class="celda-tarjeta-titulo">${s.nombre}${s.notas ? `<div class="celda-meta">${s.notas}</div>` : ''}</td>
                <td data-label="Teléfono">${s.telefono || '—'}</td>
                <td data-label="Zona">${s.zona_nombre || '—'}</td>
                <td data-label="Capturada por">${s.capturado_por_nombre || '—'}</td>
                <td data-label="Fecha">${fechaCorta(s.creado_en)}</td>
                <td data-label="Estado">
                  <span class="pill ${s.estado}">${ETIQUETA_ESTADO_SOL[s.estado]}</span>
                  ${s.cliente_generado_folio ? `<div class="celda-meta"><a href="/pagos.html?cliente=${s.cliente_generado_id}" class="folio">${s.cliente_generado_folio}</a></div>` : ''}
                  ${s.latitud && s.longitud ? `<div class="celda-meta"><a href="${linkGoogleMaps(s.latitud, s.longitud)}" target="_blank">📍 Ver ubicación</a></div>` : ''}
                </td>
                ${esAdmin ? `
                  <td class="celda-acciones-movil">
                    <div class="fila-acciones">
                      <button class="btn btn-secundario btn-sm" data-ubicacion="${s.id}" data-lat="${s.latitud || ''}" data-lng="${s.longitud || ''}" title="Marcar ubicación">📍</button>
                      ${s.estado !== 'convertida' && s.estado !== 'descartada' ? `
                        <button class="btn btn-verde btn-sm" data-convertir="${s.id}">Convertir en cliente</button>
                        <button class="btn btn-secundario btn-sm" data-estado-sol="${s.id}" data-nuevo-estado="${s.estado === 'nueva' ? 'contactada' : 'agendada'}">
                          ${s.estado === 'nueva' ? 'Marcar contactada' : 'Marcar agendada'}
                        </button>
                        <button class="btn btn-peligro btn-sm" data-estado-sol="${s.id}" data-nuevo-estado="descartada">Descartar</button>
                      ` : ''}
                      <button class="btn btn-peligro btn-sm btn-icono" data-borrar-solicitud="${s.id}" data-convertida="${s.estado === 'convertida'}" data-cliente-folio="${s.cliente_generado_folio || ''}" title="Eliminar solicitud">🗑️</button>
                    </div>
                  </td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      conectarAcciones();
    } catch (err) {
      tabla.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  }

  function conectarAcciones() {
    document.querySelectorAll('[data-estado-sol]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await API.put(`/api/solicitudes/${btn.dataset.estadoSol}`, { estado: btn.dataset.nuevoEstado });
          cargarLista();
        } catch (err) { alert(err.message); }
      });
    });

    document.querySelectorAll('[data-borrar-solicitud]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta solicitud?')) return;

        let eliminarCliente = false;
        if (btn.dataset.convertida === 'true') {
          eliminarCliente = confirm(
            `Esta solicitud ya generó al cliente ${btn.dataset.clienteFolio}.\n\n` +
            `¿Quieres eliminar TAMBIÉN ese cliente y su actividad relacionada?\n\n` +
            `Aceptar = sí, borrar todo (solo funciona si ese cliente aún no tiene pagos ni instalaciones registradas).\n` +
            `Cancelar = solo borrar esta solicitud, dejando al cliente como está.`
          );
        }

        try {
          const qs = eliminarCliente ? '?eliminarCliente=true' : '';
          const resultado = await API.del(`/api/solicitudes/${btn.dataset.borrarSolicitud}${qs}`);
          if (resultado.mensaje) alert(resultado.mensaje);
          cargarLista();
        } catch (err) { alert(err.message); }
      });
    });

    document.querySelectorAll('[data-ubicacion]').forEach(btn => {
      btn.addEventListener('click', () => abrirModalUbicacion(btn.dataset.ubicacion, btn.dataset.lat, btn.dataset.lng));
    });

    document.querySelectorAll('[data-convertir]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const solicitud = await API.get(`/api/solicitudes/${btn.dataset.convertir}`);
          abrirModalConvertir(solicitud);
        } catch (err) { alert(err.message); }
      });
    });
  }

  function abrirModalUbicacion(idSolicitud, latActual, lngActual) {
    const modalCont = document.getElementById('modal-contenedor');
    const lat = latActual ? Number(latActual) : null;
    const lng = lngActual ? Number(lngActual) : null;

    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera">
            <h3>📍 Ubicación de la solicitud</h3>
            <button class="cerrar-modal" id="cerrar-modal">&times;</button>
          </div>
          <div class="modal-cuerpo">
            <div id="error-ubicacion" class="error-msg oculto"></div>
            <p class="texto-gris" style="margin-top:0; font-size:12.5px;">Haz clic en el mapa o arrastra el pin para marcar el punto exacto.</p>
            <div id="mu-mapa" class="mapa-selector"></div>
            <div class="ubicacion-campo" style="margin-top:8px;">
              <input type="text" id="mu-texto" placeholder="O pega aquí un link de Google Maps" />
              <button type="button" class="btn btn-secundario btn-sm" id="mu-usar-mi-ubicacion">📍 Usar la mía</button>
            </div>
            <div id="mu-preview" class="ubicacion-vista-previa oculto"></div>
          </div>
          <div class="modal-pie">
            <button class="btn btn-secundario" id="cancelar-ubicacion">Cancelar</button>
            <button class="btn btn-primario" id="guardar-ubicacion">Guardar ubicación</button>
          </div>
        </div>
      </div>
    `;

    let coords = { lat, lng };
    const mapaInstancia = activarSelectorUbicacion('mu', lat, lng, (la, ln) => { coords = { lat: la, lng: ln }; });

    const cerrar = () => { mapaInstancia.remove(); modalCont.innerHTML = ''; };
    document.getElementById('cerrar-modal').addEventListener('click', cerrar);
    document.getElementById('cancelar-ubicacion').addEventListener('click', cerrar);

    document.getElementById('guardar-ubicacion').addEventListener('click', async () => {
      const errorBox = document.getElementById('error-ubicacion');
      if (!coords.lat || !coords.lng) {
        errorBox.textContent = 'Marca un punto en el mapa antes de guardar.';
        errorBox.classList.remove('oculto');
        return;
      }
      try {
        await API.put(`/api/solicitudes/${idSolicitud}`, { latitud: coords.lat, longitud: coords.lng });
        cerrar();
        cargarLista();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.remove('oculto');
      }
    });
  }

  function abrirModalConvertir(solicitud) {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera">
            <h3>Convertir en cliente — ${solicitud.nombre}</h3>
            <button class="cerrar-modal" id="cerrar-modal">&times;</button>
          </div>
          <div class="modal-cuerpo">
            <div id="error-convertir" class="error-msg oculto"></div>
            <p class="texto-gris" style="margin-top:0; font-size:12.5px;">
              Completa los datos que faltan. Al guardar se crea el cliente con su folio y esta solicitud queda marcada como "Convertida".
            </p>
            <div class="grid-formulario">
              <div class="campo ancho-total">
                <label>Nombre completo</label>
                <input type="text" id="cv-nombre" value="${solicitud.nombre || ''}" required />
              </div>
              <div class="campo">
                <label>Teléfono</label>
                <input type="text" id="cv-telefono" value="${solicitud.telefono || ''}" />
              </div>
              <div class="campo">
                <label>Teléfono alterno</label>
                <input type="text" id="cv-telefono-alt" value="${solicitud.telefono_alt || ''}" />
              </div>
              <div class="campo ancho-total">
                <label>Dirección</label>
                <input type="text" id="cv-direccion" value="${solicitud.direccion || ''}" />
              </div>
              <div class="campo">
                <label>Zona</label>
                <select id="cv-zona">
                  ${zonas.map(z => `<option value="${z.id}" ${String(z.id) === String(solicitud.zona_id) ? 'selected' : ''}>${z.nombre}</option>`).join('')}
                </select>
              </div>
              <div class="campo">
                <label>Plan contratado</label>
                <select id="cv-plan">
                  ${planes.map(p => `<option value="${p.id}" ${String(p.id) === String(solicitud.plan_interes_id) ? 'selected' : ''}>${p.nombre} — ${mxn(p.precio)}</option>`).join('')}
                </select>
              </div>
              <div class="campo">
                <label>IP asignada (opcional)</label>
                <input type="text" id="cv-ip" class="mono" />
              </div>
              <div class="campo">
                <label>Día de pago (1–31)</label>
                <input type="number" id="cv-dia-pago" min="1" max="31" value="15" required />
              </div>
              <div class="campo">
                <label>Días de tolerancia</label>
                <input type="number" id="cv-dias-tolerancia" min="0" max="30" value="5" />
              </div>
              <div class="campo ancho-total">
                <label>Notas</label>
                <textarea id="cv-notas" rows="2">${solicitud.notas || ''}</textarea>
              </div>
              <div class="campo ancho-total" style="border-top:1px solid var(--borde); padding-top:14px; margin-top:4px;">
                <label class="flex-gap" style="cursor:pointer; font-weight:400;">
                  <input type="checkbox" id="cv-crear-actividad" style="width:16px; height:16px;" ${tecnicosDisponibles.length ? '' : 'disabled'} />
                  Crear también una actividad de instalación asignada a un técnico
                </label>
              </div>
              <div class="campo ancho-total oculto" id="cv-campo-tecnico">
                <label>Asignar la instalación a</label>
                <select id="cv-tecnico">
                  ${tecnicosDisponibles.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
          <div class="modal-pie">
            <button class="btn btn-secundario" id="cancelar-convertir">Cancelar</button>
            <button class="btn btn-primario" id="guardar-convertir">Crear cliente</button>
          </div>
        </div>
      </div>
    `;

    const cerrar = () => { modalCont.innerHTML = ''; };
    document.getElementById('cerrar-modal').addEventListener('click', cerrar);
    document.getElementById('cancelar-convertir').addEventListener('click', cerrar);

    document.getElementById('cv-crear-actividad').addEventListener('change', (e) => {
      document.getElementById('cv-campo-tecnico').classList.toggle('oculto', !e.target.checked);
    });

    document.getElementById('guardar-convertir').addEventListener('click', async () => {
      const errorBox = document.getElementById('error-convertir');
      const crearActividad = document.getElementById('cv-crear-actividad').checked;

      const payload = {
        nombre: document.getElementById('cv-nombre').value.trim(),
        telefono: document.getElementById('cv-telefono').value.trim(),
        telefono_alt: document.getElementById('cv-telefono-alt').value.trim(),
        direccion: document.getElementById('cv-direccion').value.trim(),
        zona_id: Number(document.getElementById('cv-zona').value),
        plan_id: Number(document.getElementById('cv-plan').value),
        ip: document.getElementById('cv-ip').value.trim(),
        dia_pago: Number(document.getElementById('cv-dia-pago').value),
        dias_tolerancia: Number(document.getElementById('cv-dias-tolerancia').value),
        notas: document.getElementById('cv-notas').value.trim(),
        crear_actividad_instalacion: crearActividad,
        tecnico_instalador_id: crearActividad ? Number(document.getElementById('cv-tecnico').value) : null
      };

      if (!payload.nombre || !payload.zona_id || !payload.plan_id || !payload.dia_pago) {
        errorBox.textContent = 'Nombre, zona, plan y día de pago son obligatorios.';
        errorBox.classList.remove('oculto');
        return;
      }

      try {
        const resultado = await API.post(`/api/solicitudes/${solicitud.id}/convertir`, payload);
        cerrar();
        alert(resultado.mensaje);
        cargarLista();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.remove('oculto');
      }
    });
  }
})();
