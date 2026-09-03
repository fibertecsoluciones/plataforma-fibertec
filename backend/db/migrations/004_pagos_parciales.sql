-- Migración 004: pagos parciales (abonos) + detalle de a qué mes corresponde el adeudo manual
--
-- Hasta ahora un pago existía o no existía para un mes (sin punto medio). Con esto,
-- un cliente puede abonar una parte de su mensualidad y completarla después con OTRO
-- registro para el mismo mes — el sistema suma los abonos de ese mes y solo lo marca
-- como pagado ("verde") cuando la suma alcanza el precio del plan.

-- 1) Ya no puede haber solo UN registro por cliente+mes: se necesitan poder registrar
--    varios abonos para el mismo mes.
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_cliente_id_periodo_key;

-- 2) Nota de texto libre para saber A QUÉ MESES corresponde el adeudo manual
--    (ej. "Julio y agosto 2026"), además del número.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS adeudo_manual_detalle TEXT;

-- 3) Hay que borrar primero la vista que usa la función vieja, antes de poder
--    borrar esa función (si no, Postgres no deja por la dependencia).
DROP VIEW IF EXISTS vw_estado_pago;

-- 4) Las funciones de conteo ahora necesitan el precio del plan, para comparar
--    la SUMA de abonos de cada mes contra lo que en realidad cuesta ese plan.
DROP FUNCTION IF EXISTS fn_meses_adeudados(INT, DATE, SMALLINT, SMALLINT);

CREATE OR REPLACE FUNCTION fn_meses_adeudados(
  p_cliente_id INT, p_fecha_alta DATE, p_dia_pago SMALLINT, p_tolerancia SMALLINT, p_precio NUMERIC
) RETURNS INT AS $$
DECLARE
  v_periodo DATE := date_trunc('month', p_fecha_alta)::date;
  v_actual  DATE := date_trunc('month', CURRENT_DATE)::date;
  v_meses   INT := 0;
  v_pagado  NUMERIC;
BEGIN
  WHILE v_periodo <= v_actual LOOP
    SELECT COALESCE(SUM(monto), 0) INTO v_pagado FROM pagos WHERE cliente_id = p_cliente_id AND periodo = v_periodo;
    IF v_periodo < v_actual THEN
      IF v_pagado < p_precio THEN v_meses := v_meses + 1; END IF;
    ELSE
      IF v_pagado < p_precio AND CURRENT_DATE > (fn_fecha_vencimiento(p_dia_pago, v_periodo) + p_tolerancia) THEN
        v_meses := v_meses + 1;
      END IF;
    END IF;
    v_periodo := v_periodo + INTERVAL '1 month';
  END LOOP;
  RETURN v_meses;
END;
$$ LANGUAGE plpgsql;

-- Suma en DINERO lo que falta por cubrir (más preciso que solo contar meses,
-- porque un mes "parcial" no debe un mes completo, solo la diferencia).
CREATE OR REPLACE FUNCTION fn_saldo_pendiente_automatico(
  p_cliente_id INT, p_fecha_alta DATE, p_dia_pago SMALLINT, p_tolerancia SMALLINT, p_precio NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  v_periodo DATE := date_trunc('month', p_fecha_alta)::date;
  v_actual  DATE := date_trunc('month', CURRENT_DATE)::date;
  v_saldo   NUMERIC := 0;
  v_pagado  NUMERIC;
BEGIN
  WHILE v_periodo <= v_actual LOOP
    SELECT COALESCE(SUM(monto), 0) INTO v_pagado FROM pagos WHERE cliente_id = p_cliente_id AND periodo = v_periodo;
    IF v_periodo < v_actual THEN
      IF v_pagado < p_precio THEN v_saldo := v_saldo + (p_precio - v_pagado); END IF;
    ELSE
      IF v_pagado < p_precio AND CURRENT_DATE > (fn_fecha_vencimiento(p_dia_pago, v_periodo) + p_tolerancia) THEN
        v_saldo := v_saldo + (p_precio - v_pagado);
      END IF;
    END IF;
    v_periodo := v_periodo + INTERVAL '1 month';
  END LOOP;
  RETURN v_saldo;
END;
$$ LANGUAGE plpgsql;

-- 4) La vista se recrea desde cero (no se puede solo "reemplazar" cuando cambia
--    tanto el orden como el tipo de columnas). No borra ningún dato.
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
  fn_meses_adeudados(c.id, c.fecha_alta, c.dia_pago, c.dias_tolerancia, p.precio) + c.adeudo_manual_meses AS meses_adeudados,
  (fn_saldo_pendiente_automatico(c.id, c.fecha_alta, c.dia_pago, c.dias_tolerancia, p.precio)
    + (c.adeudo_manual_meses * p.precio))::numeric(10,2)                   AS saldo_pendiente
FROM clientes c
JOIN zonas z   ON z.id = c.zona_id
JOIN planes p  ON p.id = c.plan_id
LEFT JOIN LATERAL (
  SELECT SUM(monto) AS pagado FROM pagos pg
  WHERE pg.cliente_id = c.id AND pg.periodo = date_trunc('month', CURRENT_DATE)::date
) pm ON true
WHERE c.estado <> 'baja';
