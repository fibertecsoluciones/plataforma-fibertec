(async function () {
  const usuario = protegerPagina();
  if (!usuario) return;

  renderLayout('inventario', 'Inventario');
  const cont = document.getElementById('pagina-contenido');

  let categorias = [];

  cont.innerHTML = `<div class="cargando">Cargando inventario…</div>`;

  try {
    categorias = await API.get('/api/catalogos/inventario-categorias');
  } catch (err) {
    cont.innerHTML = `<div class="error-msg">${err.message}</div>`;
    return;
  }

  cont.innerHTML = `
    <div class="tarjeta">
      <div class="tarjeta-cabecera">
        <h3>Artículos y herramientas</h3>
        <div class="flex-gap">
          <button class="btn btn-secundario btn-sm" id="btn-movimiento">Registrar entrada/salida</button>
          <button class="btn btn-verde btn-sm" id="btn-nuevo-item">+ Nuevo artículo</button>
        </div>
      </div>
      <div class="tarjeta-cuerpo tabla-envoltura" id="tabla-inventario">
        <div class="cargando">Cargando…</div>
      </div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-cabecera"><h3>Movimientos recientes</h3></div>
      <div class="tarjeta-cuerpo tabla-envoltura" id="tabla-movimientos">
        <div class="cargando">Cargando…</div>
      </div>
    </div>

    <div id="modal-contenedor"></div>
  `;

  document.getElementById('btn-nuevo-item').addEventListener('click', abrirModalItem);
  document.getElementById('btn-movimiento').addEventListener('click', abrirModalMovimiento);

  await cargarItems();
  await cargarMovimientos();

  async function cargarItems() {
    const tabla = document.getElementById('tabla-inventario');
    try {
      const items = await API.get('/api/inventario/items');
      if (!items.length) {
        tabla.innerHTML = `<div class="estado-vacio">Aún no has registrado artículos en el inventario.</div>`;
        return;
      }
      tabla.innerHTML = `
        <table class="tabla">
          <thead><tr><th>Artículo</th><th>Categoría</th><th>Stock actual</th><th>Stock mínimo</th><th>Ubicación</th></tr></thead>
          <tbody>
            ${items.map(i => `
              <tr>
                <td class="celda-tarjeta-titulo">${i.nombre}</td>
                <td data-label="Categoría">${i.categoria_nombre || '—'}</td>
                <td data-label="Stock actual" class="${Number(i.stock_actual) <= Number(i.stock_minimo) ? 'stock-bajo' : ''}">${i.stock_actual} ${i.unidad}</td>
                <td data-label="Stock mínimo">${i.stock_minimo} ${i.unidad}</td>
                <td data-label="Ubicación">${i.ubicacion || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      tabla.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  }

  async function cargarMovimientos() {
    const tabla = document.getElementById('tabla-movimientos');
    try {
      const movs = await API.get('/api/inventario/movimientos');
      if (!movs.length) {
        tabla.innerHTML = `<div class="estado-vacio">Aún no hay movimientos registrados.</div>`;
        return;
      }
      tabla.innerHTML = `
        <table class="tabla">
          <thead><tr><th>Artículo</th><th>Tipo</th><th>Cantidad</th><th>Motivo</th><th>Registrado por</th><th>Fecha</th></tr></thead>
          <tbody>
            ${movs.map(m => `
              <tr>
                <td class="celda-tarjeta-titulo">${m.item_nombre}</td>
                <td data-label="Tipo"><span class="pill ${m.tipo === 'entrada' ? 'activo' : 'suspendido'}">${m.tipo}</span></td>
                <td data-label="Cantidad">${m.cantidad}</td>
                <td data-label="Motivo">${m.motivo || '—'}</td>
                <td data-label="Registrado por">${m.tecnico_nombre || '—'}</td>
                <td data-label="Fecha">${fechaCorta(m.fecha)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      tabla.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  }

  function abrirModalItem() {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera"><h3>Nuevo artículo</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
          <div class="modal-cuerpo">
            <div id="error-item" class="error-msg oculto"></div>
            <div class="grid-formulario">
              <div class="campo ancho-total"><label>Nombre</label><input type="text" id="it-nombre" required /></div>
              <div class="campo">
                <label>Categoría</label>
                <select id="it-categoria">
                  <option value="">Sin categoría</option>
                  ${categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
                </select>
              </div>
              <div class="campo"><label>Unidad</label><input type="text" id="it-unidad" value="pza" /></div>
              <div class="campo"><label>Stock inicial</label><input type="number" id="it-stock" value="0" min="0" step="0.01" /></div>
              <div class="campo"><label>Stock mínimo</label><input type="number" id="it-stock-min" value="0" min="0" step="0.01" /></div>
              <div class="campo ancho-total"><label>Ubicación</label><input type="text" id="it-ubicacion" placeholder="Ej. Bodega principal" /></div>
            </div>
          </div>
          <div class="modal-pie">
            <button class="btn btn-secundario" id="cancelar">Cancelar</button>
            <button class="btn btn-primario" id="guardar-item">Guardar</button>
          </div>
        </div>
      </div>
    `;
    const cerrar = () => { modalCont.innerHTML = ''; };
    document.getElementById('cerrar-modal').addEventListener('click', cerrar);
    document.getElementById('cancelar').addEventListener('click', cerrar);
    document.getElementById('guardar-item').addEventListener('click', async () => {
      const errorBox = document.getElementById('error-item');
      const nombre = document.getElementById('it-nombre').value.trim();
      if (!nombre) { errorBox.textContent = 'El nombre es obligatorio.'; errorBox.classList.remove('oculto'); return; }
      try {
        await API.post('/api/inventario/items', {
          nombre,
          categoria_id: document.getElementById('it-categoria').value || null,
          unidad: document.getElementById('it-unidad').value.trim() || 'pza',
          stock_actual: Number(document.getElementById('it-stock').value),
          stock_minimo: Number(document.getElementById('it-stock-min').value),
          ubicacion: document.getElementById('it-ubicacion').value.trim()
        });
        cerrar();
        cargarItems();
      } catch (err) { errorBox.textContent = err.message; errorBox.classList.remove('oculto'); }
    });
  }

  async function abrirModalMovimiento() {
    const items = await API.get('/api/inventario/items');
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera"><h3>Registrar entrada / salida</h3><button class="cerrar-modal" id="cerrar-modal">&times;</button></div>
          <div class="modal-cuerpo">
            <div id="error-mov" class="error-msg oculto"></div>
            <div class="grid-formulario">
              <div class="campo ancho-total">
                <label>Artículo</label>
                <select id="mv-item">${items.map(i => `<option value="${i.id}">${i.nombre} (stock: ${i.stock_actual} ${i.unidad})</option>`).join('')}</select>
              </div>
              <div class="campo">
                <label>Tipo de movimiento</label>
                <select id="mv-tipo"><option value="salida">Salida</option><option value="entrada">Entrada</option></select>
              </div>
              <div class="campo"><label>Cantidad</label><input type="number" id="mv-cantidad" min="0.01" step="0.01" value="1" /></div>
              <div class="campo ancho-total"><label>Motivo</label><input type="text" id="mv-motivo" placeholder="Ej. Instalación cliente POP-014, compra a proveedor…" /></div>
            </div>
          </div>
          <div class="modal-pie">
            <button class="btn btn-secundario" id="cancelar">Cancelar</button>
            <button class="btn btn-primario" id="guardar-mov">Guardar</button>
          </div>
        </div>
      </div>
    `;
    const cerrar = () => { modalCont.innerHTML = ''; };
    document.getElementById('cerrar-modal').addEventListener('click', cerrar);
    document.getElementById('cancelar').addEventListener('click', cerrar);
    document.getElementById('guardar-mov').addEventListener('click', async () => {
      const errorBox = document.getElementById('error-mov');
      try {
        await API.post('/api/inventario/movimientos', {
          item_id: Number(document.getElementById('mv-item').value),
          tipo: document.getElementById('mv-tipo').value,
          cantidad: Number(document.getElementById('mv-cantidad').value),
          motivo: document.getElementById('mv-motivo').value.trim()
        });
        cerrar();
        cargarItems();
        cargarMovimientos();
      } catch (err) { errorBox.textContent = err.message; errorBox.classList.remove('oculto'); }
    });
  }
})();
