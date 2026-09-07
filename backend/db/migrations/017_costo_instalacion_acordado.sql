-- Migración 017: costo de instalación acordado por cliente
--
-- A diferencia del intento anterior (costo sugerido por plan), aquí el admin le pone
-- a CADA cliente el monto que acordó con él, libremente. Los abonos que vaya dando el
-- cliente se registran como siempre en "ingresos_extra" (categoría Instalación), y el
-- saldo pendiente se calcula solo: costo_instalacion_acordado - suma de esos abonos.

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS costo_instalacion_acordado NUMERIC(10,2);
