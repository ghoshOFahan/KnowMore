import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { auth } from "./auth.js";
import { toNodeHandler } from "better-auth/node";

// Import API routes and Socket initialization
import apiRoutes from "./routes/routes.js";
import { initSocket } from "./controllers/socket_controller.js";

import "./worker/analyzer.js";
export const app = express();
const httpServer = createServer(app);
const port: number = parseInt(process.env.PORT || "3001", 10);
const host = "0.0.0.0";
app.use(express.json()); // Required to parse req.body for REST endpoints
app.use(
  cors({
    origin: "https://knowmore.ahanghosh.site/",
    credentials: true,
  }),
);
app.use("/api/auth", toNodeHandler(auth));
app.use((req, res, next) => {
  console.log("Incoming:", req.method, req.url);
  next();
});
// Setup BullMQ Queue globally so controllers can push to it
const redisConnection = new Redis(process.env.REDIS_URL as string, {
  tls: { rejectUnauthorized: false },
});
export const analyticsQueue = new Queue("identity-analyzer", {
  connection: redisConnection,
});

// Mount the REST API
app.use("/api", apiRoutes);

app.get("/", (req, res) => {
  res.send(
    `<h1>hey there welcome to KnowMore! To go to site https://knowmore.ahanghosh.site/ </h1>`,
  );
});

// Mount the Socket.io Server
initSocket(httpServer, analyticsQueue);

httpServer.listen(port, host, () => {
  if (process.env.PORT) {
    console.log("Service is live and listening on port %d", port);
  } else {
    console.log("You can access the page locally at http://localhost:%d", port);
  }
});
