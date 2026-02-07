import express from "express";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "10mb" }));

app.post("/", (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {});
