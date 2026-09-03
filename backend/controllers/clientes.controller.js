const db = require('../config/db');
const XLSX = require('xlsx');

// Lista de clientes con su estado de pago (semáforo) - para el dashboard general
async function listarClientes(req, res) {
  const { zona, estado, semaforo, q } = req.query;

  let sql = `SELECT * FROM vw_estado_pago WHERE 1=1`;
  const params = [];

  if (zona) {
    params.push(zona);
    sql += ` AND zona = $${params.length}`;
  }
  if (estado) {
    params.push(estado);
    sql += ` AND estado_cliente = $${params.length}`;
  } else {
    // Por default, no mostrar clientes dados de baja (hay que pedirlo explícitamente)
    sql += ` AND estado_cliente <> 'baja'`;
  }
  if (semaforo) {
    params.push(semaforo);
    sql += ` AND semaforo = $${params.length}`;
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    sql += ` AND (LOWER(nombre) LIKE $${params.length} OR LOWER(cliente_id) LIKE $${params.length} OR ip LIKE $${params.length})`;
  }

  sql += ' ORDER BY semaforo = \'rojo\' DESC, meses_adeudados DESC, semaforo = \'naranja\' DESC, semaforo = \'amarillo\' DESC, nombre ASC';

  const r = await db.query(sql, params);
  res.json(r.rows);
}

// Detalle completo de un cliente (para edición y para la pantalla de pagos)
async function obtenerCliente(req, res) {
  const { id } = req.params;
  const r = await db.query(
    `SELECT c.*, z.nombre AS zona_nombre, pl.nombre AS plan_nombre, pl.precio,
            v.semaforo, v.meses_adeudados, v.saldo_pendiente, v.fecha_vencimiento
     FROM clientes c
     JOIN zonas z ON z.id = c.zona_id
     JOIN planes pl ON pl.id = c.plan_id
     LEFT JOIN vw_estado_pago v ON v.cliente_id_pk = c.id
     WHERE c.id = $1`,
    [id]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado.' });
  res.json(r.rows[0]);
}

// Búsqueda por Cliente-ID (folio) — usada por los técnicos para autocompletar el formulario
async function buscarPorFolio(req, res) {
  const { folio } = req.params;
  const r = await db.query(
    `SELECT c.*, z.nombre AS zona_nombre, pl.nombre AS plan_nombre, pl.precio
     FROM clientes c
     JOIN zonas z ON z.id = c.zona_id
     JOIN planes pl ON pl.id = c.plan_id
     WHERE UPPER(c.cliente_id) = UPPER($1)`,
    [folio]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'No existe ningún cliente con ese folio (Cliente-ID).' });
  res.json(r.rows[0]);
}

async function crearCliente(req, res) {
  const { nombre, telefono, telefono_alt, direccion, zona_id, plan_id, ip, dia_pago, dias_tolerancia, notas, adeudo_manual_meses, adeudo_manual_detalle, fecha_inicio_conteo } = req.body;

  if (!nombre || !zona_id || !plan_id || !dia_pago) {
    return res.status(400).json({ error: 'Nombre, zona, plan y día de pago son obligatorios.' });
  }
  if (dia_pago < 1 || dia_pago > 31) {
    return res.status(400).json({ error: 'El día de pago debe estar entre 1 y 31.' });
  }

  try {
    const r = await db.query(
      `INSERT INTO clientes
        (nombre, telefono, telefono_alt, direccion, zona_id, plan_id, ip, dia_pago, dias_tolerancia, notas, adeudo_manual_meses, adeudo_manual_detalle, fecha_inicio_conteo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,5),$10,COALESCE($11,0),$12,COALESCE($13, CURRENT_DATE))
       RETURNING *`,
      [nombre, telefono, telefono_alt, direccion, zona_id, plan_id, ip, dia_pago, dias_tolerancia, notas, adeudo_manual_meses, adeudo_manual_detalle, fecha_inicio_conteo]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'No se pudo crear el cliente. Revisa los datos enviados.' });
  }
}

