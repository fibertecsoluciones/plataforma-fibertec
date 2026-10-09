-- Migración 021: pagos a técnicos en partes (abonos)
--
-- Un pago agrupado tiene un TOTAL, pero ahora se puede ir liquidando en varias partes.
-- Cada parte (abono) crea su propio egreso en Finanzas, con su fecha y método.
-- Estados: 'pendiente' (nada pagado) · 'parcial' (algo pagado, falta saldo) · 'pagado' (liquidado).

-- 1) El estado ahora admite "parcial"
ALTER TABLE pagos_tecnicos DROP CONSTRAINT IF EXISTS pagos_tecnicos_fecha_si_pagado;
ALTER TABLE pagos_tecnicos DROP CONSTRAINT IF EXISTS pagos_tecnicos_estado_check;
ALTER TABLE pagos_tecnicos ADD CONSTRAINT pagos_tecnicos_estado_check CHECK (estado IN ('pendiente','parcial','pagado'));
-- fecha_pago solo existe cuando está liquidado (es la fecha del último abono)
ALTER TABLE pagos_tecnicos ADD CONSTRAINT pagos_tecnicos_fecha_si_pagado CHECK ((estado = 'pagado') = (fecha_pago IS NOT NULL));

-- 2) Cada parte pagada
CREATE TABLE IF NOT EXISTS pagos_tecnicos_abonos (
  id           SERIAL PRIMARY KEY,
  pago_id      INTEGER NOT NULL REFERENCES pagos_tecnicos(id) ON DELETE CASCADE,
  monto        NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  fecha        DATE NOT NULL,
  metodo_pago  VARCHAR(30) NOT NULL DEFAULT 'efectivo',
  notas        TEXT,
  egreso_id    INTEGER REFERENCES egresos(id) ON DELETE SET NULL,
  creado_por   INTEGER REFERENCES usuarios(id),
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pt_abonos_pago ON pagos_tecnicos_abonos(pago_id);
CREATE INDEX IF NOT EXISTS idx_pt_abonos_egreso ON pagos_tecnicos_abonos(egreso_id);

-- 3) Los pagos que ya estaban marcados como pagados (migración 020) pasan a tener UN abono por el total,
--    ligado al mismo egreso que ya existía en Finanzas. Es seguro correrla más de una vez.
INSERT INTO pagos_tecnicos_abonos (pago_id, monto, fecha, metodo_pago, egreso_id, creado_por, creado_en)
SELECT p.id, p.monto, p.fecha_pago, COALESCE(p.metodo_pago, 'efectivo'), p.egreso_id, p.creado_por, COALESCE(p.pagado_en, now())
FROM pagos_tecnicos p
WHERE p.estado = 'pagado'
  AND NOT EXISTS (SELECT 1 FROM pagos_tecnicos_abonos a WHERE a.pago_id = p.id);
