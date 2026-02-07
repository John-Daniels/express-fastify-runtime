import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "data.json");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const data = JSON.parse(readFileSync(DB_PATH, "utf-8"));

app.get("/todos", (req, res) => {
  res.json(data);
});

app.listen(PORT, () => {
  // console.log(`Express listening on ${PORT}`);
});
