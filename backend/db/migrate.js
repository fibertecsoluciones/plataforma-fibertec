// Corre un archivo .sql de la carpeta db/migrations/ contra la base de datos.
// Uso: node db/migrate.js migrations/002_meses_adeudados.sql
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const archivo = process.argv[2];
  if (!archivo) {
    console.error('Uso: node db/migrate.js migrations/nombre_del_archivo.sql');
    process.exit(1);
  }

  const rutaCompleta = path.join(__dirname, archivo);
  if (!fs.existsSync(rutaCompleta)) {
    console.error(`✘ No se encontró el archivo: ${rutaCompleta}`);
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  const sql = fs.readFileSync(rutaCompleta, 'utf8');

  console.log(`Ejecutando ${archivo} ...`);
  try {
    await pool.query(sql);
    console.log('✔ Migración aplicada correctamente.');
  } catch (err) {
    console.error('✘ Error al aplicar la migración:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
