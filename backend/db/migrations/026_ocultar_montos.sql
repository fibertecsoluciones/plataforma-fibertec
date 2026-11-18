-- Migración 026: interruptor "Ocultar montos" por usuario (solo tiene efecto en el rol cobranza).
-- Si está activo, ese usuario no ve ningún monto (tarifas, saldos, pagos) y al registrar un pago
-- no captura cantidad: el sistema cobra automáticamente lo que falta del mes elegido.
-- Es seguro correrla más de una vez.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ocultar_montos BOOLEAN NOT NULL DEFAULT FALSE;
