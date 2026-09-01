(async function () {
  const usuario = protegerPagina(['admin']);
  if (!usuario) return;

  renderLayout('ajustes', 'Ajustes');
  const cont = document.getElementById('pagina-contenido');

  cont.innerHTML = `
    <div class="tarjeta">
      <div class="tarjeta-cabecera">
        <h3>Zonas</h3>
        <button class="btn btn-verde btn-sm" id="btn-nueva-zona">+ Nueva zona</button>
      </div>
      <div class="tarjeta-cuerpo tabla-envoltura" id="tabla-zonas"><div class="cargando">Cargando…</div></div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cabecera">
        <h3>Planes</h3>
        <button class="btn btn-verde btn-sm" id="btn-nuevo-plan">+ Nuevo plan</button>
      </div>
      <div class="tarjeta-cuerpo tabla-envoltura" id="tabla-planes"><div class="cargando">Cargando…</div></div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cabecera">
        <h3>Técnicos y usuarios</h3>
        <button class="btn btn-verde btn-sm" id="btn-nuevo-usuario">+ Nuevo usuario</button>
      </div>
      <div class="tarjeta-cuerpo tabla-envoltura" id="tabla-tecnicos"><div class="cargando">Cargando…</div></div>
    </div>

    <div id="modal-contenedor"></div>
  `;

  document.getElementById('btn-nueva-zona').addEventListener('click', abrirModalZona);
  document.getElementById('btn-nuevo-plan').addEventListener('click', abrirModalPlan);
  document.getElementById('btn-nuevo-usuario').addEventListener('click', abrirModalUsuario);

  await Promise.all([cargarZonas(), cargarPlanes(), cargarTecnicos()]);

  async function cargarZonas() {
    const tabla = document.getElementById('tabla-zonas');
    const zonas = await API.get('/api/catalogos/zonas');
    tabla.innerHTML = `
      <table class="tabla">
        <thead><tr><th>Nombre</th><th>Código (prefijo de folio)</th></tr></thead>
        <tbody>${zonas.map(z => `<tr><td>${z.nombre}</td><td class="mono">${z.codigo}</td></tr>`).join('')}</tbody>
      </table>`;
  }

  async function cargarPlanes() {
    const tabla = document.getElementById('tabla-planes');
    const planes = await API.get('/api/catalogos/planes');
    tabla.innerHTML = `
      <table class="tabla">
        <thead><tr><th>Nombre</th><th>Velocidad</th><th>Precio mensual</th></tr></thead>
        <tbody>${planes.map(p => `<tr><td>${p.nombre}</td><td>${p.velocidad || '—'}</td><td>${mxn(p.precio)}</td></tr>`).join('')}</tbody>
      </table>`;
  }

  async function cargarTecnicos() {
    const tabla = document.getElementById('tabla-tecnicos');
    const tecnicos = await API.get('/api/catalogos/tecnicos');
    tabla.innerHTML = tecnicos.length ? `
      <table class="tabla">
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Teléfono</th><th>Estado</th></tr></thead>
        <tbody>${tecnicos.map(t => `<tr><td>${t.nombre}</td><td class="mono">${t.usuario}</td><td>${t.telefono || '—'}</td><td><span class="pill ${t.activo ? 'activo' : 'baja'}">${t.activo ? 'activo' : 'inactivo'}</span></td></tr>`).join('')}</tbody>
      </table>` : `<div class="estado-vacio">Aún no has dado de alta técnicos.</div>`;
  }

  function abrirModalZona() {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera"><h3>Nueva zona</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
          <div class="modal-cuerpo">
            <div id="err" class="error-msg oculto"></div>
            <div class="grid-formulario">
              <div class="campo"><label>Nombre de la zona</label><input type="text" id="z-nombre" placeholder="Ej. LOS ROBLES" /></div>
              <div class="campo"><label>Código (prefijo del Cliente-ID)</label><input type="text" id="z-codigo" placeholder="Ej. ROB" maxlength="10" /></div>
            </div>
          </div>
          <div class="modal-pie"><button class="btn btn-secundario" id="cancelar">Cancelar</button><button class="btn btn-primario" id="guardar">Guardar</button></div>
        </div>
      </div>`;
    conectarModalSimple(async () => {
      await API.post('/api/catalogos/zonas', {
        nombre: document.getElementById('z-nombre').value.trim(),
        codigo: document.getElementById('z-codigo').value.trim()
      });
      cargarZonas();
    });
  }

  function abrirModalPlan() {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera"><h3>Nuevo plan</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
          <div class="modal-cuerpo">
            <div id="err" class="error-msg oculto"></div>
            <div class="grid-formulario">
              <div class="campo ancho-total"><label>Nombre del plan</label><input type="text" id="p-nombre" placeholder="Ej. VUELO ELITE" /></div>
              <div class="campo"><label>Velocidad</label><input type="text" id="p-velocidad" placeholder="Ej. 30 Mbps" /></div>
              <div class="campo"><label>Precio mensual</label><input type="number" id="p-precio" min="0" step="0.01" /></div>
            </div>
          </div>
          <div class="modal-pie"><button class="btn btn-secundario" id="cancelar">Cancelar</button><button class="btn btn-primario" id="guardar">Guardar</button></div>
        </div>
      </div>`;
    conectarModalSimple(async () => {
      await API.post('/api/catalogos/planes', {
        nombre: document.getElementById('p-nombre').value.trim(),
        velocidad: document.getElementById('p-velocidad').value.trim(),
        precio: Number(document.getElementById('p-precio').value)
      });
      cargarPlanes();
    });
  }

  function abrirModalUsuario() {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera"><h3>Nuevo usuario</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
          <div class="modal-cuerpo">
            <div id="err" class="error-msg oculto"></div>
            <div class="grid-formulario">
              <div class="campo ancho-total"><label>Nombre completo</label><input type="text" id="u-nombre" /></div>
              <div class="campo"><label>Usuario (para iniciar sesión)</label><input type="text" id="u-usuario" /></div>
              <div class="campo"><label>Contraseña</label><input type="password" id="u-password" /></div>
              <div class="campo"><label>Rol</label>
                <select id="u-rol"><option value="tecnico">Técnico</option><option value="admin">Administrador</option></select>
              </div>
              <div class="campo"><label>Teléfono</label><input type="text" id="u-telefono" /></div>
            </div>
          </div>
          <div class="modal-pie"><button class="btn btn-secundario" id="cancelar">Cancelar</button><button class="btn btn-primario" id="guardar">Guardar</button></div>
        </div>
      </div>`;
    conectarModalSimple(async () => {
      await API.post('/api/catalogos/usuarios', {
        nombre: document.getElementById('u-nombre').value.trim(),
        usuario: document.getElementById('u-usuario').value.trim(),
        password: document.getElementById('u-password').value,
        rol: document.getElementById('u-rol').value,
        telefono: document.getElementById('u-telefono').value.trim()
      });
      cargarTecnicos();
    });
  }

  function conectarModalSimple(accionGuardar) {
    const modalCont = document.getElementById('modal-contenedor');
    const cerrar = () => { modalCont.innerHTML = ''; };
    document.getElementById('cerrar-modal').addEventListener('click', cerrar);
    document.getElementById('cancelar').addEventListener('click', cerrar);
    document.getElementById('guardar').addEventListener('click', async () => {
      const errBox = document.getElementById('err');
      try {
        await accionGuardar();
        cerrar();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('oculto');
      }
    });
  }
})();
