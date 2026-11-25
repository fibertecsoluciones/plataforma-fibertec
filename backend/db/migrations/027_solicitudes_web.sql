-- Migración 027: solicitudes que llegan desde la página web pública.
-- origen: 'campo' (capturada por técnico/admin) o 'web' (formularios de la página).
-- email: correo opcional que deja la persona en el formulario.
-- Es seguro correrla más de una vez.

ALTER TABLE solicitudes_instalacion ADD COLUMN IF NOT EXISTS origen VARCHAR(10) NOT NULL DEFAULT 'campo';
ALTER TABLE solicitudes_instalacion ADD COLUMN IF NOT EXISTS email VARCHAR(150);
