-- Migración 013: notas del técnico en actividades
-- Campo de texto libre donde el técnico (o el admin) puede escribir observaciones
-- sobre cómo salió la actividad (ej. "no había línea, se instaló fibra directa").

ALTER TABLE actividades ADD COLUMN IF NOT EXISTS notas_tecnico TEXT;
