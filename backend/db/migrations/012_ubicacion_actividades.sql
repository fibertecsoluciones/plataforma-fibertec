-- Migración 012: ubicación (estimada por oficina / confirmada en sitio) en Actividades
--
-- Cuando un cliente contacta directo a oficina, alguien de oficina puede marcar una
-- ubicación aproximada (pegando un link de Google Maps o las coordenadas) para que el
-- técnico sepa hacia dónde ir. Cuando el técnico complete la instalación real, su GPS
-- capturado en sitio reemplaza automáticamente esa ubicación estimada por la real.

ALTER TABLE actividades ADD COLUMN IF NOT EXISTS latitud NUMERIC(10,7);
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS longitud NUMERIC(10,7);
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS ubicacion_confirmada BOOLEAN NOT NULL DEFAULT FALSE;
