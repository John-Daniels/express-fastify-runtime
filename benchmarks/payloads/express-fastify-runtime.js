import { createApp } from "../../dist/index.js";
import express from "express";

const app = createApp();
const PORT = Number(process.env.PORT) || 3003;

app.use(express.json({ limit: "10mb" }));

app.post("/", (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {});
