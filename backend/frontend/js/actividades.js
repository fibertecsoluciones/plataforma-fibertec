(async function () {
  const usuario = protegerPagina();
  if (!usuario) return;

  renderLayout('actividades', 'Actividades');
  const cont = document.getElementById('pagina-contenido');
  const esAdmin = usuario.rol === 'admin';

  const ETIQUETA_PRIORIDAD = { alta: 'Alta', media: 'Media', baja: 'Baja' };
  const ETIQUETA_ESTADO_ACT = { pendiente: 'Pendiente', en_proceso: 'En proceso', completada: 'Completada' };
  const ETIQUETA_TIPO = { instalacion: '🔌 Instalación', mantenimiento: '🔧 Mantenimiento', falla: '⚠️ Falla', libranza: '🌴 Libranza' };

  let tecnicos = [];
  let filtroTecnico = '';
  let filtroEstado = '';
  let filtroTipo = '';
  let listaActual = []; // guarda la última lista cargada, para poder reordenarla y editar sin re-pedirla

  cont.innerHTML = `<div class="cargando">Cargando actividades…</div>`;

  if (esAdmin) {
    try { tecnicos = await API.get('/api/catalogos/tecnicos'); } catch (e) { /* no crítico */ }
  }

  cont.innerHTML = `
    <div class="tarjeta">
      <div class="tarjeta-cuerpo">
        <div class="flex-entre" style="flex-wrap:wrap; gap:12px;">
          <div class="flex-gap">
            ${esAdmin ? `
              <select id="filtro-tecnico" style="padding:9px 12px; border:1px solid var(--borde); border-radius:6px;">
                <option value="">Todos los técnicos</option>
                ${tecnicos.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('')}
              </select>
            ` : ''}
            <select id="filtro-estado-act" style="padding:9px 12px; border:1px solid var(--borde); border-radius:6px;">
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="en_proceso">En proceso</option>
              <option value="completada">Completada</option>
            </select>
            <select id="filtro-tipo-act" style="padding:9px 12px; border:1px solid var(--borde); border-radius:6px;">
              <option value="">Todas las categorías</option>
              <option value="instalacion">🔌 Instalación</option>
              <option value="mantenimiento">🔧 Mantenimiento</option>
              <option value="falla">⚠️ Falla</option>
              <option value="libranza">🌴 Libranza</option>
            </select>
          </div>
          ${esAdmin ? `<button class="btn btn-verde" id="btn-nueva-actividad">+ Nueva actividad</button>` : ''}
        </div>
      </div>
    </div>

    <div id="lista-actividades"><div class="cargando">Cargando…</div></div>
    <div id="modal-contenedor"></div>
  `;

  if (esAdmin) {
    document.getElementById('filtro-tecnico').addEventListener('change', (e) => { filtroTecnico = e.target.value; cargarLista(); });
    document.getElementById('btn-nueva-actividad').addEventListener('click', () => abrirModalNuevaActividad());
  }
  document.getElementById('filtro-estado-act').addEventListener('change', (e) => { filtroEstado = e.target.value; cargarLista(); });
  document.getElementById('filtro-tipo-act').addEventListener('change', (e) => { filtroTipo = e.target.value; cargarLista(); });

  await cargarLista();

  async function cargarLista() {
    const lista = document.getElementById('lista-actividades');
    lista.innerHTML = `<div class="cargando">Cargando…</div>`;
    const qs = new URLSearchParams();
    if (filtroTecnico) qs.set('tecnicoId', filtroTecnico);
    if (filtroEstado) qs.set('estado', filtroEstado);
    if (filtroTipo) qs.set('tipo', filtroTipo);

    try {
      const actividades = await API.get('/api/actividades?' + qs.toString());
      listaActual = actividades;
      if (!actividades.length) {
        lista.innerHTML = `<div class="estado-vacio">${esAdmin ? 'Aún no has creado ninguna actividad.' : 'No tienes actividades asignadas por ahora. 🎉'}</div>`;
        return;
      }
      lista.innerHTML = actividades.map((a, i) => renderTarjetaActividad(a, i)).join('');
      conectarEventosLista();
    } catch (err) {
      lista.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  }

  function renderTarjetaActividad(a, index) {
    const total = a.total_puntos || 0;
    const completados = a.puntos_completados || 0;
    const porcentaje = total > 0 ? Math.round((completados / total) * 100) : (a.estado === 'completada' ? 100 : 0);

    return `
      <div class="actividad-tarjeta prioridad-${a.prioridad}" data-actividad="${a.id}" ${esAdmin ? 'draggable="true"' : ''}>
        <div class="actividad-cabecera">
          <div class="flex-gap" style="align-items:flex-start;">
            <span class="actividad-numero" ${esAdmin ? 'title="Arrastra la tarjeta para reordenar"' : ''}>${index + 1}</span>
            <div>
              <div class="actividad-titulo" style="cursor:pointer; text-decoration:underline dotted; text-underline-offset:3px;" data-detalle="${a.id}" title="Ver detalle">${a.titulo}</div>
              <div class="actividad-meta">
                <span class="pill tipo-${a.tipo}">${ETIQUETA_TIPO[a.tipo]}</span>
                <span class="pill prioridad-${a.prioridad}">${ETIQUETA_PRIORIDAD[a.prioridad]}</span>
                <span class="pill ${a.estado}">${ETIQUETA_ESTADO_ACT[a.estado]}</span>
                ${esAdmin ? `<span>👷 ${a.tecnico_nombre}</span>` : ''}
                ${a.cliente_folio ? `<span class="folio">${a.cliente_folio}</span> ${a.cliente_nombre}` : ''}
                ${a.fecha_limite ? `<span>📅 ${fechaCorta(a.fecha_limite)}</span>` : ''}
                ${a.latitud && a.longitud ? `
                  <a href="${linkGoogleMaps(a.latitud, a.longitud)}" target="_blank" class="pill ${a.ubicacion_confirmada ? 'ubicacion-confirmada' : 'ubicacion-estimada'}">
                    ${a.ubicacion_confirmada ? '✅ Ubicación confirmada' : '📍 Ubicación estimada'}
                  </a>` : ''}
                ${a.instalacion_relacionada_fecha ? `<span style="color:var(--sem-verde);">✅ Instalación registrada el ${fechaCorta(a.instalacion_relacionada_fecha)}</span>` : ''}
                ${a.estado === 'completada' && a.completado_en ? `<span style="color:var(--sem-verde);">🏁 Completada el ${fechaHoraCorta(a.completado_en)}</span>` : ''}
              </div>
              ${a.notas_tecnico ? `<div class="texto-gris" style="font-size:12px; margin-top:6px;">📝 ${a.notas_tecnico}</div>` : ''}
            </div>
          </div>
          <div class="flex-gap">
            ${esAdmin ? `<button class="btn btn-secundario btn-sm btn-icono" data-editar-actividad="${a.id}" title="Editar actividad">✏️</button>` : ''}
            ${esAdmin ? `<button class="btn btn-secundario btn-sm" data-agregar-punto="${a.id}">+ Punto</button>` : ''}
            ${esAdmin ? `<button class="btn btn-peligro btn-sm btn-icono" data-borrar-actividad="${a.id}" title="Eliminar actividad">🗑️</button>` : ''}
          </div>
        </div>
        ${a.descripcion ? `<div class="actividad-descripcion">${a.descripcion}</div>` : ''}
        <div class="actividad-cuerpo">
          ${total > 0 ? `
            <div class="texto-gris" style="font-size:12px;">${completados} de ${total} puntos completados</div>
            <div class="barra-progreso"><div class="barra-progreso-relleno" style="width:${porcentaje}%"></div></div>
            <div class="checklist" id="checklist-${a.id}"><div class="cargando">Cargando puntos…</div></div>
          ` : `
            <div class="flex-gap">
              <button class="btn btn-sm ${a.estado === 'completada' ? 'btn-secundario' : 'btn-verde'}" data-marcar-simple="${a.id}" data-estado-actual="${a.estado}">
                ${a.estado === 'completada' ? 'Marcar como pendiente' : '✓ Marcar como completada'}
              </button>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function conectarEventosLista() {
    // Cargar el checklist de cada actividad que tenga puntos
    document.querySelectorAll('[id^="checklist-"]').forEach(async (contChecklist) => {
      const actividadId = contChecklist.id.replace('checklist-', '');
      try {
        const detalle = await API.get(`/api/actividades/${actividadId}`);
        contChecklist.innerHTML = detalle.puntos.map(p => `
          <label class="checklist-item ${p.completado ? 'completado' : ''}">
            <input type="checkbox" data-punto="${p.id}" ${p.completado ? 'checked' : ''} />
            <span class="checklist-texto">${p.descripcion}</span>
          </label>
        `).join('');

        contChecklist.querySelectorAll('[data-punto]').forEach(chk => {
          chk.addEventListener('change', async () => {
            try {
              await API.put(`/api/actividades/puntos/${chk.dataset.punto}`, { completado: chk.checked });
              cargarLista();
            } catch (err) { alert(err.message); chk.checked = !chk.checked; }
          });
        });
      } catch (err) {
        contChecklist.innerHTML = `<div class="error-msg">${err.message}</div>`;
      }
    });

    document.querySelectorAll('[data-marcar-simple]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nuevoEstado = btn.dataset.estadoActual === 'completada' ? 'pendiente' : 'completada';
        try {
          await API.put(`/api/actividades/${btn.dataset.marcarSimple}/estado`, { estado: nuevoEstado });
          cargarLista();
        } catch (err) { alert(err.message); }
      });
    });

    document.querySelectorAll('[data-borrar-actividad]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta actividad? Se borra junto con todos sus puntos.')) return;
        try {
          await API.del(`/api/actividades/${btn.dataset.borrarActividad}`);
          cargarLista();
        } catch (err) { alert(err.message); }
      });
    });

    document.querySelectorAll('[data-agregar-punto]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const descripcion = prompt('Describe el nuevo punto del checklist:');
        if (!descripcion || !descripcion.trim()) return;
        try {
          await API.post(`/api/actividades/${btn.dataset.agregarPunto}/puntos`, { descripcion: descripcion.trim() });
          cargarLista();
        } catch (err) { alert(err.message); }
      });
    });

    document.querySelectorAll('[data-detalle]').forEach(el => {
      el.addEventListener('click', () => abrirModalDetalle(el.dataset.detalle));
    });

    document.querySelectorAll('[data-editar-actividad]').forEach(btn => {
      btn.addEventListener('click', () => {
        const actividad = listaActual.find(a => String(a.id) === btn.dataset.editarActividad);
        if (actividad) abrirModalEditarActividad(actividad);
      });
    });

    if (esAdmin) activarArrastrarYSoltar();
  }

  // Arrastrar y soltar para reordenar (solo admin). Mueve la tarjeta en el DOM al
  // instante, y guarda el nuevo orden completo en el servidor.
  function activarArrastrarYSoltar() {
    const contenedor = document.getElementById('lista-actividades');
    let idArrastrado = null;

    contenedor.querySelectorAll('.actividad-tarjeta[draggable="true"]').forEach(tarjeta => {
      tarjeta.addEventListener('dragstart', () => {
        idArrastrado = tarjeta.dataset.actividad;
        tarjeta.classList.add('arrastrando');
      });
      tarjeta.addEventListener('dragend', () => {
        tarjeta.classList.remove('arrastrando');
        contenedor.querySelectorAll('.zona-drop').forEach(el => el.classList.remove('zona-drop'));
      });
      tarjeta.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (tarjeta.dataset.actividad !== idArrastrado) tarjeta.classList.add('zona-drop');
      });
      tarjeta.addEventListener('dragleave', () => tarjeta.classList.remove('zona-drop'));
      tarjeta.addEventListener('drop', async (e) => {
        e.preventDefault();
        tarjeta.classList.remove('zona-drop');
        const idDestino = tarjeta.dataset.actividad;
        if (!idArrastrado || idArrastrado === idDestino) return;

        const draggedEl = contenedor.querySelector(`[data-actividad="${idArrastrado}"]`);
        const todas = Array.from(contenedor.querySelectorAll('.actividad-tarjeta'));
        const indiceOrigen = todas.indexOf(draggedEl);
        const indiceDestino = todas.indexOf(tarjeta);

        if (indiceOrigen < indiceDestino) tarjeta.after(draggedEl);
        else tarjeta.before(draggedEl);

        const nuevosIds = Array.from(contenedor.querySelectorAll('.actividad-tarjeta')).map(el => Number(el.dataset.actividad));
        try {
          await API.put('/api/actividades/reordenar', { ids: nuevosIds });
          cargarLista(); // recarga para que los números (1, 2, 3…) queden correctos
        } catch (err) {
          alert(err.message);
          cargarLista();
        }
      });
    });
  }

  // ==========================================================
  // MODAL: ver detalle completo de una actividad + notas del técnico
  // ==========================================================
  async function abrirModalDetalle(id) {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `<div class="modal-fondo"><div class="modal"><div class="modal-cuerpo"><div class="cargando">Cargando…</div></div></div></div>`;

    try {
      const a = await API.get(`/api/actividades/${id}`);

      modalCont.innerHTML = `
        <div class="modal-fondo">
          <div class="modal">
            <div class="modal-cabecera">
              <h3>${a.titulo}</h3>
              <button class="cerrar-modal" id="cerrar-modal">&times;</button>
            </div>
            <div class="modal-cuerpo">
              <div class="actividad-meta" style="margin-bottom:12px;">
                <span class="pill tipo-${a.tipo}">${ETIQUETA_TIPO[a.tipo]}</span>
                <span class="pill prioridad-${a.prioridad}">${ETIQUETA_PRIORIDAD[a.prioridad]}</span>
                <span class="pill ${a.estado}">${ETIQUETA_ESTADO_ACT[a.estado]}</span>
                <span>👷 ${a.tecnico_nombre}</span>
                ${a.cliente_folio ? `<span class="folio">${a.cliente_folio}</span> ${a.cliente_nombre}` : ''}
              </div>

              ${a.descripcion ? `<p style="font-size:13.5px; color:var(--tinta-suave); margin-top:0;">${a.descripcion}</p>` : ''}

              <div class="texto-gris" style="font-size:12px; line-height:1.6;">
                Creada el ${fechaHoraCorta(a.creado_en)}${a.creado_por_nombre ? ' por ' + a.creado_por_nombre : ''}<br>
                ${a.fecha_limite ? `Fecha límite: ${fechaCorta(a.fecha_limite)}<br>` : ''}
                ${a.completado_en ? `<span style="color:var(--sem-verde);">🏁 Completada el ${fechaHoraCorta(a.completado_en)}</span>` : ''}
              </div>

              ${a.latitud && a.longitud ? `
                <div style="margin:12px 0;">
                  <a href="${linkGoogleMaps(a.latitud, a.longitud)}" target="_blank" class="pill ${a.ubicacion_confirmada ? 'ubicacion-confirmada' : 'ubicacion-estimada'}">
                    ${a.ubicacion_confirmada ? '✅ Ubicación confirmada' : '📍 Ubicación estimada'} — Ver en el mapa
                  </a>
                </div>` : ''}

              ${a.puntos && a.puntos.length ? `
                <h4 style="font-size:13px; margin: 16px 0 8px;">Checklist</h4>
                <div class="checklist">
                  ${a.puntos.map(p => `
                    <div class="checklist-item ${p.completado ? 'completado' : ''}">
                      <input type="checkbox" disabled ${p.completado ? 'checked' : ''} />
                      <div style="flex:1;">
                        <div class="checklist-texto">${p.descripcion}</div>
                        ${p.completado && p.completado_en ? `<div class="texto-gris" style="font-size:11px; margin-top:2px;">✓ ${fechaHoraCorta(p.completado_en)}${p.completado_por_nombre ? ' — ' + p.completado_por_nombre : ''}</div>` : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}

              <div class="campo" style="margin-top:18px;">
                <label>📝 Notas del técnico</label>
                <textarea id="detalle-notas-tecnico" rows="3" placeholder="Observaciones sobre cómo salió, incidencias, materiales usados, etc.">${a.notas_tecnico || ''}</textarea>
              </div>
              <div id="error-notas-detalle" class="error-msg oculto"></div>
            </div>
            <div class="modal-pie">
              <button class="btn btn-secundario" id="cerrar-detalle">Cerrar</button>
              <button class="btn btn-primario" id="guardar-notas-detalle">Guardar notas</button>
            </div>
          </div>
        </div>
      `;

      const cerrar = () => { modalCont.innerHTML = ''; };
      document.getElementById('cerrar-modal').addEventListener('click', cerrar);
      document.getElementById('cerrar-detalle').addEventListener('click', cerrar);

      document.getElementById('guardar-notas-detalle').addEventListener('click', async () => {
        const errorBox = document.getElementById('error-notas-detalle');
        try {
          await API.put(`/api/actividades/${id}/notas`, {
            notas_tecnico: document.getElementById('detalle-notas-tecnico').value.trim()
          });
          cerrar();
          cargarLista();
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.classList.remove('oculto');
        }
      });
    } catch (err) {
      modalCont.innerHTML = `<div class="modal-fondo"><div class="modal"><div class="modal-cuerpo"><div class="error-msg">${err.message}</div></div></div></div>`;
    }
  }

  // ==========================================================
  // MODAL: nueva actividad (solo admin)
  // ==========================================================
  function abrirModalNuevaActividad() {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera">
            <h3>Nueva actividad</h3>
            <button class="cerrar-modal" id="cerrar-modal">&times;</button>
          </div>
          <div class="modal-cuerpo">
            <div id="error-actividad" class="error-msg oculto"></div>
            <div class="grid-formulario">
              <div class="campo ancho-total">
                <label>Título</label>
                <input type="text" id="na-titulo" placeholder="Ej. Revisar señal en Popotla" />
              </div>
              <div class="campo ancho-total">
                <label>Descripción (opcional)</label>
                <textarea id="na-descripcion" rows="2"></textarea>
              </div>
              <div class="campo">
                <label>Asignar a</label>
                <select id="na-tecnico">
                  ${tecnicos.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('')}
                </select>
              </div>
              <div class="campo">
                <label>Categoría</label>
                <select id="na-tipo">
                  <option value="instalacion" selected>🔌 Instalación</option>
                  <option value="mantenimiento">🔧 Mantenimiento</option>
                  <option value="falla">⚠️ Falla</option>
                  <option value="libranza">🌴 Libranza</option>
                </select>
              </div>
              <div class="campo">
                <label>Prioridad</label>
                <select id="na-prioridad">
                  <option value="media" selected>Media</option>
                  <option value="alta">Alta</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
              <div class="campo">
                <label>Fecha límite (opcional)</label>
                <input type="date" id="na-fecha-limite" />
              </div>
              <div class="campo ancho-total" style="position:relative;">
                <label>Cliente relacionado (opcional)</label>
                <input type="text" id="na-cliente-busqueda" placeholder="Escribe el nombre o folio para buscar…" autocomplete="off" />
                <input type="hidden" id="na-cliente-folio" />
                <div id="na-cliente-sugerencias" class="autocomplete-lista oculto"></div>
              </div>
              <div class="campo ancho-total">
                <label>Ubicación (opcional)</label>
                <div id="na-mapa" class="mapa-selector"></div>
                <div class="ubicacion-campo" style="margin-top:8px;">
                  <input type="text" id="na-texto" placeholder="O pega aquí un link de Google Maps" />
                  <button type="button" class="btn btn-secundario btn-sm" id="na-usar-mi-ubicacion">📍 Usar la mía</button>
                </div>
                <div id="na-preview" class="ubicacion-vista-previa oculto"></div>
              </div>
              <div class="campo ancho-total">
                <label>Checklist (opcional — déjalo vacío si es una tarea simple)</label>
                <div id="lista-puntos-nuevos"></div>
                <button type="button" class="btn btn-secundario btn-sm" id="btn-agregar-punto-nuevo">+ Agregar punto</button>
              </div>
            </div>
          </div>
          <div class="modal-pie">
            <button class="btn btn-secundario" id="cancelar-actividad">Cancelar</button>
            <button class="btn btn-primario" id="guardar-actividad">Crear actividad</button>
          </div>
        </div>
      </div>
    `;

    const cerrar = () => { mapaActividad.remove(); modalCont.innerHTML = ''; };
    document.getElementById('cerrar-modal').addEventListener('click', cerrar);
    document.getElementById('cancelar-actividad').addEventListener('click', cerrar);

    const listaPuntosNuevos = document.getElementById('lista-puntos-nuevos');
    function agregarFilaPunto() {
      const fila = document.createElement('div');
      fila.className = 'punto-nuevo-fila';
      fila.innerHTML = `<input type="text" placeholder="Ej. Revisar el nodo" /><button type="button" class="btn-quitar-punto">&times;</button>`;
      fila.querySelector('.btn-quitar-punto').addEventListener('click', () => fila.remove());
      listaPuntosNuevos.appendChild(fila);
    }
    document.getElementById('btn-agregar-punto-nuevo').addEventListener('click', agregarFilaPunto);
    agregarFilaPunto(); // arranca con una fila lista

    // Ubicación: mapa interactivo (clic o arrastrar el pin), con opción de pegar
    // un link de Maps o usar la ubicación actual de quien está capturando.
    let ubicacionNuevaActividad = { lat: null, lng: null };
    const mapaActividad = activarSelectorUbicacion('na', null, null, (lat, lng) => { ubicacionNuevaActividad = { lat, lng }; });

    // Autocompletar de cliente: busca por nombre o folio conforme se escribe
    const inputBusquedaCliente = document.getElementById('na-cliente-busqueda');
    const inputFolioOculto = document.getElementById('na-cliente-folio');
    const listaSugerencias = document.getElementById('na-cliente-sugerencias');
    let debounceCliente;

    inputBusquedaCliente.addEventListener('input', () => {
      inputFolioOculto.value = ''; // si vuelve a escribir, invalida la selección anterior
      clearTimeout(debounceCliente);
      const q = inputBusquedaCliente.value.trim();
      if (q.length < 2) { listaSugerencias.classList.add('oculto'); listaSugerencias.innerHTML = ''; return; }

      debounceCliente = setTimeout(async () => {
        try {
          const resultados = await API.get('/api/clientes?q=' + encodeURIComponent(q));
          if (!resultados.length) {
            listaSugerencias.innerHTML = `<div class="autocomplete-item texto-gris">Sin resultados</div>`;
          } else {
            listaSugerencias.innerHTML = resultados.slice(0, 8).map(c => `
              <div class="autocomplete-item" data-folio="${c.cliente_id}" data-nombre="${c.nombre.replace(/"/g, '&quot;')}">
                <span class="autocomplete-folio">${c.cliente_id}</span> — ${c.nombre}
              </div>
            `).join('');
            listaSugerencias.querySelectorAll('[data-folio]').forEach(item => {
              item.addEventListener('click', () => {
                inputBusquedaCliente.value = `${item.dataset.folio} — ${item.dataset.nombre}`;
                inputFolioOculto.value = item.dataset.folio;
                listaSugerencias.classList.add('oculto');
              });
            });
          }
          listaSugerencias.classList.remove('oculto');
        } catch (err) { /* silencioso, no bloquea el formulario */ }
      }, 300);
    });

    document.addEventListener('click', (e) => {
      if (!listaSugerencias.contains(e.target) && e.target !== inputBusquedaCliente) {
        listaSugerencias.classList.add('oculto');
      }
    });

    document.getElementById('guardar-actividad').addEventListener('click', async () => {
      const errorBox = document.getElementById('error-actividad');
      const titulo = document.getElementById('na-titulo').value.trim();
      if (!titulo) {
        errorBox.textContent = 'El título es obligatorio.';
        errorBox.classList.remove('oculto');
        return;
      }

      const puntos = Array.from(listaPuntosNuevos.querySelectorAll('input'))
        .map(i => i.value.trim())
        .filter(v => v);

      const payload = {
        titulo,
        descripcion: document.getElementById('na-descripcion').value.trim(),
        tecnico_id: Number(document.getElementById('na-tecnico').value),
        prioridad: document.getElementById('na-prioridad').value,
        tipo: document.getElementById('na-tipo').value,
        fecha_limite: document.getElementById('na-fecha-limite').value || null,
        cliente_folio: document.getElementById('na-cliente-folio').value || document.getElementById('na-cliente-busqueda').value.trim(),
        latitud: ubicacionNuevaActividad.lat,
        longitud: ubicacionNuevaActividad.lng,
        puntos
      };

      try {
        await API.post('/api/actividades', payload);
        cerrar();
        cargarLista();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.remove('oculto');
      }
    });
  }

  // ==========================================================
  // MODAL: editar actividad existente
  // ==========================================================
  function abrirModalEditarActividad(a) {
    const modalCont = document.getElementById('modal-contenedor');
    modalCont.innerHTML = `
      <div class="modal-fondo">
        <div class="modal">
          <div class="modal-cabecera">
            <h3>Editar actividad</h3>
            <button class="cerrar-modal" id="cerrar-modal">&times;</button>
          </div>
          <div class="modal-cuerpo">
            <div id="error-editar-actividad" class="error-msg oculto"></div>
            <div class="grid-formulario">
              <div class="campo ancho-total">
                <label>Título</label>
                <input type="text" id="ea-titulo" value="${a.titulo.replace(/"/g, '&quot;')}" />
              </div>
              <div class="campo ancho-total">
                <label>Descripción (opcional)</label>
                <textarea id="ea-descripcion" rows="2">${a.descripcion || ''}</textarea>
              </div>
              <div class="campo">
                <label>Asignar a</label>
                <select id="ea-tecnico">
                  ${tecnicos.map(t => `<option value="${t.id}" ${String(t.id) === String(a.tecnico_id) ? 'selected' : ''}>${t.nombre}</option>`).join('')}
                </select>
              </div>
              <div class="campo">
                <label>Categoría</label>
                <select id="ea-tipo">
                  <option value="instalacion" ${a.tipo === 'instalacion' ? 'selected' : ''}>🔌 Instalación</option>
                  <option value="mantenimiento" ${a.tipo === 'mantenimiento' ? 'selected' : ''}>🔧 Mantenimiento</option>
                  <option value="falla" ${a.tipo === 'falla' ? 'selected' : ''}>⚠️ Falla</option>
                  <option value="libranza" ${a.tipo === 'libranza' ? 'selected' : ''}>🌴 Libranza</option>
                </select>
              </div>
              <div class="campo">
                <label>Prioridad</label>
                <select id="ea-prioridad">
                  <option value="alta" ${a.prioridad === 'alta' ? 'selected' : ''}>Alta</option>
                  <option value="media" ${a.prioridad === 'media' ? 'selected' : ''}>Media</option>
                  <option value="baja" ${a.prioridad === 'baja' ? 'selected' : ''}>Baja</option>
                </select>
              </div>
              <div class="campo">
                <label>Fecha límite (opcional)</label>
                <input type="date" id="ea-fecha-limite" value="${a.fecha_limite ? String(a.fecha_limite).slice(0, 10) : ''}" />
              </div>
              <div class="campo ancho-total" style="position:relative;">
                <label>Cliente relacionado (opcional)</label>
                <input type="text" id="ea-cliente-busqueda" placeholder="Escribe el nombre o folio para buscar…" autocomplete="off"
                  value="${a.cliente_folio ? `${a.cliente_folio} — ${a.cliente_nombre}` : ''}" />
                <input type="hidden" id="ea-cliente-folio" value="${a.cliente_folio || ''}" />
                <div id="ea-cliente-sugerencias" class="autocomplete-lista oculto"></div>
              </div>
              <div class="campo ancho-total">
                <label>Ubicación (opcional)</label>
                <div id="ea-mapa" class="mapa-selector"></div>
                <div class="ubicacion-campo" style="margin-top:8px;">
                  <input type="text" id="ea-texto" placeholder="O pega aquí un link de Google Maps" />
                  <button type="button" class="btn btn-secundario btn-sm" id="ea-usar-mi-ubicacion">📍 Usar la mía</button>
                </div>
                <div id="ea-preview" class="ubicacion-vista-previa oculto"></div>
              </div>
            </div>
          </div>
          <div class="modal-pie">
            <button class="btn btn-secundario" id="cancelar-editar-actividad">Cancelar</button>
            <button class="btn btn-primario" id="guardar-editar-actividad">Guardar cambios</button>
          </div>
        </div>
      </div>
    `;

    const cerrar = () => { mapaEditar.remove(); modalCont.innerHTML = ''; };
    document.getElementById('cerrar-modal').addEventListener('click', cerrar);
    document.getElementById('cancelar-editar-actividad').addEventListener('click', cerrar);

    let ubicacionEditada = { lat: a.latitud ? Number(a.latitud) : null, lng: a.longitud ? Number(a.longitud) : null };
    const mapaEditar = activarSelectorUbicacion('ea', ubicacionEditada.lat, ubicacionEditada.lng, (lat, lng) => { ubicacionEditada = { lat, lng }; });

    const inputBusquedaCliente = document.getElementById('ea-cliente-busqueda');
    const inputFolioOculto = document.getElementById('ea-cliente-folio');
    const listaSugerencias = document.getElementById('ea-cliente-sugerencias');
    let debounceCliente;

    inputBusquedaCliente.addEventListener('input', () => {
      inputFolioOculto.value = '';
      clearTimeout(debounceCliente);
      const q = inputBusquedaCliente.value.trim();
      if (q.length < 2) { listaSugerencias.classList.add('oculto'); listaSugerencias.innerHTML = ''; return; }

      debounceCliente = setTimeout(async () => {
        try {
          const resultados = await API.get('/api/clientes?q=' + encodeURIComponent(q));
          listaSugerencias.innerHTML = resultados.length
            ? resultados.slice(0, 8).map(c => `
                <div class="autocomplete-item" data-folio="${c.cliente_id}" data-nombre="${c.nombre.replace(/"/g, '&quot;')}">
                  <span class="autocomplete-folio">${c.cliente_id}</span> — ${c.nombre}
                </div>`).join('')
            : `<div class="autocomplete-item texto-gris">Sin resultados</div>`;
          listaSugerencias.querySelectorAll('[data-folio]').forEach(item => {
            item.addEventListener('click', () => {
              inputBusquedaCliente.value = `${item.dataset.folio} — ${item.dataset.nombre}`;
              inputFolioOculto.value = item.dataset.folio;
              listaSugerencias.classList.add('oculto');
            });
          });
          listaSugerencias.classList.remove('oculto');
        } catch (err) { /* silencioso */ }
      }, 300);
    });

    document.addEventListener('click', (e) => {
      if (!listaSugerencias.contains(e.target) && e.target !== inputBusquedaCliente) {
        listaSugerencias.classList.add('oculto');
      }
    });

    document.getElementById('guardar-editar-actividad').addEventListener('click', async () => {
      const errorBox = document.getElementById('error-editar-actividad');
      const titulo = document.getElementById('ea-titulo').value.trim();
      if (!titulo) {
        errorBox.textContent = 'El título es obligatorio.';
        errorBox.classList.remove('oculto');
        return;
      }

      const payload = {
        titulo,
        descripcion: document.getElementById('ea-descripcion').value.trim(),
        tecnico_id: Number(document.getElementById('ea-tecnico').value),
        prioridad: document.getElementById('ea-prioridad').value,
        tipo: document.getElementById('ea-tipo').value,
        fecha_limite: document.getElementById('ea-fecha-limite').value || null,
        cliente_folio: document.getElementById('ea-cliente-folio').value || document.getElementById('ea-cliente-busqueda').value.trim(),
        latitud: ubicacionEditada.lat,
        longitud: ubicacionEditada.lng
      };

      try {
        await API.put(`/api/actividades/${a.id}`, payload);
        cerrar();
        cargarLista();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.remove('oculto');
      }
    });
  }
})();
