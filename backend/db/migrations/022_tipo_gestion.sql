-- Migración 022: nueva categoría de actividad "Gestión"
-- Reemplaza la restricción de la columna "tipo" para aceptar el valor 'gestion'.
-- Es segura de correr más de una vez.

ALTER TABLE actividades DROP CONSTRAINT IF EXISTS actividades_tipo_check;
ALTER TABLE actividades ADD CONSTRAINT actividades_tipo_check
  CHECK (tipo IN ('instalacion','mantenimiento','falla','libranza','gestion'));
