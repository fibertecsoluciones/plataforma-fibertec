(async function () {
  const usuario = protegerPagina();
  if (!usuario) return;

  renderLayout('tecnicos', 'Instalaciones');
  const cont = document.getElementById('pagina-contenido');

  let clienteEncontrado = null;
  let ubicacion = { lat: null, lng: null, direccion: '' };

  cont.innerHTML = `
    <div class="tarjeta">
      <div class="tarjeta-cabecera"><h3>1. Buscar cliente por folio</h3></div>
      <div class="tarjeta-cuerpo">
        <div class="buscador-folio">
          <input type="text" id="input-folio" placeholder="Ej. POP-014" />
          <button class="btn btn-primario" id="btn-buscar">Buscar</button>
        </div>
        <div id="resultado-busqueda"></div>
      </div>
    </div>

    <div class="tarjeta oculto" id="tarjeta-formulario">
      <div class="tarjeta-cabecera"><h3>2. Datos de la instalación</h3></div>
      <div class="tarjeta-cuerpo">
        <div id="error-form" class="error-msg oculto"></div>
        <div id="exito-form" class="exito-msg oculto"></div>

        <form id="form-instalacion">
          <div class="grid-formulario">
            <div class="campo">
              <label>IP asignada</label>
              <input type="text" id="i-ip" class="mono" placeholder="10.0.0.25" />
            </div>
            <div class="campo">
              <label>MAC del módem</label>
              <input type="text" id="i-mac" class="mono" placeholder="AA:BB:CC:DD:EE:FF" />
            </div>
            <div class="campo">
              <label>Marca del módem</label>
              <input type="text" id="i-marca" placeholder="Ej. TP-Link, Huawei" />
            </div>
            <div class="campo">
              <label>Modelo del módem</label>
              <input type="text" id="i-modelo" placeholder="Ej. Archer C6" />
            </div>
            <div class="campo ancho-total">
              <label>Serial del módem</label>
              <input type="text" id="i-serial" class="mono" />
            </div>
            <div class="campo ancho-total">
              <label>Evidencia de instalación (foto)</label>
              <input type="file" id="i-evidencia" accept="image/*,.pdf" capture="environment" />
            </div>
            <div class="campo ancho-total">
              <label>Notas</label>
              <textarea id="i-notas" rows="2"></textarea>
            </div>
          </div>

          <div class="tarjeta-cuerpo" style="padding:0; margin-top:6px;">
            <div class="grid-formulario">
              <div class="campo">
                <label>Fecha y hora de instalación</label>
                <input type="text" id="i-fecha" class="mono" disabled value="Se registra automáticamente al guardar" />
              </div>
              <div class="campo">
                <label>Técnico</label>
                <input type="text" class="mono" disabled value="${usuario.nombre}" />
              </div>
              <div class="campo ancho-total">
                <label>Ubicación (automática por GPS del dispositivo)</label>
                <div id="estado-ubicacion" class="ubicacion-estado">Obteniendo ubicación…</div>
              </div>
            </div>
          </div>

          <div style="margin-top:18px;">
            <button type="submit" class="btn btn-verde" id="btn-guardar-instalacion">Guardar instalación</button>
          </div>
        </form>
      </div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cabecera"><h3>Últimas instalaciones registradas</h3></div>
      <div class="tarjeta-cuerpo tabla-envoltura" id="tabla-instalaciones">
        <div class="cargando">Cargando…</div>
      </div>
    </div>
  `;

  document.getElementById('btn-buscar').addEventListener('click', buscarFolio);
  document.getElementById('input-folio').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); buscarFolio(); }
  });

  async function buscarFolio() {
    const folio = document.getElementById('input-folio').value.trim();
    const resultado = document.getElementById('resultado-busqueda');
    if (!folio) return;

    resultado.innerHTML = `<div class="cargando">Buscando…</div>`;
    try {
      const cliente = await API.get(`/api/clientes/folio/${encodeURIComponent(folio)}`);
      clienteEncontrado = cliente;
      resultado.innerHTML = `
        <div class="tarjeta-cliente-encontrado">
          <div class="fila"><span>Cliente</span><b>${cliente.nombre}</b></div>
          <div class="fila"><span>Zona</span><b>${cliente.zona_nombre}</b></div>
          <div class="fila"><span>Plan</span><b>${cliente.plan_nombre}</b></div>
          <div class="fila"><span>Teléfono</span><b>${cliente.telefono || '—'}</b></div>
          <div class="fila"><span>Dirección</span><b>${cliente.direccion || '—'}</b></div>
        </div>
      `;
      document.getElementById('tarjeta-formulario').classList.remove('oculto');
      document.getElementById('i-ip').value = cliente.ip || '';
      solicitarUbicacion();
    } catch (err) {
      clienteEncontrado = null;
      document.getElementById('tarjeta-formulario').classList.add('oculto');
      resultado.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  }

  function solicitarUbicacion() {
    const estadoBox = document.getElementById('estado-ubicacion');
    if (!navigator.geolocation) {
      estadoBox.textContent = 'Este dispositivo no soporta geolocalización. Se guardará sin coordenadas.';
      estadoBox.className = 'ubicacion-estado error';
      return;
    }
    estadoBox.textContent = 'Obteniendo ubicación…';
    estadoBox.className = 'ubicacion-estado';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        ubicacion.lat = pos.coords.latitude;
        ubicacion.lng = pos.coords.longitude;
        estadoBox.textContent = `Ubicación capturada: ${ubicacion.lat.toFixed(5)}, ${ubicacion.lng.toFixed(5)}`;
        estadoBox.className = 'ubicacion-estado ok';
      },
      (err) => {
        estadoBox.textContent = 'No se pudo obtener la ubicación (' + err.message + '). Puedes continuar sin ella.';
        estadoBox.className = 'ubicacion-estado error';
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  document.getElementById('form-instalacion').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!clienteEncontrado) return;

    const errorBox = document.getElementById('error-form');
    const exitoBox = document.getElementById('exito-form');
    errorBox.classList.add('oculto');
    exitoBox.classList.add('oculto');

    const btn = document.getElementById('btn-guardar-instalacion');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    try {
      const formData = new FormData();
      formData.append('cliente_id', clienteEncontrado.id);
      formData.append('ip_asignada', document.getElementById('i-ip').value.trim());
      formData.append('mac_modem', document.getElementById('i-mac').value.trim());
      formData.append('marca_modem', document.getElementById('i-marca').value.trim());
      formData.append('modelo_modem', document.getElementById('i-modelo').value.trim());
      formData.append('serial_modem', document.getElementById('i-serial').value.trim());
      formData.append('notas', document.getElementById('i-notas').value.trim());
      if (ubicacion.lat) formData.append('latitud', ubicacion.lat);
      if (ubicacion.lng) formData.append('longitud', ubicacion.lng);

      const archivo = document.getElementById('i-evidencia').files[0];
      if (archivo) formData.append('evidencia', archivo);

      await API.solicitarConArchivo('/api/instalaciones', formData, 'POST');

      exitoBox.textContent = 'Instalación registrada correctamente.';
      exitoBox.classList.remove('oculto');
      document.getElementById('form-instalacion').reset();
      document.getElementById('tarjeta-formulario').classList.add('oculto');
      document.getElementById('resultado-busqueda').innerHTML = '';
      document.getElementById('input-folio').value = '';
      clienteEncontrado = null;
      cargarUltimasInstalaciones();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('oculto');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar instalación';
    }
  });

  async function cargarUltimasInstalaciones() {
    const tabla = document.getElementById('tabla-instalaciones');
    try {
      const lista = await API.get('/api/instalaciones');
      if (!lista.length) {
        tabla.innerHTML = `<div class="estado-vacio">Aún no hay instalaciones registradas.</div>`;
        return;
      }
      tabla.innerHTML = `
        <table class="tabla">
          <thead><tr><th>Folio</th><th>Cliente</th><th>Técnico</th><th>Modem</th><th>IP</th><th>Fecha</th><th>Evidencia</th></tr></thead>
          <tbody>
            ${lista.slice(0, 15).map(i => `
              <tr>
                <td data-label="Folio"><span class="folio">${i.folio}</span></td>
                <td class="celda-tarjeta-titulo">${i.cliente_nombre}</td>
                <td data-label="Técnico">${i.tecnico_nombre}</td>
                <td data-label="Modem">${i.marca_modem || '—'} ${i.modelo_modem || ''}</td>
                <td class="mono" data-label="IP">${i.ip_asignada || '—'}</td>
                <td data-label="Fecha">${fechaCorta(i.fecha_instalacion)}</td>
                <td data-label="Evidencia">${i.evidencia_url ? `<a href="${i.evidencia_url}" target="_blank">Ver</a>` : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      tabla.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  }

  cargarUltimasInstalaciones();
})();
