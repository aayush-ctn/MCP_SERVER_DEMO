import express from "express";
import cors from "cors";
import { handleMcp } from "./mcp/transport.js";
import { registerTools } from "./mcp/tools/index.js";

registerTools();

export const app = express();

app.use(cors({
  origin: "*",
  exposedHeaders: ["mcp-session-id", "mcp-protocol-version"],
}));

app.use(express.json());

app.post("/mcp", (req, res) => handleMcp(req, res, req.body));
app.get("/mcp", (req, res) => handleMcp(req, res));

app.get("/health", (_, res) =>
  res.json({ status: "healthy", transport: "streamable-http" })
);
