const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads', 'evidencias');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const nombre = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, nombre);
  }
});

const fileFilter = (req, file, cb) => {
  const permitidos = /jpeg|jpg|png|webp|pdf/;
  const extOk = permitidos.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = permitidos.test(file.mimetype);
  if (extOk && mimeOk) return cb(null, true);
  cb(new Error('Formato de archivo no permitido. Usa JPG, PNG, WEBP o PDF.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 } // 8MB
});

module.exports = upload;
