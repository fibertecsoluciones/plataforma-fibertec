const multer = require('multer');
const path = require('path');

// Se guarda en memoria (no en disco) porque solo lo necesitamos leer una vez para procesarlo.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const permitidos = /xlsx|xls|csv/;
  const extOk = permitidos.test(path.extname(file.originalname).toLowerCase());
  if (extOk) return cb(null, true);
  cb(new Error('Formato no soportado. Sube un archivo .xlsx, .xls o .csv'));
};

const uploadExcel = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

module.exports = uploadExcel;
