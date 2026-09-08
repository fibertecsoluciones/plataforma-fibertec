-- Migración 019: categoría (tipo) de actividad

ALTER TABLE actividades ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'instalacion'
  CHECK (tipo IN ('instalacion','mantenimiento','falla','libranza'));

CREATE INDEX IF NOT EXISTS idx_actividades_tipo ON actividades(tipo);
