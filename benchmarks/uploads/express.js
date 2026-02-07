import express from "express";
import multer from "multer";

// Memory storage to measure parsing/stream speed without disk IO bottleneck
// or DiskStorage for realism? User said "Disk write + memory stream"
// I'll use MemoryStorage to stress the runtime's stream handling.
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ size: req.file.size });
});

app.listen(PORT, () => {});