async function actualizarCliente(req, res) {
  const { id } = req.params;
  const campos = ['nombre','telefono','telefono_alt','direccion','zona_id','plan_id','ip','dia_pago','dias_tolerancia','estado','notas','adeudo_manual_meses','adeudo_manual_detalle','fecha_inicio_conteo'];
  const sets = [];
  const params = [];

  campos.forEach((campo) => {
    if (req.body[campo] !== undefined) {
      params.push(req.body[campo]);
      sets.push(`${campo} = $${params.length}`);
    }
  });

  if (sets.length === 0) return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });

  params.push(id);
  const sql = `UPDATE clientes SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`;

  try {
    const r = await db.query(sql, params);
    if (!r.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'No se pudo actualizar el cliente.' });
  }
}

async function eliminarCliente(req, res) {
  const { id } = req.params;
  // Baja lógica, no se borra físicamente (se conserva el historial de pagos)
  const r = await db.query(`UPDATE clientes SET estado = 'baja' WHERE id = $1 RETURNING *`, [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado.' });
  res.json({ mensaje: 'Cliente dado de baja.', cliente: r.rows[0] });
}

// Resumen de conteos por semáforo, más el total de cartera vencida acumulada, para el dashboard
async function resumenSemaforo(req, res) {
  const r = await db.query(`SELECT semaforo, COUNT(*)::int AS total FROM vw_estado_pago WHERE estado_cliente <> 'baja' GROUP BY semaforo`);
  const cartera = await db.query(
    `SELECT COUNT(*) FILTER (WHERE meses_adeudados > 0)::int AS clientes_con_deuda,
            COALESCE(SUM(saldo_pendiente), 0)::numeric(12,2) AS saldo_total
     FROM vw_estado_pago WHERE estado_cliente <> 'baja'`
  );
  const base = { verde: 0, amarillo: 0, naranja: 0, rojo: 0 };
  r.rows.forEach((row) => { base[row.semaforo] = row.total; });
  res.json({
    ...base,
    clientes_con_deuda: cartera.rows[0].clientes_con_deuda,
    saldo_total: Number(cartera.rows[0].saldo_total)
  });
}

// ============================================================
// IMPORTACIÓN MASIVA DE CLIENTES (Excel/CSV)
// ============================================================

function normalizarClave(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9]/g, ''); // quita espacios, guiones bajos, etc.
}

// Genera y descarga una plantilla .xlsx con las columnas esperadas y, en hojas
// adicionales, las zonas y planes que ya existen en el sistema (para que el
// usuario sepa exactamente qué nombres escribir).
async function descargarPlantilla(req, res) {
  const zonas = await db.query('SELECT nombre, codigo FROM zonas WHERE activo = TRUE ORDER BY nombre');
  const planes = await db.query('SELECT nombre, precio FROM planes WHERE activo = TRUE ORDER BY nombre');

  const encabezados = ['Nombre', 'Telefono', 'Telefono_Alterno', 'Direccion', 'Zona', 'Plan', 'IP', 'Dia_Pago', 'Dias_Tolerancia', 'Estado', 'Notas'];
  const filaEjemplo = ['Juan Pérez', '9611234567', '', 'Calle Reforma #12', zonas.rows[0]?.nombre || 'POPOTLA', planes.rows[0]?.nombre || 'NAVEGA', '', 15, 5, 'activo', ''];

  const hojaClientes = XLSX.utils.aoa_to_sheet([encabezados, filaEjemplo]);
  hojaClientes['!cols'] = encabezados.map(() => ({ wch: 18 }));

  const hojaZonas = XLSX.utils.aoa_to_sheet([
    ['Zonas disponibles (escribe el nombre exacto en la columna "Zona")'],
    [],
    ...zonas.rows.map(z => [z.nombre, z.codigo])
  ]);

  const hojaPlanes = XLSX.utils.aoa_to_sheet([
    ['Planes disponibles (escribe el nombre exacto en la columna "Plan")'],
    [],
    ...planes.rows.map(p => [p.nombre, `$${p.precio}/mes`])
  ]);

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaClientes, 'Clientes');
  XLSX.utils.book_append_sheet(libro, hojaZonas, 'Zonas disponibles');
  XLSX.utils.book_append_sheet(libro, hojaPlanes, 'Planes disponibles');

  const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_clientes_fibertec.xlsx"');
  res.send(buffer);
}

