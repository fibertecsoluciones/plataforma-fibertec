-- Migración 014: quitar el límite de 200 caracteres a los puntos del checklist
-- (algunas descripciones de pasos son más largas de lo que anticipé).

ALTER TABLE actividad_puntos ALTER COLUMN descripcion TYPE TEXT;
