require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Red de seguridad: si alguna consulta a la base de datos falla y ese error no se
// atrapó con try/catch en el controlador correspondiente, esto evita que tumbe TODO
// el servidor (lo cual causaba errores 502 mientras Railway lo reiniciaba solo).
// Lo correcto sigue siendo atrapar cada error en su controlador, pero esto es un
// respaldo para que un descuido puntual no se lleve toda la aplicación entre pies.
process.on('unhandledRejection', (err) => {
  console.error('⚠️ Promesa no atrapada (unhandledRejection):', err);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Excepción no atrapada (uncaughtException):', err);
});

const app = express();

// Detrás del proxy de Railway: así req.ip es la IP real del visitante (límite de envíos de los formularios)
app.set('trust proxy', 1);

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Archivos de evidencias (fotos de instalación, comprobantes) servidos como estáticos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- Rutas de la API ----------
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/catalogos', require('./routes/catalogos.routes'));
app.use('/api/clientes', require('./routes/clientes.routes'));
app.use('/api/pagos', require('./routes/pagos.routes'));
app.use('/api/instalaciones', require('./routes/instalaciones.routes'));
app.use('/api/actividades', require('./routes/actividades.routes'));
app.use('/api/solicitudes', require('./routes/solicitudes.routes'));
app.use('/api/inventario', require('./routes/inventario.routes'));
app.use('/api/finanzas', require('./routes/finanzas.routes'));
app.use('/api/publico', require('./routes/publico.routes')); // formularios de la página web (sin sesión)

app.get('/api/health', (req, res) => res.json({ ok: true, servicio: 'FiberTec ISP API' }));

// ---------- Servir el frontend estático (opcional, si lo despliegas junto al backend) ----------
const frontendPath = path.join(__dirname, 'frontend');
// La entrada (/) es la página web pública; el sistema entra por /login.html
app.get(['/login', '/sistema', '/acceso'], (req, res) => res.redirect('/login.html'));
app.get(['/soluciones', '/soluciones.html'], (req, res) => res.redirect(301, '/servicios.html'));
app.use(express.static(frontendPath));
app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
  res.status(404).sendFile(path.join(frontendPath, '404.html'));
});

// Manejador de errores centralizado (incluye errores de multer)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✔ FiberTec ISP API corriendo en el puerto ${PORT}`);
});
