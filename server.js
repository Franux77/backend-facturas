const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const FACTURAS_DIR = path.join(__dirname, "facturas");
const PIN_SECRETO = "172839"; // Cambia este si querés

// Crear la carpeta 'facturas' si no existe
if (!fs.existsSync(FACTURAS_DIR)) {
  fs.mkdirSync(FACTURAS_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use("/facturas", express.static(FACTURAS_DIR));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Configuración de Multer
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Obtener estructura de archivos
app.get("/api/facturas", (req, res) => {
  if (!fs.existsSync(FACTURAS_DIR)) return res.json([]);

  const years = fs.readdirSync(FACTURAS_DIR).sort().reverse();

  const data = years.map((year) => {
    const monthsPath = path.join(FACTURAS_DIR, year);
    if (!fs.existsSync(monthsPath)) return null;

    const months = fs.readdirSync(monthsPath).map((month) => {
      const filesPath = path.join(monthsPath, month);
      const files = fs.existsSync(filesPath) ? fs.readdirSync(filesPath) : [];
      return { month, files };
    });

    return { year, months };
  }).filter(Boolean);

  res.json(data);
});

// Subir archivo
app.post("/api/subir", upload.single("factura"), (req, res) => {
  const { year, month, tipo, pin } = req.body;

  if (!year || !month || !tipo || !req.file || !pin) {
    return res.status(400).json({ message: "Datos incompletos" });
  }

  if (pin !== PIN_SECRETO) {
    return res.status(401).json({ message: "PIN incorrecto" });
  }

  const extension = path.extname(req.file.originalname) || ".pdf";
  const nuevoNombre = `factura de ${tipo.toLowerCase()} ${month} ${year}${extension}`;

  const dirPath = path.join(FACTURAS_DIR, year, month);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const filePath = path.join(dirPath, nuevoNombre);
  fs.writeFileSync(filePath, req.file.buffer);

  io.emit("actualizar");

  res.json({ message: `Archivo subido como '${nuevoNombre}'` });
});

// Eliminar archivo
app.delete("/api/facturas", (req, res) => {
  const { year, month, filename } = req.body;
  if (!year || !month || !filename) {
    return res.status(400).json({ message: "Faltan datos" });
  }

  const filePath = path.join(FACTURAS_DIR, year, month, filename);
  const monthPath = path.join(FACTURAS_DIR, year, month);
  const yearPath = path.join(FACTURAS_DIR, year);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "Archivo no existe" });
  }

  fs.unlinkSync(filePath); // eliminar el archivo

  // Si no quedan archivos en el mes, eliminar la carpeta del mes
  const filesLeft = fs.readdirSync(monthPath);
  if (filesLeft.length === 0) {
    fs.rmdirSync(monthPath);

    // Si no quedan carpetas de meses en el año, eliminar el año
    const monthsLeft = fs.existsSync(yearPath) ? fs.readdirSync(yearPath) : [];
    if (monthsLeft.length === 0) {
      fs.rmdirSync(yearPath);
    }
  }

  io.emit("actualizar");
  res.json({ message: "Archivo eliminado correctamente" });
});


// Socket.io conexión
io.on("connection", (socket) => {
  console.log("Cliente conectado");
  socket.on("disconnect", () => {
    console.log("Cliente desconectado");
  });
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
