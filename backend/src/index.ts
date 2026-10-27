import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { auth } from "./auth.js";
import { db } from "./db/db.js";
import { sql } from "drizzle-orm";
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
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  }),
);
app.use("/api/auth", toNodeHandler(auth));
app.use((req, res, next) => {
  console.log("Incoming:", req.method, req.url);
  next();
});
// Setup BullMQ Queue globally so controllers can push to it
const redisConnection = new Redis(process.env.REDIS_URL as string);
export const analyticsQueue = new Queue("identity-analyzer", {
  connection: redisConnection,
});

// Keep this endpoint independent of auth so the proxy can check dependencies.
app.get("/health", async (_req, res) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([redisConnection.ping(), db.execute(sql`select 1`)]),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Health check timed out")), 3000);
      }),
    ]);
    res.status(200).json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "unhealthy" });
  } finally {
    if (timer) clearTimeout(timer);
  }
});

// Mount the REST API
app.use("/api", apiRoutes);

app.get("/", (_req, res) => {
  res.send(
    `<h1>KnowMore API is running. Visit ${process.env.FRONTEND_URL ?? "http://localhost:3000"}</h1>`,
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
