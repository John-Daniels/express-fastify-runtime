import { createApp } from "../../dist/index.js";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

const app = createApp();
const PORT = Number(process.env.PORT) || 3003;

app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ size: req.file.size });
});

app.listen(PORT, () => {});
