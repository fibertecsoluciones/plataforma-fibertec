-- Migración 024: Cuentas por pagar
--
-- Facturas / deudas con proveedores, capturadas a mano, con fecha de vencimiento.
-- Mientras están por pagar NO afectan Finanzas. Cada pago (completo o en partes) crea su
-- propio egreso en Finanzas. Estados guardados: pendiente · parcial · pagada
-- ("vencida" no se guarda: se calcula comparando la fecha de vencimiento con hoy).
-- Es seguro correrla más de una vez.

CREATE TABLE IF NOT EXISTS cuentas_por_pagar (
  id                 SERIAL PRIMARY KEY,
  proveedor          VARCHAR(120) NOT NULL,
  concepto           VARCHAR(150) NOT NULL,
  categoria_id       INTEGER REFERENCES egresos_categorias(id) ON DELETE SET NULL,
  monto              NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  fecha_vencimiento  DATE NOT NULL,
  notas              TEXT,
  estado             VARCHAR(10) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','parcial','pagada')),
  fecha_pago         DATE,
  creado_por         INTEGER REFERENCES usuarios(id),
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cuentas_por_pagar_fecha_si_pagada CHECK ((estado = 'pagada') = (fecha_pago IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS cuentas_por_pagar_abonos (
  id           SERIAL PRIMARY KEY,
  cuenta_id    INTEGER NOT NULL REFERENCES cuentas_por_pagar(id) ON DELETE CASCADE,
  monto        NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  fecha        DATE NOT NULL,
  metodo_pago  VARCHAR(30) NOT NULL DEFAULT 'efectivo',
  notas        TEXT,
  egreso_id    INTEGER REFERENCES egresos(id) ON DELETE SET NULL,
  creado_por   INTEGER REFERENCES usuarios(id),
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cxp_estado ON cuentas_por_pagar(estado);
CREATE INDEX IF NOT EXISTS idx_cxp_vence ON cuentas_por_pagar(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_cxp_abonos_cuenta ON cuentas_por_pagar_abonos(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_cxp_abonos_egreso ON cuentas_por_pagar_abonos(egreso_id);

INSERT INTO egresos_categorias (nombre) VALUES ('Cuentas por pagar') ON CONFLICT (nombre) DO NOTHING;
