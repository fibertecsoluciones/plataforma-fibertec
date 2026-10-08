-- Migración 020: pagos a técnicos por actividades
--
-- El administrador junta varias actividades terminadas de un técnico, le pone un monto
-- a su criterio y lo deja como pago PENDIENTE (no afecta Finanzas). Solo cuando lo marca
-- como PAGADO se crea el egreso correspondiente en Finanzas. Se puede deshacer.
--
-- Se usan tablas aparte (en vez de columnas en "actividades") para que nada de esto
-- viaje en los datos de actividades que consultan los técnicos.

CREATE TABLE IF NOT EXISTS pagos_tecnicos (
  id           SERIAL PRIMARY KEY,
  tecnico_id   INTEGER NOT NULL REFERENCES usuarios(id),
  monto        NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  notas        TEXT,
  estado       VARCHAR(10) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagado')),
  fecha_pago   DATE,
  metodo_pago  VARCHAR(30),
  egreso_id    INTEGER REFERENCES egresos(id) ON DELETE SET NULL,
  creado_por   INTEGER REFERENCES usuarios(id),
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  pagado_en    TIMESTAMPTZ,
  CONSTRAINT pagos_tecnicos_fecha_si_pagado CHECK ((estado = 'pagado') = (fecha_pago IS NOT NULL))
);

-- Qué actividades incluye cada pago. UNIQUE en actividad_id: una actividad solo puede estar en un pago.
CREATE TABLE IF NOT EXISTS pagos_tecnicos_actividades (
  pago_id       INTEGER NOT NULL REFERENCES pagos_tecnicos(id) ON DELETE CASCADE,
  actividad_id  INTEGER NOT NULL UNIQUE REFERENCES actividades(id) ON DELETE CASCADE,
  PRIMARY KEY (pago_id, actividad_id)
);

-- Actividades que el administrador decidió dejar fuera del control de pagos
-- (un favor, algo que ya se pagó antes del sistema, etc.).
CREATE TABLE IF NOT EXISTS actividades_sin_pago (
  actividad_id  INTEGER PRIMARY KEY REFERENCES actividades(id) ON DELETE CASCADE,
  marcado_por   INTEGER REFERENCES usuarios(id),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_tecnicos_estado ON pagos_tecnicos(estado);
CREATE INDEX IF NOT EXISTS idx_pagos_tecnicos_tecnico ON pagos_tecnicos(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_pagos_tecnicos_egreso ON pagos_tecnicos(egreso_id);

-- Categoría de Finanzas donde caerán estos pagos al marcarlos como pagados
INSERT INTO egresos_categorias (nombre) VALUES ('Pago a técnicos') ON CONFLICT (nombre) DO NOTHING;
