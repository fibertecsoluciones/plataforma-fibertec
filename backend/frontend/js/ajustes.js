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

  document.getElementById('btn-nueva-zona').addEventListener('click', () => abrirModalZona());
  document.getElementById('btn-nuevo-plan').addEventListener('click', () => abrirModalPlan());
  document.getElementById('btn-nuevo-usuario').addEventListener('click', () => abrirModalUsuario());

  await Promise.all([cargarZonas(), cargarPlanes(), cargarTecnicos()]);

  // ==========================================================
  // ZONAS
  // ==========================================================
  async function cargarZonas() {
    const tabla = document.getElementById('tabla-zonas');
    const zonas = await API.get('/api/catalogos/zonas');
    tabla.innerHTML = zonas.length ? `
      <table class="tabla">
        <thead><tr><th>Nombre</th><th>Código (prefijo de folio)</th><th></th></tr></thead>
        <tbody>${zonas.map(z => `
          <tr>
            <td>${z.nombre}</td>
            <td class="mono">${z.codigo}</td>
            <td>
              <div class="flex-gap">
                <button class="btn btn-secundario btn-sm" data-editar-zona='${JSON.stringify(z)}'>Editar</button>
                <button class="btn btn-peligro btn-sm" data-borrar-zona="${z.id}">Desactivar</button>
              </div>
            </td>
          </tr>`).join('')}</tbody>
      </table>` : `<div class="estado-vacio">No hay zonas activas.</div>`;

    tabla.querySelectorAll('[data-editar-zona]').forEach(btn => {
      btn.addEventListener('click', () => abrirModalZona(JSON.parse(btn.dataset.editarZona)));
    });
    tabla.querySelectorAll('[data-borrar-zona]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Desactivar esta zona? Ya no aparecerá disponible para nuevos clientes, pero los clientes existentes en ella no se ven afectados.')) return;
        try { await API.del(`/api/catalogos/zonas/${btn.dataset.borrarZona}`); cargarZonas(); }
        catch (err) { alert(err.message); }
      });
    });
  }

  function abrirModalZona(zona) {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera"><h3>${zona ? 'Editar zona' : 'Nueva zona'}</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
          <div class="modal-cuerpo">
            <div id="err" class="error-msg oculto"></div>
            <div class="grid-formulario">
              <div class="campo"><label>Nombre de la zona</label><input type="text" id="z-nombre" value="${zona ? zona.nombre : ''}" placeholder="Ej. LOS ROBLES" /></div>
              <div class="campo"><label>Código (prefijo del Cliente-ID)</label><input type="text" id="z-codigo" value="${zona ? zona.codigo : ''}" placeholder="Ej. ROB" maxlength="10" /></div>
            </div>
          </div>
          <div class="modal-pie"><button class="btn btn-secundario" id="cancelar">Cancelar</button><button class="btn btn-primario" id="guardar">Guardar</button></div>
        </div>
      </div>`;
    conectarModalSimple(async () => {
      const payload = {
        nombre: document.getElementById('z-nombre').value.trim(),
        codigo: document.getElementById('z-codigo').value.trim()
      };
      if (zona) await API.put(`/api/catalogos/zonas/${zona.id}`, payload);
      else await API.post('/api/catalogos/zonas', payload);
      cargarZonas();
    });
  }

  // ==========================================================
  // PLANES
  // ==========================================================
  async function cargarPlanes() {
    const tabla = document.getElementById('tabla-planes');
    const planes = await API.get('/api/catalogos/planes');
    tabla.innerHTML = planes.length ? `
      <table class="tabla">
        <thead><tr><th>Nombre</th><th>Velocidad</th><th>Precio mensual</th><th></th></tr></thead>
        <tbody>${planes.map(p => `
          <tr>
            <td>${p.nombre}</td>
            <td>${p.velocidad || '—'}</td>
            <td>${mxn(p.precio)}</td>
            <td>
              <div class="flex-gap">
                <button class="btn btn-secundario btn-sm" data-editar-plan='${JSON.stringify(p)}'>Editar</button>
                <button class="btn btn-peligro btn-sm" data-borrar-plan="${p.id}">Desactivar</button>
              </div>
            </td>
          </tr>`).join('')}</tbody>
      </table>` : `<div class="estado-vacio">No hay planes activos.</div>`;

    tabla.querySelectorAll('[data-editar-plan]').forEach(btn => {
      btn.addEventListener('click', () => abrirModalPlan(JSON.parse(btn.dataset.editarPlan)));
    });
    tabla.querySelectorAll('[data-borrar-plan]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Desactivar este plan? Los clientes que ya lo tienen contratado no se ven afectados.')) return;
        try { await API.del(`/api/catalogos/planes/${btn.dataset.borrarPlan}`); cargarPlanes(); }
        catch (err) { alert(err.message); }
      });
    });
  }

  function abrirModalPlan(plan) {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera"><h3>${plan ? 'Editar plan' : 'Nuevo plan'}</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
          <div class="modal-cuerpo">
            <div id="err" class="error-msg oculto"></div>
            <div class="grid-formulario">
              <div class="campo ancho-total"><label>Nombre del plan</label><input type="text" id="p-nombre" value="${plan ? plan.nombre : ''}" placeholder="Ej. VUELO ELITE" /></div>
              <div class="campo"><label>Velocidad</label><input type="text" id="p-velocidad" value="${plan && plan.velocidad ? plan.velocidad : ''}" placeholder="Ej. 30 Mbps" /></div>
              <div class="campo"><label>Precio mensual</label><input type="number" id="p-precio" min="0" step="0.01" value="${plan ? plan.precio : ''}" /></div>
            </div>
          </div>
          <div class="modal-pie"><button class="btn btn-secundario" id="cancelar">Cancelar</button><button class="btn btn-primario" id="guardar">Guardar</button></div>
        </div>
      </div>`;
    conectarModalSimple(async () => {
      const payload = {
        nombre: document.getElementById('p-nombre').value.trim(),
        velocidad: document.getElementById('p-velocidad').value.trim(),
        precio: Number(document.getElementById('p-precio').value)
      };
      if (plan) await API.put(`/api/catalogos/planes/${plan.id}`, payload);
      else await API.post('/api/catalogos/planes', payload);
      cargarPlanes();
    });
  }

  // ==========================================================
  // USUARIOS (admins + técnicos)
  // ==========================================================
  async function cargarTecnicos() {
    const tabla = document.getElementById('tabla-tecnicos');
    const tecnicos = await API.get('/api/catalogos/tecnicos');
    tabla.innerHTML = tecnicos.length ? `
      <table class="tabla">
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Teléfono</th><th>Estado</th><th></th></tr></thead>
        <tbody>${tecnicos.map(t => `
          <tr>
            <td>${t.nombre}</td>
            <td class="mono">${t.usuario}</td>
            <td><span class="pill">${t.rol}</span></td>
            <td>${t.telefono || '—'}</td>
            <td><span class="pill ${t.activo ? 'activo' : 'baja'}">${t.activo ? 'activo' : 'inactivo'}</span></td>
            <td>
              <div class="flex-gap">
                <button class="btn btn-secundario btn-sm" data-editar-usuario='${JSON.stringify(t)}'>Editar</button>
                ${t.activo
                  ? `<button class="btn btn-peligro btn-sm" data-borrar-usuario="${t.id}">Desactivar</button>`
                  : `<span class="texto-gris" style="font-size:12px;">Inactivo</span>`}
              </div>
            </td>
          </tr>`).join('')}</tbody>
      </table>` : `<div class="estado-vacio">Aún no has dado de alta técnicos.</div>`;

    tabla.querySelectorAll('[data-editar-usuario]').forEach(btn => {
      btn.addEventListener('click', () => abrirModalUsuario(JSON.parse(btn.dataset.editarUsuario)));
    });
    tabla.querySelectorAll('[data-borrar-usuario]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Desactivar este usuario? Ya no podrá iniciar sesión, pero su historial (pagos e instalaciones que registró) se conserva.')) return;
        try { await API.del(`/api/catalogos/usuarios/${btn.dataset.borrarUsuario}`); cargarTecnicos(); }
        catch (err) { alert(err.message); }
      });
    });
  }

  function abrirModalUsuario(usuarioEditar) {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera"><h3>${usuarioEditar ? 'Editar usuario' : 'Nuevo usuario'}</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
          <div class="modal-cuerpo">
            <div id="err" class="error-msg oculto"></div>
            <div class="grid-formulario">
              <div class="campo ancho-total"><label>Nombre completo</label><input type="text" id="u-nombre" value="${usuarioEditar ? usuarioEditar.nombre : ''}" /></div>
              <div class="campo">
                <label>Usuario (para iniciar sesión)</label>
                <input type="text" id="u-usuario" value="${usuarioEditar ? usuarioEditar.usuario : ''}" ${usuarioEditar ? 'disabled' : ''} />
                ${usuarioEditar ? '<div class="texto-gris" style="font-size:11.5px; margin-top:4px;">El usuario de acceso no se puede cambiar aquí.</div>' : ''}
              </div>
              <div class="campo">
                <label>${usuarioEditar ? 'Nueva contraseña (déjalo vacío para no cambiarla)' : 'Contraseña'}</label>
                <input type="password" id="u-password" />
              </div>
              <div class="campo"><label>Rol</label>
                <select id="u-rol">
                  <option value="tecnico" ${usuarioEditar && usuarioEditar.rol === 'tecnico' ? 'selected' : ''}>Técnico</option>
                  <option value="admin" ${usuarioEditar && usuarioEditar.rol === 'admin' ? 'selected' : ''}>Administrador</option>
                </select>
              </div>
              <div class="campo"><label>Teléfono</label><input type="text" id="u-telefono" value="${usuarioEditar && usuarioEditar.telefono ? usuarioEditar.telefono : ''}" /></div>
              ${usuarioEditar ? `
              <div class="campo">
                <label>Estado</label>
                <select id="u-activo">
                  <option value="true" ${usuarioEditar.activo ? 'selected' : ''}>Activo</option>
                  <option value="false" ${!usuarioEditar.activo ? 'selected' : ''}>Inactivo</option>
                </select>
              </div>` : ''}
            </div>
          </div>
          <div class="modal-pie"><button class="btn btn-secundario" id="cancelar">Cancelar</button><button class="btn btn-primario" id="guardar">Guardar</button></div>
        </div>
      </div>`;
    conectarModalSimple(async () => {
      const password = document.getElementById('u-password').value;

      if (usuarioEditar) {
        const payload = {
          nombre: document.getElementById('u-nombre').value.trim(),
          rol: document.getElementById('u-rol').value,
          telefono: document.getElementById('u-telefono').value.trim(),
          activo: document.getElementById('u-activo').value === 'true'
        };
        if (password) payload.password = password;
        await API.put(`/api/catalogos/usuarios/${usuarioEditar.id}`, payload);
      } else {
        await API.post('/api/catalogos/usuarios', {
          nombre: document.getElementById('u-nombre').value.trim(),
          usuario: document.getElementById('u-usuario').value.trim(),
          password,
          rol: document.getElementById('u-rol').value,
          telefono: document.getElementById('u-telefono').value.trim()
        });
      }
      cargarTecnicos();
    });
  }

  // ==========================================================
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