// Recibe el archivo lleno, valida cada fila y da de alta a los clientes.
// El Cliente-ID (folio) se genera solo, vía el mismo trigger que usa el alta manual.
async function importarClientes(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });

  let libro;
  try {
    libro = XLSX.read(req.file.buffer, { type: 'buffer' });
  } catch (err) {
    return res.status(400).json({ error: 'No se pudo leer el archivo. Verifica que sea un .xlsx, .xls o .csv válido.' });
  }

  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });

  if (!filas.length) {
    return res.status(400).json({ error: 'El archivo no tiene filas de datos (o está usando la hoja equivocada).' });
  }

  // Precargamos zonas y planes para no consultar la base en cada fila.
  const zonas = (await db.query('SELECT id, nombre, codigo FROM zonas')).rows;
  const planes = (await db.query('SELECT id, nombre FROM planes')).rows;
  const mapaZonas = new Map(zonas.map(z => [normalizarClave(z.nombre), z.id]));
  zonas.forEach(z => mapaZonas.set(normalizarClave(z.codigo), z.id)); // también acepta el código
  const mapaPlanes = new Map(planes.map(p => [normalizarClave(p.nombre), p.id]));

  const esVacio = (v) => v === undefined || v === null || String(v).trim() === '';

  // Si la zona/plan viene vacía en la fila, en vez de rechazar la fila completa se asigna
  // a un catálogo temporal "SIN ZONA" / "SIN PLAN" (se crea la primera vez que se necesita)
  // para que el cliente sí se pueda importar y luego se corrija manualmente desde Clientes.
  let zonaPlaceholderId = null;
  async function obtenerZonaPlaceholder() {
    if (zonaPlaceholderId) return zonaPlaceholderId;
    const existente = mapaZonas.get(normalizarClave('SIN ZONA'));
    if (existente) { zonaPlaceholderId = existente; return existente; }
    let codigo = 'SZ';
    let n = 1;
    while ([...mapaZonas.keys()].includes(normalizarClave(codigo))) { codigo = 'SZ' + (++n); }
    const r = await db.query('INSERT INTO zonas (nombre, codigo) VALUES ($1,$2) RETURNING id', ['SIN ZONA', codigo]);
    zonaPlaceholderId = r.rows[0].id;
    mapaZonas.set(normalizarClave('SIN ZONA'), zonaPlaceholderId);
    return zonaPlaceholderId;
  }

  let planPlaceholderId = null;
  async function obtenerPlanPlaceholder() {
    if (planPlaceholderId) return planPlaceholderId;
    const existente = mapaPlanes.get(normalizarClave('SIN PLAN'));
    if (existente) { planPlaceholderId = existente; return existente; }
    const r = await db.query(`INSERT INTO planes (nombre, velocidad, precio) VALUES ('SIN PLAN', NULL, 0) RETURNING id`);
    planPlaceholderId = r.rows[0].id;
    mapaPlanes.set(normalizarClave('SIN PLAN'), planPlaceholderId);
    return planPlaceholderId;
  }

  const resultado = { total: filas.length, insertados: 0, fallidos: 0, detalle: [] };

  for (let i = 0; i < filas.length; i++) {
    const numeroFila = i + 2; // +2 porque la fila 1 es el encabezado
    const filaOriginal = filas[i];

    // Normalizamos las llaves de esta fila (para aceptar variaciones de mayúsculas/acentos/espacios)
    const fila = {};
    Object.entries(filaOriginal).forEach(([clave, valor]) => { fila[normalizarClave(clave)] = valor; });

    const nombre = String(fila['nombre'] || '').trim();
    const zonaTexto = String(fila['zona'] || '').trim();
    const planTexto = String(fila['plan'] || '').trim();
    const diaPagoRaw = fila['diapago'];
    const advertencias = [];

    if (!nombre) {
      resultado.fallidos++;
      resultado.detalle.push({ fila: numeroFila, nombre: nombre || '(sin nombre)', error: 'Falta el nombre del cliente (este campo sí es obligatorio).' });
      continue;
    }

    // ---- Zona: si viene vacía, se usa el placeholder; si viene escrita pero no existe, sí es error ----
    let zonaId;
    if (esVacio(zonaTexto)) {
      zonaId = await obtenerZonaPlaceholder();
      advertencias.push('Sin zona (se asignó "SIN ZONA", corrígela luego en el cliente).');
    } else {
      zonaId = mapaZonas.get(normalizarClave(zonaTexto));
      if (!zonaId) {
        resultado.fallidos++;
        resultado.detalle.push({ fila: numeroFila, nombre, error: `La zona "${zonaTexto}" no existe. Revisa la hoja "Zonas disponibles" o créala primero en Ajustes (o deja la celda vacía para corregirla después).` });
        continue;
      }
    }

    // ---- Plan: mismo criterio que zona ----
    let planId;
    if (esVacio(planTexto)) {
      planId = await obtenerPlanPlaceholder();
      advertencias.push('Sin plan (se asignó "SIN PLAN" con precio $0, corrígelo luego en el cliente).');
    } else {
      planId = mapaPlanes.get(normalizarClave(planTexto));
      if (!planId) {
        resultado.fallidos++;
        resultado.detalle.push({ fila: numeroFila, nombre, error: `El plan "${planTexto}" no existe. Revisa la hoja "Planes disponibles" o créalo primero en Ajustes (o deja la celda vacía para corregirlo después).` });
        continue;
      }
    }

    // ---- Día de pago: si viene vacío, se usa 1 temporalmente; si viene escrito pero inválido, sí es error ----
    let diaPago;
    if (esVacio(diaPagoRaw)) {
      diaPago = 1;
      advertencias.push('Sin día de pago (se puso "1" por defecto, corrígelo luego en el cliente).');
    } else {
      diaPago = parseInt(diaPagoRaw, 10);
      if (!diaPago || diaPago < 1 || diaPago > 31) {
        resultado.fallidos++;
        resultado.detalle.push({ fila: numeroFila, nombre, error: `El día de pago "${diaPagoRaw}" no es válido (debe ser un número entre 1 y 31, o dejarse vacío).` });
        continue;
      }
    }

    const estado = ['activo', 'suspendido', 'baja'].includes(String(fila['estado']).trim().toLowerCase())
      ? String(fila['estado']).trim().toLowerCase() : 'activo';

    const diasTolerancia = parseInt(fila['diastolerancia'], 10) || 5;

    try {
      const r = await db.query(
        `INSERT INTO clientes
          (nombre, telefono, telefono_alt, direccion, zona_id, plan_id, ip, dia_pago, dias_tolerancia, estado, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING cliente_id`,
        [
          nombre,
          String(fila['telefono'] || '').trim(),
          String(fila['telefonoalterno'] || '').trim(),
          String(fila['direccion'] || '').trim(),
          zonaId, planId,
          String(fila['ip'] || '').trim(),
          diaPago, diasTolerancia, estado,
          String(fila['notas'] || '').trim()
        ]
      );
      resultado.insertados++;
      resultado.detalle.push({
        fila: numeroFila, nombre, cliente_id: r.rows[0].cliente_id, error: null,
        advertencias: advertencias.length ? advertencias : undefined
      });
    } catch (err) {
      console.error(err);
      resultado.fallidos++;
      resultado.detalle.push({ fila: numeroFila, nombre, error: 'Error al guardar en la base de datos. Revisa los datos de esta fila.' });
    }
  }

  res.json(resultado);
}

module.exports = {
  listarClientes, obtenerCliente, buscarPorFolio,
  crearCliente, actualizarCliente, eliminarCliente,
  resumenSemaforo,
  descargarPlantilla, importarClientes
};
