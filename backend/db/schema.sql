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
-- Un registro por CLIENTE + MES cubierto (periodo = primer día del mes).
-- Cuando un cliente paga 2 o 3 meses de una sola exhibición (excepción),
-- se generan varias filas (una por cada periodo cubierto) enlazadas por
-- grupo_pago (mismo folio de pago).

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
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, periodo)                  -- no se puede pagar 2 veces el mismo mes
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

-- Cuenta cuántos meses, desde que el cliente se dio de alta hasta hoy, se quedaron
-- SIN pago registrado. Los meses ya totalmente pasados cuentan si no hay pago.
-- El mes en curso solo cuenta si ya está vencido y fuera de tolerancia (semáforo rojo),
-- para no marcar como "adeudado" un mes que todavía no se le vence al cliente.
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
  fn_meses_adeudados(c.id, c.fecha_alta, c.dia_pago, c.dias_tolerancia) + c.adeudo_manual_meses                    AS meses_adeudados,
  ((fn_meses_adeudados(c.id, c.fecha_alta, c.dia_pago, c.dias_tolerancia) + c.adeudo_manual_meses) * p.precio)::numeric(10,2) AS saldo_pendiente
FROM clientes c
JOIN zonas z   ON z.id = c.zona_id
JOIN planes p  ON p.id = c.plan_id
WHERE c.estado <> 'baja';

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
  cliente_id    INTEGER REFERENCES clientes(id),  -- opcional, si salió material para instalación
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
