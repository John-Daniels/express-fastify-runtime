import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SimpleJSONDB } from "./SimpleJSONDB.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "db_express.json");
const db = new SimpleJSONDB(DB_PATH);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

app.post("/todos", (req, res) => {
  db.push(req.body);
  res.json({ ok: true });
});

app.listen(PORT, () => {});
