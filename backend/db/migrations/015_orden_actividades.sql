-- Migración 015: orden manual de actividades (arrastrar para reordenar)

ALTER TABLE actividades ADD COLUMN IF NOT EXISTS orden INTEGER;

-- A las actividades que ya existen les asigna un orden inicial según cuándo se crearon,
-- para que no se queden todas "sin orden" (NULL) y aparezcan revueltas.
UPDATE actividades SET orden = sub.rn
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY creado_en ASC) AS rn FROM actividades) sub
WHERE actividades.id = sub.id AND actividades.orden IS NULL;
