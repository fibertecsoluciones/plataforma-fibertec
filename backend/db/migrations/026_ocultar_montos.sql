-- Migración 026: interruptor "Ocultar montos" por usuario (solo tiene efecto en el rol cobranza).
-- Si está activo, ese usuario no ve tarifas, saldos ni montos del historial. Al registrar un pago
-- sí escribe lo que recibió, pero solo un mes por pago.
-- Es seguro correrla más de una vez.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ocultar_montos BOOLEAN NOT NULL DEFAULT FALSE;
