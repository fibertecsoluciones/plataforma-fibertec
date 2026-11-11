const db = require('../config/db');
const XLSX = require('xlsx');

// ==========================================================
// PROYECCIÓN DE INGRESOS POR MENSUALIDADES + SIMULACIÓN DE GASTOS
//
// INGRESOS: cuánto se espera cobrar cada mes con la cartera de clientes y el precio de su plan.
//  · Cuentan los clientes ACTIVOS. Los suspendidos (congelados) y los dados de baja NO cuentan.
//  · Un cliente cuenta desde el mes en que empieza a cobrársele (fecha_inicio_conteo). Quien está en
//    "mes gratis" empieza a contar cuando ese mes termina.
//  · Se supone que la cartera actual se mantiene: sin clientes nuevos ni bajas.
//
// GASTOS: los que el administrador captura para SIMULAR (no son egresos reales y no tocan Finanzas).
//  · 'mensual' → se repite cada mes entre mes_inicio y mes_fin (ambos opcionales)
//  · 'unica'   → ocurre una sola vez en el mes indicado
//  · Solo cuentan los que están ACTIVOS (se pueden apagar para comparar escenarios).
// ==========================================================

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const CATEGORIAS = ['Servicio de internet', 'Gastos operativos', 'Gasolina', 'Refacciones', 'Módems', 'Otro'];
const redondear = (n) => Math.round(Number(n || 0) * 100) / 100;
const etiquetaMes = (clave) => { const [a, m] = clave.split('-'); return `${MESES[Number(m) - 1]} de ${a}`; };

class ErrorNegocio extends Error { constructor(m, status = 400) { super(m); this.status = status; } }
function responderError(res, err, contexto, generico) {
  if (err instanceof ErrorNegocio) return res.status(err.status).json({ error: err.message });
  if (err && err.code === '42P01') { // tabla inexistente: falta correr la migración
    console.error(`Error en ${contexto}: falta la migración 023 (tabla proyeccion_gastos)`);
    return res.status(500).json({ error: 'Falta correr una migración de la base de datos. En la Shell del backend ejecuta: node db/migrate.js migrations/023_proyeccion_gastos.sql' });
  }
  console.error(`Error en ${contexto}:`, err);
  return res.status(500).json({ error: generico });
}

function leerMeses(valor) {
  if (valor === undefined || valor === '') return 12;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > 24) throw new ErrorNegocio('El número de meses debe estar entre 1 y 24.');
  return n;
}

// ---------- validación de un gasto capturado ----------
function claveMesValida(v, nombre) {
  if (v === undefined || v === null || v === '') return null;
  const t = String(v);
  const m = /^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/.exec(t);
  if (!m) throw new ErrorNegocio(`${nombre} no es un mes válido (usa AAAA-MM).`);
  return `${m[1]}-${m[2]}-01`;
}
function validarGasto(b) {
  const concepto = String(b.concepto || '').trim();
  if (!concepto) throw new ErrorNegocio('Escribe el concepto del gasto.');
  if (concepto.length > 120) throw new ErrorNegocio('El concepto es demasiado largo (máximo 120 caracteres).');
  if (!CATEGORIAS.includes(b.categoria)) throw new ErrorNegocio('La categoría no es válida.');
  const monto = Number(b.monto);
  if (b.monto === '' || b.monto === null || b.monto === undefined || !Number.isFinite(monto) || monto <= 0) throw new ErrorNegocio('El monto debe ser mayor a 0.');
  const montoR = Math.round(monto * 100) / 100;
  if (montoR > 99999999.99) throw new ErrorNegocio('El monto es demasiado grande.');
  if (!['mensual', 'unica'].includes(b.frecuencia)) throw new ErrorNegocio('Elige si el gasto es cada mes o una sola vez.');
  const inicio = claveMesValida(b.mes_inicio, 'El mes');
  let fin = claveMesValida(b.mes_fin, 'El mes final');
  if (b.frecuencia === 'unica') {
    if (!inicio) throw new ErrorNegocio('Elige en qué mes ocurre el gasto.');
    fin = null;
  } else if (inicio && fin && fin < inicio) {
    throw new ErrorNegocio('El mes final no puede ser anterior al mes de inicio.');
  }
  return { concepto, categoria: b.categoria, monto: montoR, frecuencia: b.frecuencia, inicio, fin, notas: String(b.notas || '').trim() || null };
}

