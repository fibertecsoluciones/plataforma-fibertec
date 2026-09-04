require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

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

app.get('/api/health', (req, res) => res.json({ ok: true, servicio: 'FiberTec ISP API' }));

// ---------- Servir el frontend estático (opcional, si lo despliegas junto al backend) ----------
const frontendPath = path.join(__dirname, 'frontend');
app.use(express.static(frontendPath));
app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
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
