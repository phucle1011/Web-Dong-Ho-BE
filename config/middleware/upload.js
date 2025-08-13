// middleware/upload.js
const multer = require("multer");

const storage = multer.memoryStorage(); // lưu file trong RAM
const upload = multer({ storage });

module.exports = upload;