const SELECT_GASTO = `id, concepto, categoria, monto::float AS monto, frecuencia, to_char(mes_inicio, 'YYYY-MM') AS mes_inicio,
                      to_char(mes_fin, 'YYYY-MM') AS mes_fin, activo, notas`;

async function listarGastos(req, res) {
  try {
    const r = await db.query(`SELECT ${SELECT_GASTO} FROM proyeccion_gastos ORDER BY activo DESC, categoria, concepto, id`);
    res.json({ categorias: CATEGORIAS, gastos: r.rows });
  } catch (err) { responderError(res, err, 'listarGastos', 'No se pudieron cargar los gastos.'); }
}

async function crearGasto(req, res) {
  try {
    const g = validarGasto(req.body || {});
    const r = await db.query(
      `INSERT INTO proyeccion_gastos (concepto, categoria, monto, frecuencia, mes_inicio, mes_fin, notas, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${SELECT_GASTO}`,
      [g.concepto, g.categoria, g.monto, g.frecuencia, g.inicio, g.fin, g.notas, req.usuario.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { responderError(res, err, 'crearGasto', 'No se pudo guardar el gasto.'); }
}

async function actualizarGasto(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ErrorNegocio('El gasto no es válido.');
    const g = validarGasto(req.body || {});
    const r = await db.query(
      `UPDATE proyeccion_gastos SET concepto=$1, categoria=$2, monto=$3, frecuencia=$4, mes_inicio=$5, mes_fin=$6, notas=$7
       WHERE id=$8 RETURNING ${SELECT_GASTO}`,
      [g.concepto, g.categoria, g.monto, g.frecuencia, g.inicio, g.fin, g.notas, id]
    );
    if (!r.rows[0]) throw new ErrorNegocio('Gasto no encontrado.', 404);
    res.json(r.rows[0]);
  } catch (err) { responderError(res, err, 'actualizarGasto', 'No se pudo actualizar el gasto.'); }
}

async function cambiarActivo(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ErrorNegocio('El gasto no es válido.');
    if (typeof (req.body || {}).activo !== 'boolean') throw new ErrorNegocio('Indica si el gasto se incluye o no en la simulación.');
    const r = await db.query(`UPDATE proyeccion_gastos SET activo=$1 WHERE id=$2 RETURNING ${SELECT_GASTO}`, [req.body.activo, id]);
    if (!r.rows[0]) throw new ErrorNegocio('Gasto no encontrado.', 404);
    res.json(r.rows[0]);
  } catch (err) { responderError(res, err, 'cambiarActivo', 'No se pudo cambiar el gasto.'); }
}

async function eliminarGasto(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ErrorNegocio('El gasto no es válido.');
    const r = await db.query('DELETE FROM proyeccion_gastos WHERE id=$1', [id]);
    if (!r.rowCount) throw new ErrorNegocio('Gasto no encontrado.', 404);
    res.json({ mensaje: 'Gasto eliminado.' });
  } catch (err) { responderError(res, err, 'eliminarGasto', 'No se pudo eliminar el gasto.'); }
}

// ¿El gasto cae en este mes? (mes = 'AAAA-MM'; los meses de inicio y fin vienen en el mismo formato)
function aplicaEnMes(g, mes) {
  if (g.frecuencia === 'unica') return g.mes_inicio === mes;
  return (!g.mes_inicio || g.mes_inicio <= mes) && (!g.mes_fin || mes <= g.mes_fin);
}

