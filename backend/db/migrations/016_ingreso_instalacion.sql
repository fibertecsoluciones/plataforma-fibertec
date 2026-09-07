-- Migración 016: ingreso por instalación (cobro único, distinto de la mensualidad)
--
-- Cada plan puede tener un costo de instalación por defecto. Cuando un técnico
-- registra una instalación y captura ese cobro, se genera automáticamente un
-- registro de "ingreso extra" (separado de las mensualidades) para que Finanzas
-- lo cuente correctamente. También sirve para otros cobros únicos futuros
-- (reconexión, venta de equipo, etc.), capturables a mano desde Finanzas.

ALTER TABLE planes ADD COLUMN IF NOT EXISTS costo_instalacion NUMERIC(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ingresos_categorias (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ingresos_extra (
  id              SERIAL PRIMARY KEY,
  categoria_id    INTEGER REFERENCES ingresos_categorias(id),
  concepto        VARCHAR(150) NOT NULL,
  monto           NUMERIC(10,2) NOT NULL,
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  cliente_id      INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  comprobante_url TEXT,
  registrado_por  INTEGER REFERENCES usuarios(id),
  notas           TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingresos_extra_fecha ON ingresos_extra(fecha);

INSERT INTO ingresos_categorias (nombre) VALUES
  ('Instalación'), ('Reconexión'), ('Venta de equipo'), ('Otro')
ON CONFLICT (nombre) DO NOTHING;
