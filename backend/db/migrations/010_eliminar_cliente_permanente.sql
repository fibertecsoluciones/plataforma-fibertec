-- Migración 010: eliminación permanente de clientes
--
-- Hasta ahora, "eliminar" un cliente solo lo daba de baja (conservando todo). Ahora
-- se agrega una opción de borrado DEFINITIVO. Para que eso no truene por culpa de
-- las Actividades o Solicitudes que estén ligadas a ese cliente, se ajustan esas
-- relaciones para que, si el cliente se borra, simplemente se queden sin cliente
-- ligado (en vez de bloquear el borrado o borrarse ellas también).
--
-- Los pagos y las instalaciones de ese cliente SÍ se borran junto con él (ya estaban
-- configurados así desde el principio, con ON DELETE CASCADE).

ALTER TABLE actividades DROP CONSTRAINT IF EXISTS actividades_cliente_id_fkey;
ALTER TABLE actividades ADD CONSTRAINT actividades_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;

ALTER TABLE solicitudes_instalacion DROP CONSTRAINT IF EXISTS solicitudes_instalacion_cliente_generado_id_fkey;
ALTER TABLE solicitudes_instalacion ADD CONSTRAINT solicitudes_instalacion_cliente_generado_id_fkey
  FOREIGN KEY (cliente_generado_id) REFERENCES clientes(id) ON DELETE SET NULL;

ALTER TABLE inventario_movimientos DROP CONSTRAINT IF EXISTS inventario_movimientos_cliente_id_fkey;
ALTER TABLE inventario_movimientos ADD CONSTRAINT inventario_movimientos_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
