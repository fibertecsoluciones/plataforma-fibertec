// Ejecuta schema.sql contra la base de datos configurada en DATABASE_URL.
// Uso: npm run db:init
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  console.log('Ejecutando schema.sql ...');
  try {
    await pool.query(sql);
    console.log('✔ Base de datos inicializada correctamente.');
  } catch (err) {
    console.error('✘ Error al inicializar la base de datos:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
