-- Migración 008: módulo de actividades (tareas asignadas a técnicos)
--
-- El admin crea actividades y las asigna a un técnico, con una lista opcional de
-- "puntos" (checklist). El técnico va marcando cada punto conforme lo completa, y
-- el estado general de la actividad se recalcula solo según ese avance.

CREATE TABLE actividades (
  id              SERIAL PRIMARY KEY,
  titulo          VARCHAR(150) NOT NULL,
  descripcion     TEXT,
  tecnico_id      INTEGER NOT NULL REFERENCES usuarios(id),
  cliente_id      INTEGER REFERENCES clientes(id), -- opcional: si la actividad es sobre un cliente en particular
  prioridad       VARCHAR(10) NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta')),
  estado          VARCHAR(15) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_proceso','completada')),
  fecha_limite    DATE,
  creado_por      INTEGER REFERENCES usuarios(id),
  completado_en   TIMESTAMPTZ,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_actividades_tecnico ON actividades(tecnico_id);
CREATE INDEX idx_actividades_estado ON actividades(estado);

-- Puntos/pasos dentro de una actividad (el checklist). Si una actividad no tiene
-- ningún punto, es una tarea simple que se marca completa de un clic.
CREATE TABLE actividad_puntos (
  id              SERIAL PRIMARY KEY,
  actividad_id    INTEGER NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  descripcion     VARCHAR(200) NOT NULL,
  orden           SMALLINT NOT NULL DEFAULT 0,
  completado      BOOLEAN NOT NULL DEFAULT FALSE,
  completado_en   TIMESTAMPTZ,
  completado_por  INTEGER REFERENCES usuarios(id)
);

CREATE INDEX idx_actividad_puntos_actividad ON actividad_puntos(actividad_id);

-- Recalcula el estado de la actividad cada vez que se marca/desmarca un punto:
-- ningún punto marcado -> pendiente, algunos -> en_proceso, todos -> completada.
-- Si la actividad no tiene puntos, esta función no la toca (se marca a mano).
CREATE OR REPLACE FUNCTION fn_recalcular_estado_actividad()
RETURNS TRIGGER AS $$
DECLARE
  v_actividad_id INT;
  v_total INT;
  v_completados INT;
BEGIN
  v_actividad_id := COALESCE(NEW.actividad_id, OLD.actividad_id);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE completado)
  INTO v_total, v_completados
  FROM actividad_puntos WHERE actividad_id = v_actividad_id;

  IF v_total > 0 THEN
    UPDATE actividades SET
      estado = CASE
        WHEN v_completados = v_total THEN 'completada'
        WHEN v_completados > 0 THEN 'en_proceso'
        ELSE 'pendiente'
      END,
      completado_en = CASE WHEN v_completados = v_total THEN now() ELSE NULL END
    WHERE id = v_actividad_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalcular_estado_actividad
AFTER INSERT OR UPDATE OF completado OR DELETE ON actividad_puntos
FOR EACH ROW EXECUTE FUNCTION fn_recalcular_estado_actividad();
