# FiberTec ISP — Panel de operación

Sistema de control para un ISP: clientes, pagos con semáforos y excepciones,
instalaciones (módulo de técnicos), inventario y finanzas (ingresos vs egresos).

Stack: **Node.js + Express** (backend) · **PostgreSQL** (base de datos) ·
**HTML/CSS/JS puro, sin frameworks** (frontend) — pensado para desplegarse en **Railway**.

```
fibertec-isp/
├── backend/
│   ├── config/db.js            # conexión a PostgreSQL
│   ├── controllers/            # lógica de cada módulo
│   ├── db/schema.sql           # TODO el esquema de base de datos
│   ├── db/init.js              # ejecuta schema.sql contra la BD
│   ├── db/seed_admin.js        # crea el usuario administrador inicial
│   ├── middleware/             # auth.js (JWT), upload.js (evidencias)
│   ├── routes/                 # rutas de la API
│   ├── uploads/evidencias/     # fotos de instalación / comprobantes
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── css/style.css
    ├── js/                     # config.js, api.js, layout.js + 1 js por página
    ├── img/logo.png
    ├── index.html              # login
    ├── dashboard.html
    ├── clientes.html
    ├── pagos.html
    ├── tecnicos.html           # módulo de instalaciones
    ├── inventario.html
    ├── finanzas.html
    └── ajustes.html            # solo admin: zonas, planes, técnicos
```

## 1. Cómo funciona el sistema de semáforos de pago

Cada cliente tiene un `dia_pago` (1–31) y `dias_tolerancia` (5 por defecto).
Para meses que no tienen ese día (ej. día 31 en febrero), el sistema usa
automáticamente el **último día real del mes** (función `fn_fecha_vencimiento`
en `schema.sql`).

Estados (vista `vw_estado_pago`):

| Semáforo | Significado |
|---|---|
| 🟢 Verde | Ya pagó el mes en curso, o aún falta tiempo para la fecha de pago |
| 🟡 Amarillo | Faltan 3 días o menos para la fecha de pago y no ha pagado |
| 🟠 Naranja | Ya venció la fecha de pago pero sigue dentro de los días de tolerancia |
| 🔴 Rojo | Venció la fecha de pago **y** la tolerancia — candidato a corte |

## 2. Excepciones de pago (2 o 3 meses en una sola exhibición)

Cuando registras un pago desde **Pagos → Registrar pago**, eliges cuántos
meses cubre esa exhibición (1, 2 o 3). El sistema:
- Reparte el monto total entre los meses cubiertos.
- Crea un registro de pago **por cada mes** (para que el semáforo de cada
  mes se calcule normal e independientemente).
- Marca esos pagos como `es_excepcion = true` para que quede identificado
  en el historial.

## 3. Cliente-ID (folio)

Se genera solo, en automático, al crear un cliente: `<CÓDIGO_ZONA>-###`
(ej. `POP-001`, `KM40-014`, `PAJ-002`, `SPD-007`). El código de zona lo
defines tú en **Ajustes → Zonas**.

## 4. Módulo de técnicos

1. El técnico busca al cliente por su folio (Cliente-ID) → se autocompletan
   sus datos.
2. Llena IP asignada, MAC, marca/modelo/serial del módem y sube la evidencia
   (foto).
3. La **fecha de instalación** y el **técnico** se toman automáticamente del
   servidor y de la sesión (no se pueden falsear desde el formulario).
4. La **ubicación** se captura con el GPS del navegador/celular
   (`navigator.geolocation`) al momento de buscar al cliente.

## 5. Inventario

`inventario_items` guarda el stock actual de cada artículo/herramienta.
Cada movimiento (`entrada`/`salida`) en `inventario_movimientos` actualiza el
stock automáticamente mediante un trigger en PostgreSQL — nunca edites el
stock a mano.

## 6. Finanzas

- **Ingresos**: se calculan automáticamente sumando la tabla `pagos` (no se
  capturan a mano, para que nunca se desincronicen del control de clientes).
- **Egresos**: se registran manualmente (nómina, combustible, herramientas,
  renta de torres, mantenimiento de red, publicidad, otros — puedes agregar
  más categorías directamente en la tabla `egresos_categorias`).
- El dashboard muestra balance del mes y una gráfica de los últimos 6 meses.

---

## Despliegue en Railway

### Paso 1 — Base de datos
1. En tu proyecto de Railway, agrega un plugin **PostgreSQL**.
2. Railway crea automáticamente la variable `DATABASE_URL`.

### Paso 2 — Backend
1. Crea un nuevo servicio en Railway apuntando a este repositorio.
2. En **Settings → Root Directory**, ponlo en `backend`.
3. En **Variables**, copia todas las de `backend/.env.example` (Railway ya
   te da `DATABASE_URL` automáticamente si conectas el plugin de Postgres al
   servicio; agrega manualmente `JWT_SECRET`, `CORS_ORIGIN`, etc.).
4. Railway detecta `package.json` y corre `npm install` + `npm start` solo.
5. **Antes de usar la app**, corre una sola vez (desde la pestaña *Shell* de
   Railway, o localmente apuntando a la `DATABASE_URL` de producción):
   ```bash
   npm run db:init          # crea todas las tablas
   npm run db:seed-admin    # crea tu primer usuario administrador
   ```

### Paso 3 — Frontend
El backend ya sirve el frontend automáticamente desde la carpeta `frontend/`
(ver el final de `server.js`), así que **no necesitas un servicio aparte**:
con un solo servicio de Railway tienes todo. Solo entra a la URL que Railway
te dé para tu servicio backend y ahí verás el login.

Si prefieres separarlos en dos servicios, sube `frontend/` a otro servicio
(o a Netlify/Vercel) y cambia `window.API_BASE_URL` en
`frontend/js/config.js` por la URL pública de tu backend.

### Paso 4 — Primer inicio de sesión
Usuario y contraseña son los que definiste en `ADMIN_USER` / `ADMIN_PASSWORD`
(por defecto `admin` / `admin123`). **Cámbiala** apenas entres, creando un
nuevo usuario admin desde Ajustes o corriendo `db:seed-admin` de nuevo con
otra contraseña.

---

## Correrlo en tu computadora (desarrollo local)

```bash
cd backend
cp .env.example .env      # edítalo con los datos de tu PostgreSQL local
npm install
npm run db:init
npm run db:seed-admin
npm run dev                # http://localhost:4000
```

## Ideas para siguientes mejoras (opcionales)

- Notificaciones automáticas por WhatsApp/SMS cuando un cliente entra en 🟡 o 🔴.
- Reporte de "clientes a suspender" exportable a PDF/Excel para tus técnicos.
- Bitácora de quién editó qué (auditoría) en clientes y pagos.
- Roles adicionales (ej. "cobranza" que solo vea Pagos, sin editar clientes).
