-- Migración 018: el semáforo debe respetar el mes gratis
--
-- El conteo automático de "meses adeudados" ya respetaba correctamente el mes gratis
-- (fecha_inicio_conteo), pero el semáforo (🟢🟡🟠🔴) que se ve en Clientes y el
-- Dashboard NO lo respetaba — evaluaba el día de pago del mes en curso sin fijarse
-- si ese cliente todavía estaba dentro de su mes de regalo. Esto podía mostrar a un
-- cliente recién instalado como "vencido" en su primer mes, aunque ese mes fuera gratis.

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
  c.fecha_suspension,
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
    -- Todavía dentro de su mes gratis: siempre verde, no importa el día de pago.
    WHEN date_trunc('month', CURRENT_DATE) < date_trunc('month', c.fecha_inicio_conteo) THEN 'verde'
    WHEN COALESCE(pm.pagado, 0) >= p.precio THEN 'verde'
    WHEN CURRENT_DATE > (fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) + c.dias_tolerancia) THEN 'rojo'
    WHEN CURRENT_DATE > fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) THEN 'naranja'
    WHEN CURRENT_DATE >= (fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) - 3) THEN 'amarillo'
    ELSE 'verde'
  END AS semaforo,
  fn_meses_adeudados(c.id, c.fecha_inicio_conteo, c.dia_pago, c.dias_tolerancia, p.precio,
    CASE WHEN c.estado = 'suspendido' AND c.fecha_suspension IS NOT NULL
         THEN LEAST(c.fecha_suspension, CURRENT_DATE) ELSE CURRENT_DATE END
  ) + c.adeudo_manual_meses AS meses_adeudados,
  (fn_saldo_pendiente_automatico(c.id, c.fecha_inicio_conteo, c.dia_pago, c.dias_tolerancia, p.precio,
    CASE WHEN c.estado = 'suspendido' AND c.fecha_suspension IS NOT NULL
         THEN LEAST(c.fecha_suspension, CURRENT_DATE) ELSE CURRENT_DATE END
  ) + (c.adeudo_manual_meses * p.precio))::numeric(10,2) AS saldo_pendiente,
  c.notas AS notas
FROM clientes c
JOIN zonas z   ON z.id = c.zona_id
JOIN planes p  ON p.id = c.plan_id
LEFT JOIN LATERAL (
  SELECT SUM(monto) AS pagado FROM pagos pg
  WHERE pg.cliente_id = c.id AND pg.periodo = date_trunc('month', CURRENT_DATE)::date
) pm ON true;