// ---------- cálculo ----------
async function calcular(meses) {
  // "Hoy" y el mes en curso se toman en hora de México (no en la del servidor, que suele ser UTC)
  const filas = await db.query(
    `WITH hoy AS (SELECT date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City'))::date AS mes_actual),
     meses AS (
       SELECT (h.mes_actual + (g.n * interval '1 month'))::date AS mes
       FROM hoy h, generate_series(0, $1::int - 1) AS g(n)
     ),
     base AS (
       SELECT c.id, z.nombre AS zona, p.nombre AS plan, p.precio,
              date_trunc('month', COALESCE(c.fecha_inicio_conteo, c.fecha_alta))::date AS desde
       FROM clientes c
       JOIN zonas z ON z.id = c.zona_id
       JOIN planes p ON p.id = c.plan_id
       WHERE c.estado = 'activo'
     )
     SELECT to_char(m.mes, 'YYYY-MM') AS mes, b.zona, b.plan,
            COUNT(b.id)::int AS clientes, COALESCE(SUM(b.precio), 0)::numeric(12,2) AS total,
            COUNT(b.id) FILTER (WHERE b.desde = m.mes)::int AS entran
     FROM meses m
     LEFT JOIN base b ON b.desde <= m.mes
     GROUP BY m.mes, b.zona, b.plan
     ORDER BY m.mes, b.zona, b.plan`,
    [meses]
  );

  const conteos = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE estado = 'activo')::int AS activos,
       COUNT(*) FILTER (WHERE estado = 'suspendido')::int AS suspendidos,
       COUNT(*) FILTER (WHERE estado = 'baja')::int AS bajas,
       COUNT(*) FILTER (WHERE estado = 'activo'
         AND date_trunc('month', COALESCE(fecha_inicio_conteo, fecha_alta)) >
             date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City')))::int AS mes_gratis
     FROM clientes`
  );
  // Si la migración 023 aún no se ha corrido, la proyección de INGRESOS sigue funcionando (sin gastos)
  let gastosRows = [], gastosDisponibles = true;
  try {
    gastosRows = (await db.query(`SELECT ${SELECT_GASTO} FROM proyeccion_gastos ORDER BY activo DESC, categoria, concepto, id`)).rows;
  } catch (err) {
    if (err.code !== '42P01') throw err;
    gastosDisponibles = false;
  }
  const gastosActivos = gastosRows.filter(g => g.activo);

  const porMes = new Map();
  const zonas = new Set(), planes = new Set();
  for (const f of filas.rows) {
    if (!porMes.has(f.mes)) porMes.set(f.mes, { mes: f.mes, etiqueta: etiquetaMes(f.mes), clientes: 0, total: 0, entran: 0, porZona: new Map(), porPlan: new Map() });
    const m = porMes.get(f.mes);
    if (!f.zona) continue; // mes sin clientes (LEFT JOIN vacío)
    zonas.add(f.zona); planes.add(f.plan);
    m.clientes += f.clientes; m.total += Number(f.total); m.entran += f.entran;
    const z = m.porZona.get(f.zona) || { zona: f.zona, clientes: 0, total: 0 };
    z.clientes += f.clientes; z.total += Number(f.total); m.porZona.set(f.zona, z);
    const p = m.porPlan.get(f.plan) || { plan: f.plan, clientes: 0, total: 0 };
    p.clientes += f.clientes; p.total += Number(f.total); m.porPlan.set(f.plan, p);
  }

  let acumulado = 0;
  const listaMeses = [...porMes.values()].map(m => {
    const ingreso = redondear(m.total);
    const porCat = {};
    let gastos = 0;
    for (const g of gastosActivos) {
      if (!aplicaEnMes(g, m.mes)) continue;
      porCat[g.categoria] = redondear((porCat[g.categoria] || 0) + g.monto);
      gastos += g.monto;
    }
    gastos = redondear(gastos);
    const balance = redondear(ingreso - gastos);
    acumulado = redondear(acumulado + balance);
    return {
      mes: m.mes, etiqueta: m.etiqueta, clientes: m.clientes, total: ingreso, entran: m.entran,
      por_zona: [...m.porZona.values()].map(x => ({ ...x, total: redondear(x.total) })),
      por_plan: [...m.porPlan.values()].map(x => ({ ...x, total: redondear(x.total) })),
      gastos, gastos_por_categoria: porCat, balance, balance_acumulado: acumulado,
      margen: ingreso > 0 ? Math.round((balance / ingreso) * 1000) / 10 : null
    };
  });

  const c = conteos.rows[0];
  const m0 = listaMeses[0];
  const ticket = m0 && m0.clientes ? m0.total / m0.clientes : 0;
  const necesarios = m0 && m0.gastos > 0 && ticket > 0 ? Math.ceil(m0.gastos / ticket - 1e-9) : 0;
  return {
    horizonte: meses,
    categorias: CATEGORIAS,
    zonas: [...zonas].sort((a, b) => a.localeCompare(b, 'es')),
    planes: [...planes].sort((a, b) => a.localeCompare(b, 'es')),
    gastos: gastosRows,
    gastos_disponibles: gastosDisponibles,
    resumen: {
      clientes_activos: c.activos,
      ingreso_mes_actual: m0 ? m0.total : 0,
      clientes_mes_actual: m0 ? m0.clientes : 0,
      ingreso_proyectado: redondear(listaMeses.reduce((a, m) => a + m.total, 0)),
      no_cuentan: { suspendidos: c.suspendidos, bajas: c.bajas, mes_gratis: c.mes_gratis },
      gasto_mes_actual: m0 ? m0.gastos : 0,
      balance_mes_actual: m0 ? m0.balance : 0,
      margen_mes_actual: m0 ? m0.margen : null,
      gasto_proyectado: redondear(listaMeses.reduce((a, m) => a + m.gastos, 0)),
      balance_proyectado: redondear(listaMeses.reduce((a, m) => a + m.balance, 0)),
      meses_en_negativo: listaMeses.filter(m => m.balance < 0).length,
      clientes_necesarios: necesarios,
      clientes_que_faltan: Math.max(0, necesarios - (m0 ? m0.clientes : 0))
    },
    meses: listaMeses
  };
}

async function proyeccion(req, res) {
  try {
    res.json(await calcular(leerMeses(req.query.meses)));
  } catch (err) { responderError(res, err, 'proyeccion', 'No se pudo calcular la proyección.'); }
}

// ---------- Excel ----------
function dar_formato_moneda(hoja, filaIni, filaFin, colIni, colFin) {
  for (let r = filaIni; r <= filaFin; r++) {
    for (let c = colIni; c <= colFin; c++) {
      const celda = hoja[XLSX.utils.encode_cell({ r, c })];
      if (celda && celda.t === 'n') celda.z = '"$"#,##0.00';
    }
  }
}

async function proyeccionExcel(req, res) {
  try {
    const d = await calcular(leerMeses(req.query.meses));
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
    const sumaIngresos = redondear(d.meses.reduce((a, m) => a + m.total, 0));

    // Hoja 1: ingresos mes por mes
    const filas1 = [['Mes', 'Clientes que pagan', 'Ingreso esperado', 'Cambio vs mes anterior', 'Clientes que empiezan a cobrar']];
    d.meses.forEach((m, i) => filas1.push([m.etiqueta, m.clientes, m.total, i === 0 ? '' : redondear(m.total - d.meses[i - 1].total), m.entran]));
    filas1.push(['TOTAL', '', sumaIngresos, '', '']);
    const h1 = XLSX.utils.aoa_to_sheet(filas1);
    h1['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 24 }, { wch: 30 }];
    dar_formato_moneda(h1, 1, filas1.length - 1, 2, 3);

    // Hojas por zona / por plan
    const pivot = (nombres, clave, campo) => {
      const filas = [['Mes', ...nombres, 'Total']];
      d.meses.forEach(m => {
        const mapa = new Map(m[campo].map(x => [x[clave], x.total]));
        filas.push([m.etiqueta, ...nombres.map(n => mapa.get(n) || 0), m.total]);
      });
      filas.push(['TOTAL', ...nombres.map((n, j) => redondear(filas.slice(1).reduce((a, f) => a + f[j + 1], 0))), sumaIngresos]);
      const h = XLSX.utils.aoa_to_sheet(filas);
      h['!cols'] = [{ wch: 22 }, ...nombres.map(() => ({ wch: 16 })), { wch: 16 }];
      dar_formato_moneda(h, 1, filas.length - 1, 1, nombres.length + 1);
      return h;
    };
    const h2 = pivot(d.zonas, 'zona', 'por_zona');
    const h3 = pivot(d.planes, 'plan', 'por_plan');

    // Hoja: ingresos vs gastos (balance)
    const catsUsadas = d.categorias.filter(c => d.meses.some(m => m.gastos_por_categoria[c]));
    const filas4 = [['Mes', 'Ingreso esperado', ...catsUsadas, 'Total gastos', 'Balance', 'Balance acumulado', 'Margen %']];
    d.meses.forEach(m => filas4.push([m.etiqueta, m.total, ...catsUsadas.map(c => m.gastos_por_categoria[c] || 0), m.gastos, m.balance, m.balance_acumulado, m.margen === null ? '' : m.margen]));
    filas4.push(['TOTAL', sumaIngresos, ...catsUsadas.map((c, j) => redondear(filas4.slice(1).reduce((a, f) => a + f[j + 2], 0))), d.resumen.gasto_proyectado, d.resumen.balance_proyectado, '', '']);
    const h4 = XLSX.utils.aoa_to_sheet(filas4);
    h4['!cols'] = [{ wch: 22 }, { wch: 18 }, ...catsUsadas.map(() => ({ wch: 18 })), { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 10 }];
    dar_formato_moneda(h4, 1, filas4.length - 1, 1, 4 + catsUsadas.length);

    // Hoja: los gastos capturados
    const filas5 = [['Concepto', 'Categoría', 'Monto', 'Frecuencia', 'Desde / mes', 'Hasta', 'Incluido en la simulación', 'Notas']];
    d.gastos.forEach(g => filas5.push([g.concepto, g.categoria, g.monto, g.frecuencia === 'mensual' ? 'Cada mes' : 'Una sola vez', g.mes_inicio ? etiquetaMes(g.mes_inicio) : (g.frecuencia === 'mensual' ? 'Desde ya' : ''), g.frecuencia === 'mensual' ? (g.mes_fin ? etiquetaMes(g.mes_fin) : 'Sin fin') : '', g.activo ? 'Sí' : 'No', g.notas || '']));
    if (!d.gastos.length) filas5.push(['(Aún no se captura ningún gasto)']);
    const h5 = XLSX.utils.aoa_to_sheet(filas5);
    h5['!cols'] = [{ wch: 34 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 24 }, { wch: 40 }];
    dar_formato_moneda(h5, 1, filas5.length - 1, 2, 2);

    const h6 = XLSX.utils.aoa_to_sheet([
      ['Cómo se calculó esta proyección'], [],
      [`Generada el ${hoy}, para los próximos ${d.horizonte} mes(es), incluido el mes en curso.`],
      ['INGRESOS: cada cliente ACTIVO suma el precio de su plan en cada mes en que le corresponde pagar.'],
      ['Los clientes suspendidos y los dados de baja NO se cuentan.'],
      ['Los clientes en mes gratis empiezan a contar cuando termina ese mes.'],
      ['Se supone que la cartera actual se mantiene igual: sin clientes nuevos ni bajas.'],
      ['No descuenta lo que ya se haya cobrado: es lo que DEBERÍA entrar.'],
      ['GASTOS: son los que se capturaron para simular (hoja "Gastos capturados"); no son egresos reales de Finanzas.'],
      ['Solo cuentan los gastos marcados como incluidos. Balance = ingreso esperado − gastos del mes.'],
      [], ['Clientes que hoy NO cuentan'],
      ['Suspendidos', d.resumen.no_cuentan.suspendidos], ['Dados de baja', d.resumen.no_cuentan.bajas], ['En mes gratis (empiezan después)', d.resumen.no_cuentan.mes_gratis]
    ]);
    h6['!cols'] = [{ wch: 100 }, { wch: 10 }];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, h1, 'Proyección');
    XLSX.utils.book_append_sheet(libro, h4, 'Ingresos vs gastos');
    XLSX.utils.book_append_sheet(libro, h5, 'Gastos capturados');
    XLSX.utils.book_append_sheet(libro, h2, 'Por zona');
    XLSX.utils.book_append_sheet(libro, h3, 'Por plan');
    XLSX.utils.book_append_sheet(libro, h6, 'Supuestos');

    const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="proyeccion_ingresos_${hoy}.xlsx"`);
    res.send(buffer);
  } catch (err) { responderError(res, err, 'proyeccionExcel', 'No se pudo generar el Excel.'); }
}

module.exports = { proyeccion, proyeccionExcel, listarGastos, crearGasto, actualizarGasto, cambiarActivo, eliminarGasto };
