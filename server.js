const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
const { google } = require("googleapis");
const mime = require("mime-types");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 3000;
const PIN_SECRETO = "172839"; // Cambiá esto si querés

// Google Drive API setup
const auth = new google.auth.GoogleAuth({
  keyFile: "backend-facturas-461600-1114026cde42.json",
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const DRIVE_FOLDER_ID = "1uj0wryzsjDDL2Wm7bYEjsbeCdE-JrZLd";

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Socket.io
io.on("connection", (socket) => {
  console.log("Cliente conectado");
  socket.on("disconnect", () => {
    console.log("Cliente desconectado");
  });
});

// SUBIR FACTURA
app.post("/api/subir", upload.single("factura"), async (req, res) => {
  const { year, month, tipo, pin } = req.body;

  if (!year || !month || !tipo || !req.file || !pin) {
    return res.status(400).json({ message: "Datos incompletos" });
  }

  if (pin !== PIN_SECRETO) {
    return res.status(401).json({ message: "PIN incorrecto" });
  }

  const nuevoNombre = `factura de ${tipo.toLowerCase()} ${month} ${year}.pdf`;

  try {
    const authClient = await auth.getClient();
    const drive = google.drive({ version: "v3", auth: authClient });

    const fileMetadata = {
      name: nuevoNombre,
      parents: [DRIVE_FOLDER_ID],
    };

    const media = {
      mimeType: mime.lookup(req.file.originalname) || "application/pdf",
      body: Buffer.from(req.file.buffer),
    };

    await drive.files.create({
      resource: fileMetadata,
      media: {
        mimeType: media.mimeType,
        body: req.file.stream || Buffer.from(req.file.buffer),
      },
      fields: "id",
    });

    io.emit("actualizar");
    res.json({ message: `Archivo subido como '${nuevoNombre}'` });
  } catch (err) {
    console.error("Error al subir a Drive:", err);
    res.status(500).json({ message: "Error al subir archivo a Google Drive" });
  }
});

// LISTAR FACTURAS
app.get("/api/facturas", async (req, res) => {
  try {
    const authClient = await auth.getClient();
    const drive = google.drive({ version: "v3", auth: authClient });

    const response = await drive.files.list({
      q: `'${DRIVE_FOLDER_ID}' in parents and mimeType='application/pdf' and trashed=false`,
      fields: "files(id, name)",
    });

    const files = response.data.files;

    const estructura = {};

    files.forEach(({ name, id }) => {
      const partes = name.match(/factura de (.+) (\w+) (\d{4})/i);
      if (!partes) return;

      const [, tipo, mes, year] = partes;
      if (!estructura[year]) estructura[year] = {};
      if (!estructura[year][mes]) estructura[year][mes] = [];

      estructura[year][mes].push({ name, id });
    });

    const resultado = Object.entries(estructura)
      .sort((a, b) => b[0] - a[0])
      .map(([year, meses]) => ({
        year,
        months: Object.entries(meses)
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([month, files]) => ({
            month,
            files: files.map(f => ({ name: f.name, id: f.id })),
          })),
      }));

    res.json(resultado);
  } catch (err) {
    console.error("Error al listar archivos:", err);
    res.status(500).json({ message: "Error al listar archivos" });
  }
});

// ELIMINAR FACTURA
app.delete("/api/facturas", async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ message: "Falta el ID del archivo" });

  try {
    const authClient = await auth.getClient();
    const drive = google.drive({ version: "v3", auth: authClient });

    await drive.files.delete({ fileId: id });

    io.emit("actualizar");
    res.json({ message: "Archivo eliminado correctamente" });
  } catch (err) {
    console.error("Error al eliminar archivo:", err);
    res.status(500).json({ message: "Error al eliminar archivo" });
  }
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
