/**
 * Uploads benchmark: fast(expressApp) — same app as express.js (multer).
 * Load runtime first so Router is patched before Express (best practice for fast()).
 */
import "../../dist/index.js";
import express from "express";
import multer from "multer";
import { fast } from "../../dist/index.js";

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = Number(process.env.PORT) || 3004;

app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ size: req.file.size });
});

const fastApp = fast(app);
const server = fastApp.server;
server.listen(PORT, () => {});

if (process.env.BENCH_AUTO_CLOSE !== "1") {
  process.on("SIGINT", () => server.close());
}
