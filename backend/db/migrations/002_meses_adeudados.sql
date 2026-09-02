-- Migración 002: meses adeudados y saldo pendiente acumulado
-- Segura de correr aunque ya tengas datos: solo agrega/reemplaza una función y una vista,
-- no toca ninguna tabla ni borra información existente.

CREATE OR REPLACE FUNCTION fn_meses_adeudados(
  p_cliente_id INT, p_fecha_alta DATE, p_dia_pago SMALLINT, p_tolerancia SMALLINT
) RETURNS INT AS $$
DECLARE
  v_periodo DATE := date_trunc('month', p_fecha_alta)::date;
  v_actual  DATE := date_trunc('month', CURRENT_DATE)::date;
  v_meses   INT := 0;
BEGIN
  WHILE v_periodo <= v_actual LOOP
    IF v_periodo < v_actual THEN
      IF NOT EXISTS (SELECT 1 FROM pagos WHERE cliente_id = p_cliente_id AND periodo = v_periodo) THEN
        v_meses := v_meses + 1;
      END IF;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM pagos WHERE cliente_id = p_cliente_id AND periodo = v_periodo)
         AND CURRENT_DATE > (fn_fecha_vencimiento(p_dia_pago, v_periodo) + p_tolerancia) THEN
        v_meses := v_meses + 1;
      END IF;
    END IF;
    v_periodo := v_periodo + INTERVAL '1 month';
  END LOOP;
  RETURN v_meses;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE VIEW vw_estado_pago AS
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
  fn_meses_adeudados(c.id, c.fecha_alta, c.dia_pago, c.dias_tolerancia)                    AS meses_adeudados,
  (fn_meses_adeudados(c.id, c.fecha_alta, c.dia_pago, c.dias_tolerancia) * p.precio)::numeric(10,2) AS saldo_pendiente
FROM clientes c
JOIN zonas z   ON z.id = c.zona_id
JOIN planes p  ON p.id = c.plan_id
WHERE c.estado <> 'baja';
