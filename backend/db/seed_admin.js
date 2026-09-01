// Crea (o actualiza la contraseña de) el usuario administrador inicial.
// Uso: npm run db:seed-admin
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function main() {
  const usuario = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const nombre = process.env.ADMIN_NOMBRE || 'Administrador';

  const hash = await bcrypt.hash(password, 10);

  const existe = await db.query('SELECT id FROM usuarios WHERE usuario = $1', [usuario]);

  if (existe.rows.length > 0) {
    await db.query('UPDATE usuarios SET password_hash = $1, activo = TRUE WHERE usuario = $2', [hash, usuario]);
    console.log(`✔ Contraseña actualizada para el usuario "${usuario}".`);
  } else {
    await db.query(
      `INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES ($1, $2, $3, 'admin')`,
      [nombre, usuario, hash]
    );
    console.log(`✔ Usuario administrador "${usuario}" creado.`);
  }

  console.log(`   Usuario: ${usuario}`);
  console.log(`   Password: ${password}  (cámbiala después de tu primer inicio de sesión)`);
  process.exit(0);
}

main().catch((err) => {
  console.error('✘ Error creando el usuario admin:', err.message);
  process.exit(1);
});
