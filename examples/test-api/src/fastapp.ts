import morgan from "morgan";
import { fast } from "../../../src/index";
import express from "express";
import router from "./router";

const app = express();

app.use(express.json());

app.use(morgan("dev"));
app.use("/api", router);

app.get("/fail", () => {
  throw new Error("Unexpected error");
});

// Express 5: thrown errors are passed to 4-arg error middleware automatically
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err.message });
});

const fastApp = fast(app, {
  fastify: {
    logger: true,
  },
});
await fastApp.ready();

const server = fastApp.server;
// You can attach WebSockets, Socket.IO, etc. to server, then start with server.listen()
// (server.listen is wrapped to use Fastify's listen flow so 404 and internals work).

import { Server } from "socket.io";

const io = new Server(server);
io.on("connection", (socket) => {
  console.log("a user connected", socket.id);

  socket.on("message", (message: string) => {
    console.log("a message received", message);
    socket.emit("message", "Hello from server");
  });

  socket.on("disconnect", () => {
    console.log("a user disconnected", socket.id);
  });

  socket.on("error", (error: Error) => {
    console.log("an error occurred", error);
  });
});

server.listen(9001, () => {
  console.log("Server is running on port 9001");
});
