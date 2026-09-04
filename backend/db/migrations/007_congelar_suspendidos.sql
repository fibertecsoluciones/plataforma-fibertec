-- Migración 007: congelar el adeudo automático mientras un cliente está suspendido
--
-- Cuando un cliente pasa a estado "suspendido", se guarda la fecha exacta en que
-- ocurrió eso (fecha_suspension). El conteo automático de meses adeudados y saldo
-- pendiente deja de avanzar a partir de ahí -- se queda "congelado" con lo que ya
-- debía hasta el momento de la suspensión. En cuanto se reactiva (vuelve a "activo"),
-- el conteo se reanuda normal desde la fecha de hoy.

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_suspension DATE;

-- Las funciones ahora reciben una "fecha efectiva" en vez de usar siempre CURRENT_DATE:
-- si el cliente está activo, la fecha efectiva es hoy (mismo comportamiento de antes);
-- si está suspendido, la fecha efectiva es la fecha en que quedó suspendido.
DROP VIEW IF EXISTS vw_estado_pago;
DROP FUNCTION IF EXISTS fn_meses_adeudados(INT, DATE, SMALLINT, SMALLINT, NUMERIC);
DROP FUNCTION IF EXISTS fn_saldo_pendiente_automatico(INT, DATE, SMALLINT, SMALLINT, NUMERIC);

CREATE OR REPLACE FUNCTION fn_meses_adeudados(
  p_cliente_id INT, p_fecha_inicio DATE, p_dia_pago SMALLINT, p_tolerancia SMALLINT,
  p_precio NUMERIC, p_fecha_efectiva DATE
) RETURNS INT AS $$
DECLARE
  v_periodo DATE := date_trunc('month', p_fecha_inicio)::date;
  v_actual  DATE := date_trunc('month', p_fecha_efectiva)::date;
  v_meses   INT := 0;
  v_pagado  NUMERIC;
BEGIN
  WHILE v_periodo <= v_actual LOOP
    SELECT COALESCE(SUM(monto), 0) INTO v_pagado FROM pagos WHERE cliente_id = p_cliente_id AND periodo = v_periodo;
    IF v_periodo < v_actual THEN
      IF v_pagado < p_precio THEN v_meses := v_meses + 1; END IF;
    ELSE
      IF v_pagado < p_precio AND p_fecha_efectiva > (fn_fecha_vencimiento(p_dia_pago, v_periodo) + p_tolerancia) THEN
        v_meses := v_meses + 1;
      END IF;
    END IF;
    v_periodo := v_periodo + INTERVAL '1 month';
  END LOOP;
  RETURN v_meses;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_saldo_pendiente_automatico(
  p_cliente_id INT, p_fecha_inicio DATE, p_dia_pago SMALLINT, p_tolerancia SMALLINT,
  p_precio NUMERIC, p_fecha_efectiva DATE
) RETURNS NUMERIC AS $$
DECLARE
  v_periodo DATE := date_trunc('month', p_fecha_inicio)::date;
  v_actual  DATE := date_trunc('month', p_fecha_efectiva)::date;
  v_saldo   NUMERIC := 0;
  v_pagado  NUMERIC;
BEGIN
  WHILE v_periodo <= v_actual LOOP
    SELECT COALESCE(SUM(monto), 0) INTO v_pagado FROM pagos WHERE cliente_id = p_cliente_id AND periodo = v_periodo;
    IF v_periodo < v_actual THEN
      IF v_pagado < p_precio THEN v_saldo := v_saldo + (p_precio - v_pagado); END IF;
    ELSE
      IF v_pagado < p_precio AND p_fecha_efectiva > (fn_fecha_vencimiento(p_dia_pago, v_periodo) + p_tolerancia) THEN
        v_saldo := v_saldo + (p_precio - v_pagado);
      END IF;
    END IF;
    v_periodo := v_periodo + INTERVAL '1 month';
  END LOOP;
  RETURN v_saldo;
END;
$$ LANGUAGE plpgsql;

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
    WHEN COALESCE(pm.pagado, 0) >= p.precio THEN 'verde'
    WHEN CURRENT_DATE > (fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) + c.dias_tolerancia) THEN 'rojo'
    WHEN CURRENT_DATE > fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) THEN 'naranja'
    WHEN CURRENT_DATE >= (fn_fecha_vencimiento(c.dia_pago, CURRENT_DATE) - 3) THEN 'amarillo'
    ELSE 'verde'
  END AS semaforo,
  -- Fecha efectiva: hoy si está activo, la fecha de suspensión si está suspendido
  -- (esto es lo que "congela" el conteo mientras dure la suspensión)
  fn_meses_adeudados(
    c.id, c.fecha_inicio_conteo, c.dia_pago, c.dias_tolerancia, p.precio,
    CASE WHEN c.estado = 'suspendido' AND c.fecha_suspension IS NOT NULL
         THEN LEAST(c.fecha_suspension, CURRENT_DATE) ELSE CURRENT_DATE END
  ) + c.adeudo_manual_meses AS meses_adeudados,
  (fn_saldo_pendiente_automatico(
    c.id, c.fecha_inicio_conteo, c.dia_pago, c.dias_tolerancia, p.precio,
    CASE WHEN c.estado = 'suspendido' AND c.fecha_suspension IS NOT NULL
         THEN LEAST(c.fecha_suspension, CURRENT_DATE) ELSE CURRENT_DATE END
  ) + (c.adeudo_manual_meses * p.precio))::numeric(10,2) AS saldo_pendiente
FROM clientes c
JOIN zonas z   ON z.id = c.zona_id
JOIN planes p  ON p.id = c.plan_id
LEFT JOIN LATERAL (
  SELECT SUM(monto) AS pagado FROM pagos pg
  WHERE pg.cliente_id = c.id AND pg.periodo = date_trunc('month', CURRENT_DATE)::date
) pm ON true;
