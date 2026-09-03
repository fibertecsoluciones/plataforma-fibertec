-- Migración 005: fecha de inicio de conteo editable
--
-- Hasta ahora el conteo automático de meses adeudados siempre empezaba en la fecha
-- de alta del cliente. El problema: si ya tenías pagos (incluso parciales) de ANTES
-- de esa fecha, el sistema los ignoraba por completo, y el campo "adeudo manual"
-- (que solo suma meses completos a precio de lista) no sabía que ya se había
-- abonado una parte. Con esto, puedes decirle al sistema desde qué fecha empezar a
-- contar automáticamente — y si ahí atrás ya hay pagos/abonos registrados, los toma
-- en cuenta correctamente en vez de duplicarlos con el conteo manual.

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_inicio_conteo DATE;
UPDATE clientes SET fecha_inicio_conteo = fecha_alta WHERE fecha_inicio_conteo IS NULL;
ALTER TABLE clientes ALTER COLUMN fecha_inicio_conteo SET DEFAULT CURRENT_DATE;

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
  c.adeudo_manual_detalle,
  c.fecha_inicio_conteo,
  date_trunc('month', CURRENT_DATE)::date                                   AS periodo_actual,
  fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE)                            AS fecha_vencimiento,
  fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) + c.dias_tolerancia        AS fecha_limite_tolerancia,
  COALESCE(pm.pagado, 0)                                                    AS pagado_mes_actual_monto,
  (COALESCE(pm.pagado, 0) >= p.precio)                                      AS pagado_mes_actual,
  (COALESCE(pm.pagado, 0) > 0 AND COALESCE(pm.pagado, 0) < p.precio)        AS pago_parcial_mes_actual,
  GREATEST(p.precio - COALESCE(pm.pagado, 0), 0)                           AS saldo_mes_actual,
  (fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) - CURRENT_DATE)           AS dias_para_vencer,
  (CURRENT_DATE - (fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) + c.dias_tolerancia)) AS dias_vencido,
  CASE
    WHEN COALESCE(pm.pagado, 0) >= p.precio THEN 'verde'
    WHEN CURRENT_DATE > (fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) + c.dias_tolerancia) THEN 'rojo'
    WHEN CURRENT_DATE > fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) THEN 'naranja'
    WHEN CURRENT_DATE >= (fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) - 3) THEN 'amarillo'
    ELSE 'verde'
  END AS semaforo,
  fn_meses_adeudados(c.id, c.fecha_inicio_conteo, c.dia_pago, c.dias_tolerancia, p.precio) + c.adeudo_manual_meses AS meses_adeudados,
  (fn_saldo_pendiente_automatico(c.id, c.fecha_inicio_conteo, c.dia_pago, c.dias_tolerancia, p.precio)
    + (c.adeudo_manual_meses * p.precio))::numeric(10,2)                   AS saldo_pendiente
FROM clientes c
JOIN zonas z   ON z.id = c.zona_id
JOIN planes p  ON p.id = c.plan_id
LEFT JOIN LATERAL (
  SELECT SUM(monto) AS pagado FROM pagos pg
  WHERE pg.cliente_id = c.id AND pg.periodo = date_trunc('month', CURRENT_DATE)::date
) pm ON true
WHERE c.estado <> 'baja';
