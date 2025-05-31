const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const cors = require("cors");
app.use(cors());
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const FACTURAS_DIR = path.join(__dirname, "facturas");
const PIN_SECRETO = "172839"; // 🔐 PIN secreto

app.use("/facturas", express.static(FACTURAS_DIR));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.get("/api/facturas", (req, res) => {
  if (!fs.existsSync(FACTURAS_DIR)) return res.json([]);
  const years = fs.readdirSync(FACTURAS_DIR).sort().reverse();
  const data = years.map(year => {
    const monthsPath = path.join(FACTURAS_DIR, year);
    const months = fs.readdirSync(monthsPath).map(month => {
      const filesPath = path.join(monthsPath, month);
      const files = fs.existsSync(filesPath) ? fs.readdirSync(filesPath) : [];
      return { month, files };
    });
    return { year, months };
  });
  res.json(data);
});

app.delete("/api/facturas", (req, res) => {
  const { year, month, filename } = req.body;
  if (!year || !month || !filename) return res.status(400).json({ message: "Faltan datos" });

  const filePath = path.join(FACTURAS_DIR, year, month, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: "Archivo no existe" });

  fs.unlinkSync(filePath);

  const monthPath = path.join(FACTURAS_DIR, year, month);
  const filesLeft = fs.existsSync(monthPath) ? fs.readdirSync(monthPath) : [];
  if (filesLeft.length === 0) fs.rmdirSync(monthPath);

  io.emit("actualizar");

  res.json({ message: "Archivo eliminado correctamente" });
});

app.post("/api/subir", upload.single("factura"), (req, res) => {
  const { year, month, tipo, pin } = req.body;

  if (!year || !month || !tipo || !req.file || !pin)
    return res.status(400).json({ message: "Datos incompletos" });

  if (pin !== PIN_SECRETO)
    return res.status(401).json({ message: "PIN incorrecto" });

  const extension = path.extname(req.file.originalname) || ".pdf";
  const nuevoNombre = `factura de ${tipo.toLowerCase()} ${year}${extension}`;

  const dirPath = path.join(FACTURAS_DIR, year, month);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

  const filePath = path.join(dirPath, nuevoNombre);
  fs.writeFileSync(filePath, req.file.buffer);

  io.emit("actualizar");

  res.json({ message: `Archivo subido como '${nuevoNombre}'` });
});

io.on("connection", (socket) => {
  console.log("Cliente conectado");
  socket.on("disconnect", () => {
    console.log("Cliente desconectado");
  });
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
