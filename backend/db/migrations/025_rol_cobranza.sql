-- Migración 025: rol "cobranza" (solo puede ver y registrar pagos) con restricción opcional por zona.
--   · usuarios.rol ahora acepta 'admin' | 'tecnico' | 'cobranza'
--   · usuarios.zona_id: si un usuario de cobranza tiene zona, SOLO ve los clientes de esa zona.
--     Sin zona (NULL) ve los clientes de todas las zonas.
-- Es seguro correrla más de una vez.

DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'usuarios'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%rol%'
  LOOP
    EXECUTE format('ALTER TABLE usuarios DROP CONSTRAINT %I', c);
  END LOOP;
  ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin','tecnico','cobranza'));
END $$;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS zona_id INTEGER REFERENCES zonas(id);
