import { createApp } from "../../dist/index.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SimpleJSONDB } from "./SimpleJSONDB.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "db_runtime.json");
const db = new SimpleJSONDB(DB_PATH);

const app = createApp();
const PORT = Number(process.env.PORT) || 3003;

app.use(import("express").then((m) => m.default.json())); // Use express.json

app.post("/todos", (req, res) => {
  db.push(req.body);
  res.json({ ok: true });
});

app.listen(PORT, () => {});
