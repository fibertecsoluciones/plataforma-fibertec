-- Migración 009: solicitudes de instalación (leads capturados en campo)
--
-- Cuando un técnico en ruta se encuentra a un posible cliente nuevo, puede capturar
-- aquí lo mínimo que le dieron (nombre, teléfono, zona aproximada) sin necesidad de
-- todos los datos que pide un Cliente completo (esos se completan después, al
-- "convertir" la solicitud en cliente formal).

CREATE TABLE solicitudes_instalacion (
  id                SERIAL PRIMARY KEY,
  nombre            VARCHAR(150) NOT NULL,
  telefono          VARCHAR(20),
  telefono_alt      VARCHAR(20),
  direccion         TEXT,
  zona_id           INTEGER REFERENCES zonas(id),        -- opcional: el técnico puede no estar seguro
  plan_interes_id   INTEGER REFERENCES planes(id),        -- opcional: plan que le interesa
  notas             TEXT,
  estado            VARCHAR(20) NOT NULL DEFAULT 'nueva'
                       CHECK (estado IN ('nueva','contactada','agendada','convertida','descartada')),
  capturado_por     INTEGER REFERENCES usuarios(id),       -- técnico (o admin) que la capturó
  cliente_generado_id INTEGER REFERENCES clientes(id),     -- se llena al convertirla en cliente
  latitud           NUMERIC(10,7),
  longitud          NUMERIC(10,7),
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_solicitudes_estado ON solicitudes_instalacion(estado);

CREATE OR REPLACE FUNCTION fn_touch_solicitud()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_solicitudes_touch
BEFORE UPDATE ON solicitudes_instalacion
FOR EACH ROW EXECUTE FUNCTION fn_touch_solicitud();
