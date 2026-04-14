import "../../dist/index.js";
import express from "express";
import { fast } from "../../dist/index.js";

const app = express();
const PORT = Number(process.env.PORT) || 3004;

app.use(express.json({ limit: "10mb" }));
app.post("/", (req, res) => {
  res.json({ ok: true });
});

const fastApp = fast(app);
fastApp.server.listen(PORT, () => {});

if (process.env.BENCH_AUTO_CLOSE !== "1") {
  process.on("SIGINT", () => fastApp.server.close());
}
