-- Migración 003: adeudo manual (meses de atraso previos a usar el sistema)
-- Segura de correr con datos existentes: agrega una columna con default 0
-- (no afecta a nadie hasta que la edites) y reemplaza la vista de estado de pago.

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS adeudo_manual_meses SMALLINT NOT NULL DEFAULT 0;

-- No se puede usar CREATE OR REPLACE aquí porque cambia el orden de las columnas
-- de la vista (Postgres solo permite agregar columnas al final con REPLACE).
-- Borrar y recrear la vista es seguro: las vistas no guardan datos, solo la consulta.
DROP VIEW IF EXISTS vw_estado_pago;

CREATE VIEW vw_estado_pago AS
SELECT
  c.id                  AS cliente_id_pk,
  c.cliente_id,
  c.nombre,
  c.telefono,
  c.ip,
  c.estado              AS estado_cliente,
  z.nombre              AS zona,
  p.nombre              AS plan,
  p.precio,
  c.dia_pago,
  c.dias_tolerancia,
  c.adeudo_manual_meses,
  date_trunc('month', CURRENT_DATE)::date                                   AS periodo_actual,
  fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE)                            AS fecha_vencimiento,
  fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) + c.dias_tolerancia        AS fecha_limite_tolerancia,
  EXISTS (
    SELECT 1 FROM pagos pg
    WHERE pg.cliente_id = c.id
      AND pg.periodo = date_trunc('month', CURRENT_DATE)::date
  ) AS pagado_mes_actual,
  (fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) - CURRENT_DATE)           AS dias_para_vencer,
  (CURRENT_DATE - (fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) + c.dias_tolerancia)) AS dias_vencido,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pagos pg
      WHERE pg.cliente_id = c.id
        AND pg.periodo = date_trunc('month', CURRENT_DATE)::date
    ) THEN 'verde'
    WHEN CURRENT_DATE > (fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) + c.dias_tolerancia) THEN 'rojo'
    WHEN CURRENT_DATE > fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) THEN 'naranja'
    WHEN CURRENT_DATE >= (fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) - 3) THEN 'amarillo'
    ELSE 'verde'
  END AS semaforo,
  (fn_meses_adeudados(c.id, c.fecha_alta, c.dia_pago, c.dias_tolerancia) + c.adeudo_manual_meses) AS meses_adeudados,
  ((fn_meses_adeudados(c.id, c.fecha_alta, c.dia_pago, c.dias_tolerancia) + c.adeudo_manual_meses) * p.precio)::numeric(10,2) AS saldo_pendiente
FROM clientes c
JOIN zonas z   ON z.id = c.zona_id
JOIN planes p  ON p.id = c.plan_id
WHERE c.estado <> 'baja';
