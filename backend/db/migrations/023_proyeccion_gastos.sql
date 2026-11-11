-- Migración 023: gastos planeados para la simulación de la Proyección de ingresos
--
-- El administrador captura aquí los gastos que PLANEA tener (servicio de internet, gasolina, módems…) para
-- ver cómo se comportarían contra el ingreso esperado. NO son egresos reales: no afectan Finanzas.
--   · frecuencia 'mensual': se repite cada mes entre mes_inicio y mes_fin (ambos opcionales)
--   · frecuencia 'unica'  : ocurre una sola vez en mes_inicio (obligatorio)
-- Los meses se guardan como el día 1 del mes.

CREATE TABLE IF NOT EXISTS proyeccion_gastos (
  id          SERIAL PRIMARY KEY,
  concepto    VARCHAR(120) NOT NULL,
  categoria   VARCHAR(30)  NOT NULL CHECK (categoria IN ('Servicio de internet','Gastos operativos','Gasolina','Refacciones','Módems','Otro')),
  monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  frecuencia  VARCHAR(10)  NOT NULL CHECK (frecuencia IN ('mensual','unica')),
  mes_inicio  DATE,
  mes_fin     DATE,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  notas       TEXT,
  creado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proyeccion_gastos_unica_con_mes CHECK (frecuencia <> 'unica' OR (mes_inicio IS NOT NULL AND mes_fin IS NULL)),
  CONSTRAINT proyeccion_gastos_rango CHECK (mes_fin IS NULL OR mes_inicio IS NULL OR mes_fin >= mes_inicio),
  CONSTRAINT proyeccion_gastos_dia_uno CHECK ((mes_inicio IS NULL OR EXTRACT(day FROM mes_inicio) = 1) AND (mes_fin IS NULL OR EXTRACT(day FROM mes_fin) = 1))
);
CREATE INDEX IF NOT EXISTS idx_proyeccion_gastos_activo ON proyeccion_gastos(activo);
