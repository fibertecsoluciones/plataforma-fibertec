// Conexión a PostgreSQL usando la variable DATABASE_URL (Railway la provee automáticamente)
require('dotenv').config();
const { Pool } = require('pg');

const isProd = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway requiere SSL en producción; en local normalmente no.
  ssl: isProd ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
