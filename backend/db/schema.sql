-- ============================================================
-- FiberTec ISP - Esquema de base de datos PostgreSQL
-- Diseñado para Railway (Postgres) + Node/Express
-- ============================================================

-- ---------- EXTENSIONES ----------
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- para gen_random_uuid si se requiere

-- ============================================================
-- CATÁLOGOS
-- ============================================================

CREATE TABLE zonas (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(60) NOT NULL UNIQUE,   -- Ej: POPOTLA
  codigo        VARCHAR(10) NOT NULL UNIQUE,   -- Ej: POP  (usado en el Cliente-ID)
  activo        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE planes (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(60) NOT NULL UNIQUE,   -- Ej: NAVEGA, VUELO ELITE
  velocidad     VARCHAR(30),                   -- Ej: 20 Mbps
  precio        NUMERIC(10,2) NOT NULL DEFAULT 0,
  activo        BOOLEAN NOT NULL DEFAULT TRUE
);

-- Usuarios del sistema (administradores y técnicos)
CREATE TABLE usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(100) NOT NULL,
  usuario       VARCHAR(50) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol           VARCHAR(20) NOT NULL CHECK (rol IN ('admin','tecnico')),
  telefono      VARCHAR(20),
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CLIENTES
-- ============================================================

CREATE TABLE clientes (
  id                SERIAL PRIMARY KEY,
  cliente_id        VARCHAR(20) UNIQUE,          -- Generado automático: POP-001
  nombre            VARCHAR(150) NOT NULL,
  telefono          VARCHAR(20),
  telefono_alt      VARCHAR(20),
  direccion         TEXT,
  zona_id           INTEGER NOT NULL REFERENCES zonas(id),
  plan_id           INTEGER NOT NULL REFERENCES planes(id),
  ip                VARCHAR(45),                  -- IP asignada al cliente
  dia_pago          SMALLINT NOT NULL CHECK (dia_pago BETWEEN 1 AND 31),
  dias_tolerancia   SMALLINT NOT NULL DEFAULT 5,
  adeudo_manual_meses SMALLINT NOT NULL DEFAULT 0, -- meses de atraso previos a usar el sistema, capturados a mano
  adeudo_manual_detalle TEXT, -- nota libre: a qué meses corresponde ese adeudo manual (ej. "julio y agosto 2026")
  fecha_inicio_conteo DATE DEFAULT CURRENT_DATE, -- desde qué fecha se cuenta el adeudo automático (normalmente = fecha_alta)
  fecha_suspension DATE, -- fecha en que quedó suspendido (congela el conteo automático de ahí en adelante)
  fecha_alta        DATE NOT NULL DEFAULT CURRENT_DATE,
  estado            VARCHAR(20) NOT NULL DEFAULT 'activo'
                      CHECK (estado IN ('activo','suspendido','baja')),
  notas             TEXT,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clientes_zona ON clientes(zona_id);
CREATE INDEX idx_clientes_estado ON clientes(estado);

-- ---------- Generación automática de Cliente-ID (ZONA-###) ----------
CREATE OR REPLACE FUNCTION fn_generar_cliente_id()
RETURNS TRIGGER AS $$
DECLARE
  v_codigo VARCHAR(10);
  v_siguiente INT;
BEGIN
  IF NEW.cliente_id IS NULL THEN
    SELECT codigo INTO v_codigo FROM zonas WHERE id = NEW.zona_id;

    SELECT COALESCE(MAX(
      CAST(SUBSTRING(cliente_id FROM '([0-9]+)$') AS INT)
    ), 0) + 1
    INTO v_siguiente
    FROM clientes
    WHERE zona_id = NEW.zona_id;

    NEW.cliente_id := v_codigo || '-' || LPAD(v_siguiente::TEXT, 3, '0');
  END IF;
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clientes_cliente_id
BEFORE INSERT ON clientes
FOR EACH ROW EXECUTE FUNCTION fn_generar_cliente_id();

CREATE OR REPLACE FUNCTION fn_touch_actualizado()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clientes_touch
BEFORE UPDATE ON clientes
FOR EACH ROW EXECUTE FUNCTION fn_touch_actualizado();

-- ============================================================
-- PAGOS
-- ============================================================
-- Un registro por CADA ABONO de un cliente a un mes (periodo = primer día del mes).
-- Un mismo mes puede tener VARIOS registros (pagos parciales/abonos) — se suman para
-- saber si ese mes ya quedó cubierto. Cuando un cliente paga 2 o 3 meses de una sola
-- exhibición (excepción autorizada), se generan varias filas -- una por cada periodo
-- cubierto -- ligadas por el mismo grupo_pago (mismo folio de pago).

CREATE TABLE pagos (
  id              SERIAL PRIMARY KEY,
  grupo_pago      UUID NOT NULL DEFAULT gen_random_uuid(), -- agrupa pagos de una misma exhibición
  cliente_id      INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  periodo         DATE NOT NULL,               -- primer día del mes que cubre (ej. 2026-09-01)
  monto           NUMERIC(10,2) NOT NULL,
  fecha_pago      DATE NOT NULL DEFAULT CURRENT_DATE,
  metodo_pago     VARCHAR(30) DEFAULT 'efectivo',
  meses_cubiertos SMALLINT NOT NULL DEFAULT 1,  -- 1, 2 o 3 (excepción)
  es_excepcion    BOOLEAN NOT NULL DEFAULT FALSE,
  comprobante_url TEXT,
  registrado_por  INTEGER REFERENCES usuarios(id),
  notas           TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pagos_cliente ON pagos(cliente_id);
CREATE INDEX idx_pagos_periodo ON pagos(periodo);

-- ---------- Reglas de negocio para fechas de vencimiento ----------
-- Ajusta el día de pago a meses que no tienen ese día (ej. día 31 en febrero -> usa el último día)
CREATE OR REPLACE FUNCTION fn_fecha_vencimiento(p_dia SMALLINT, p_periodo DATE)
RETURNS DATE AS $$
DECLARE
  v_ultimo_dia INT;
BEGIN
  v_ultimo_dia := EXTRACT(DAY FROM (date_trunc('month', p_periodo) + INTERVAL '1 month - 1 day'));
  RETURN (date_trunc('month', p_periodo)::date) + (LEAST(p_dia, v_ultimo_dia) - 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Cuenta cuántos meses, desde que el cliente se dio de alta hasta la fecha efectiva
-- (hoy si está activo, o la fecha en que quedó suspendido si está suspendido), se
-- quedaron SIN CUBRIR (compara la SUMA de abonos de cada mes contra el precio del
-- plan, para que un pago parcial no cuente como si el mes ya estuviera resuelto).
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

-- Suma en DINERO lo que falta por cubrir, hasta la misma fecha efectiva descrita arriba.
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

-- ============================================================
-- VISTA: Estado de pago / semáforo por cliente (mes en curso)
-- ============================================================
-- Semáforos:
--   verde    -> pagado, o aún falta tiempo para vencer
--   amarillo -> próximo a vencer (3 días antes o menos, sin pagar)
--   naranja  -> vencido pero dentro de los días de tolerancia
--   rojo     -> vencido y fuera de tolerancia (candidato a corte)
--
-- Ojo: todo lo anterior solo mira EL MES EN CURSO. Para saber si un cliente
-- arrastra 2, 3 o más meses sin pagar, se usa fn_meses_adeudados() más abajo.
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

-- ============================================================
-- INSTALACIONES (módulo de técnicos)
-- ============================================================

CREATE TABLE instalaciones (
  id                SERIAL PRIMARY KEY,
  cliente_id        INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tecnico_id        INTEGER NOT NULL REFERENCES usuarios(id),
  ip_asignada       VARCHAR(45),
  mac_modem         VARCHAR(30),
  marca_modem       VARCHAR(50),
  modelo_modem      VARCHAR(50),
  serial_modem      VARCHAR(80),
  evidencia_url     TEXT,
  fecha_instalacion TIMESTAMPTZ NOT NULL DEFAULT now(),   -- automática
  latitud           NUMERIC(10,7),                        -- automática (geolocalización)
  longitud          NUMERIC(10,7),
  direccion_aprox   TEXT,
  notas             TEXT,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_instalaciones_cliente ON instalaciones(cliente_id);

-- ============================================================
-- SOLICITUDES DE INSTALACIÓN (leads capturados en campo)
-- ============================================================

CREATE TABLE solicitudes_instalacion (
  id                SERIAL PRIMARY KEY,
  nombre            VARCHAR(150) NOT NULL,
  telefono          VARCHAR(20),
  telefono_alt      VARCHAR(20),
  direccion         TEXT,
  zona_id           INTEGER REFERENCES zonas(id),
  plan_interes_id   INTEGER REFERENCES planes(id),
  notas             TEXT,
  estado            VARCHAR(20) NOT NULL DEFAULT 'nueva'
                       CHECK (estado IN ('nueva','contactada','agendada','convertida','descartada')),
  capturado_por     INTEGER REFERENCES usuarios(id),
  cliente_generado_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  latitud           NUMERIC(10,7),
  longitud          NUMERIC(10,7),
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_solicitudes_estado ON solicitudes_instalacion(estado);

CREATE OR REPLACE FUNCTION fn_touch_solicitud()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_solicitudes_touch
BEFORE UPDATE ON solicitudes_instalacion
FOR EACH ROW EXECUTE FUNCTION fn_touch_solicitud();

-- ============================================================
-- ACTIVIDADES (tareas asignadas a técnicos)
-- ============================================================

CREATE TABLE actividades (
  id              SERIAL PRIMARY KEY,
  titulo          VARCHAR(150) NOT NULL,
  descripcion     TEXT,
  tecnico_id      INTEGER NOT NULL REFERENCES usuarios(id),
  cliente_id      INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  prioridad       VARCHAR(10) NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta')),
  estado          VARCHAR(15) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_proceso','completada')),
  fecha_limite    DATE,
  creado_por      INTEGER REFERENCES usuarios(id),
  completado_en   TIMESTAMPTZ,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_actividades_tecnico ON actividades(tecnico_id);
CREATE INDEX idx_actividades_estado ON actividades(estado);

CREATE TABLE actividad_puntos (
  id              SERIAL PRIMARY KEY,
  actividad_id    INTEGER NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  descripcion     VARCHAR(200) NOT NULL,
  orden           SMALLINT NOT NULL DEFAULT 0,
  completado      BOOLEAN NOT NULL DEFAULT FALSE,
  completado_en   TIMESTAMPTZ,
  completado_por  INTEGER REFERENCES usuarios(id)
);

CREATE INDEX idx_actividad_puntos_actividad ON actividad_puntos(actividad_id);

CREATE OR REPLACE FUNCTION fn_recalcular_estado_actividad()
RETURNS TRIGGER AS $$
DECLARE
  v_actividad_id INT;
  v_total INT;
  v_completados INT;
BEGIN
  v_actividad_id := COALESCE(NEW.actividad_id, OLD.actividad_id);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE completado)
  INTO v_total, v_completados
  FROM actividad_puntos WHERE actividad_id = v_actividad_id;

  IF v_total > 0 THEN
    UPDATE actividades SET
      estado = CASE
        WHEN v_completados = v_total THEN 'completada'
        WHEN v_completados > 0 THEN 'en_proceso'
        ELSE 'pendiente'
      END,
      completado_en = CASE WHEN v_completados = v_total THEN now() ELSE NULL END
    WHERE id = v_actividad_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalcular_estado_actividad
AFTER INSERT OR UPDATE OF completado OR DELETE ON actividad_puntos
FOR EACH ROW EXECUTE FUNCTION fn_recalcular_estado_actividad();

-- ============================================================
-- INVENTARIO (artículos y herramientas)
-- ============================================================

CREATE TABLE inventario_categorias (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(60) NOT NULL UNIQUE  -- Ej: Herramienta, Material, Equipo
);

CREATE TABLE inventario_items (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  categoria_id  INTEGER REFERENCES inventario_categorias(id),
  unidad        VARCHAR(20) DEFAULT 'pza',
  stock_actual  NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock_minimo  NUMERIC(10,2) NOT NULL DEFAULT 0,
  ubicacion     VARCHAR(100),
  notas         TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventario_movimientos (
  id            SERIAL PRIMARY KEY,
  item_id       INTEGER NOT NULL REFERENCES inventario_items(id) ON DELETE CASCADE,
  tipo          VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada','salida')),
  cantidad      NUMERIC(10,2) NOT NULL CHECK (cantidad > 0),
  motivo        VARCHAR(150),
  tecnico_id    INTEGER REFERENCES usuarios(id),
  cliente_id    INTEGER REFERENCES clientes(id) ON DELETE SET NULL,  -- opcional, si salió material para instalación
  fecha         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION fn_actualizar_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'entrada' THEN
    UPDATE inventario_items SET stock_actual = stock_actual + NEW.cantidad WHERE id = NEW.item_id;
  ELSE
    UPDATE inventario_items SET stock_actual = stock_actual - NEW.cantidad WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventario_movimiento
AFTER INSERT ON inventario_movimientos
FOR EACH ROW EXECUTE FUNCTION fn_actualizar_stock();

-- ============================================================
-- FINANZAS: EGRESOS (los ingresos se derivan de la tabla `pagos`)
-- ============================================================

CREATE TABLE egresos_categorias (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(60) NOT NULL UNIQUE -- Ej: Nómina, Combustible, Herramientas, Renta, Publicidad
);

CREATE TABLE egresos (
  id            SERIAL PRIMARY KEY,
  categoria_id  INTEGER REFERENCES egresos_categorias(id),
  concepto      VARCHAR(150) NOT NULL,
  monto         NUMERIC(10,2) NOT NULL,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  comprobante_url TEXT,
  registrado_por INTEGER REFERENCES usuarios(id),
  notas         TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_egresos_fecha ON egresos(fecha);

-- ============================================================
-- DATOS INICIALES (seed)
-- ============================================================

INSERT INTO zonas (nombre, codigo) VALUES
  ('POPOTLA','POP'),
  ('KM40','KM40'),
  ('PAJARAL','PAJ'),
  ('SAN PEDRO','SPD');

INSERT INTO planes (nombre, velocidad, precio) VALUES
  ('NAVEGA','10 Mbps', 350.00),
  ('VUELO ELITE','30 Mbps', 550.00);

INSERT INTO inventario_categorias (nombre) VALUES
  ('Herramienta'),('Material de red'),('Equipo/Modem'),('Consumible');

INSERT INTO egresos_categorias (nombre) VALUES
  ('Nómina'),('Combustible'),('Herramientas'),('Renta / Torres'),
  ('Mantenimiento de red'),('Publicidad'),('Otros');

-- Usuario admin inicial: usuario "admin" / password "admin123" (CAMBIAR EN PRODUCCIÓN)
-- El hash se genera en el script backend/db/seed_admin.js
