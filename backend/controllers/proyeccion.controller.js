const db = require('../config/db');
const XLSX = require('xlsx');

// ==========================================================
// PROYECCIÓN DE INGRESOS POR MENSUALIDADES
//
// Cuánto se espera cobrar cada mes con base en la cartera de clientes y el precio de su plan.
// Reglas:
//  · Cuentan los clientes ACTIVOS. Los suspendidos (congelados) y los dados de baja NO cuentan.
//  · Un cliente cuenta desde el mes en que empieza a cobrársele (fecha_inicio_conteo). Quien está en
//    "mes gratis" empieza a contar cuando ese mes termina.
//  · La proyección supone que la cartera actual se mantiene: sin clientes nuevos ni bajas.
//  · No incluye egresos ni lo que ya se haya cobrado: es lo que DEBERÍA entrar cada mes.
// ==========================================================

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const redondear = (n) => Math.round(Number(n || 0) * 100) / 100;
const etiquetaMes = (clave) => { const [a, m] = clave.split('-'); return `${MESES[Number(m) - 1]} de ${a}`; };

function leerMeses(valor) {
  if (valor === undefined || valor === '') return 12;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > 24) {
    const err = new Error('El número de meses debe estar entre 1 y 24.'); err.status = 400; throw err;
  }
  return n;
}

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

  const listaMeses = [...porMes.values()].map(m => ({
    mes: m.mes, etiqueta: m.etiqueta, clientes: m.clientes, total: redondear(m.total), entran: m.entran,
    por_zona: [...m.porZona.values()].map(x => ({ ...x, total: redondear(x.total) })),
    por_plan: [...m.porPlan.values()].map(x => ({ ...x, total: redondear(x.total) }))
  }));

  const c = conteos.rows[0];
  return {
    horizonte: meses,
    zonas: [...zonas].sort((a, b) => a.localeCompare(b, 'es')),
    planes: [...planes].sort((a, b) => a.localeCompare(b, 'es')),
    resumen: {
      clientes_activos: c.activos,
      ingreso_mes_actual: listaMeses[0] ? listaMeses[0].total : 0,
      clientes_mes_actual: listaMeses[0] ? listaMeses[0].clientes : 0,
      ingreso_proyectado: redondear(listaMeses.reduce((a, m) => a + m.total, 0)),
      no_cuentan: { suspendidos: c.suspendidos, bajas: c.bajas, mes_gratis: c.mes_gratis }
    },
    meses: listaMeses
  };
}

async function proyeccion(req, res) {
  try {
    res.json(await calcular(leerMeses(req.query.meses)));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Error en proyeccion:', err);
    res.status(500).json({ error: 'No se pudo calcular la proyección.' });
  }
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

    // Hoja 1: resumen mes por mes
    const filas1 = [['Mes', 'Clientes que pagan', 'Ingreso esperado', 'Cambio vs mes anterior', 'Clientes que empiezan a cobrar']];
    d.meses.forEach((m, i) => filas1.push([m.etiqueta, m.clientes, m.total, i === 0 ? '' : redondear(m.total - d.meses[i - 1].total), m.entran]));
    filas1.push(['TOTAL', '', redondear(d.meses.reduce((a, m) => a + m.total, 0)), '', '']);
    const h1 = XLSX.utils.aoa_to_sheet(filas1);
    h1['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 24 }, { wch: 30 }];
    dar_formato_moneda(h1, 1, filas1.length - 1, 2, 3);

    // Hojas 2 y 3: por zona / por plan (meses en filas, categorías en columnas)
    const pivot = (nombres, clave, campo) => {
      const filas = [['Mes', ...nombres, 'Total']];
      d.meses.forEach(m => {
        const mapa = new Map(m[campo].map(x => [x[clave], x.total]));
        filas.push([m.etiqueta, ...nombres.map(n => mapa.get(n) || 0), m.total]);
      });
      filas.push(['TOTAL', ...nombres.map((n, j) => redondear(filas.slice(1).reduce((a, f) => a + f[j + 1], 0))), redondear(d.meses.reduce((a, m) => a + m.total, 0))]);
      const h = XLSX.utils.aoa_to_sheet(filas);
      h['!cols'] = [{ wch: 22 }, ...nombres.map(() => ({ wch: 16 })), { wch: 16 }];
      dar_formato_moneda(h, 1, filas.length - 1, 1, nombres.length + 1);
      return h;
    };
    const h2 = pivot(d.zonas, 'zona', 'por_zona');
    const h3 = pivot(d.planes, 'plan', 'por_plan');

    const h4 = XLSX.utils.aoa_to_sheet([
      ['Cómo se calculó esta proyección'], [],
      [`Generada el ${hoy}, para los próximos ${d.horizonte} mes(es), incluido el mes en curso.`],
      ['Cada cliente ACTIVO suma el precio de su plan en cada mes en que le corresponde pagar.'],
      ['Los clientes suspendidos y los dados de baja NO se cuentan.'],
      ['Los clientes en mes gratis empiezan a contar cuando termina ese mes.'],
      ['Se supone que la cartera actual se mantiene igual: sin clientes nuevos ni bajas.'],
      ['No incluye egresos ni descuenta lo que ya se haya cobrado.'],
      [], ['Clientes que hoy NO cuentan'],
      ['Suspendidos', d.resumen.no_cuentan.suspendidos], ['Dados de baja', d.resumen.no_cuentan.bajas], ['En mes gratis (empiezan después)', d.resumen.no_cuentan.mes_gratis]
    ]);
    h4['!cols'] = [{ wch: 90 }, { wch: 10 }];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, h1, 'Proyección');
    XLSX.utils.book_append_sheet(libro, h2, 'Por zona');
    XLSX.utils.book_append_sheet(libro, h3, 'Por plan');
    XLSX.utils.book_append_sheet(libro, h4, 'Supuestos');

    const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="proyeccion_ingresos_${hoy}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Error en proyeccionExcel:', err);
    res.status(500).json({ error: 'No se pudo generar el Excel.' });
  }
}

module.exports = { proyeccion, proyeccionExcel };
