// server.ts - MCP Server with Streamable HTTP Transport
import express, { Request, Response } from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import "dotenv/config";

const app = express();
app.use(cors());
app.use(express.json());

const IXFI_API_BASE = process.env.BASE_API;
const USER_AGENT = "ixfi-app/1.0";

const TOKEN = process.env.IXFI_API_TOKEN;

// Create MCP server
const server = new McpServer({
  name: "simple-mcp",
  version: "1.0.0",
});


async function apiRequest<T>(path: string, options?: RequestInit): Promise<T | null> {
  const url = `${IXFI_API_BASE}${path}`
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
    Authorization: `Bearer ${TOKEN}`,
    token: TOKEN || ""
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

interface MarketData {
  _id: string;
  __v: number;
  btc_dominance: number;
  created_at: string;
  updated_at: string;
  fear_and_greed_index: number;
  global_market: number;
  global_volume: number;
}

interface MarketDataResponse {
  data: MarketData;
}

server.registerTool(
  "get_global_market",
  {
    description: "Get global crypto market data in different views",
    inputSchema: {
      view: z.enum([
        "summary",
        "btc_dominance",
        "fear_and_greed",
        "market_cap",
        "volume",
      ]),
    },
  },
  async ({ view }) => {
    const response = await apiRequest<MarketDataResponse>('api/public-api/get-global-market-data');

    if (!response || !response.data) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to get market data`,
          },
        ],
      };
    }

    const data = response.data;

    let text = "";

    switch (view) {
      case "btc_dominance":
        text = `🟠 BTC Dominance: ${data.btc_dominance.toFixed(2)}%`;
        break;

      case "fear_and_greed":
        text = `😨 Fear & Greed Index: ${data.fear_and_greed_index}`;
        break;

      case "market_cap":
        text = `🌍 Global Market Cap: $${data.global_market.toLocaleString()}`;
        break;

      case "volume":
        text = `📊 Global Volume (24h): $${data.global_volume.toLocaleString()}`;
        break;

      case "summary":
      default:
        text = [
          `🌍 Global Crypto Market Summary`,
          ``,
          `BTC Dominance: ${data.btc_dominance.toFixed(2)}%`,
          `Fear & Greed Index: ${data.fear_and_greed_index}`,
          `Market Cap: $${data.global_market.toLocaleString()}`,
          `24h Volume: $${data.global_volume.toLocaleString()}`,
          `Last Updated: ${new Date(data.updated_at).toUTCString()}`,
        ].join("\n");
        break;
    }

    return {
      content: [
        {
          type: "text",
          text,
        },
      ],
    };
  }
);

// Register tool: add_numbers
server.tool(
  "add_numbers",
  "Add two numbers together",
  {
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  },
  async ({ a, b }) => {
    const result = a + b;
    return {
      content: [
        {
          type: "text",
          text: `${a} + ${b} = ${result}`,
        },
      ],
    };
  }
);

// Register tool: get_random_quote
server.tool(
  "get_random_quote",
  "Get a random inspirational quote",
  {},
  async () => {
    const quotes = [
      "The only way to do great work is to love what you do. - Steve Jobs",
      "Innovation distinguishes between a leader and a follower. - Steve Jobs",
      "Life is what happens when you're busy making other plans. - John Lennon",
      "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
      "It is during our darkest moments that we must focus to see the light. - Aristotle",
    ];
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    return {
      content: [
        {
          type: "text",
          text: quote,
        },
      ],
    };
  }
);

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Authorization middleware
app.use("/mcp", (req: Request, res: Response, next) => {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Missing Bearer token" },
      id: null,
    });
  }

  const token = auth.slice(7);

  if (token !== process.env.MCP_TOKEN) {
    return res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Invalid token" },
      id: null,
    });
  }

  next();
});


// MCP endpoint with Streamable HTTP
app.post("/mcp", async (req: Request, res: Response) => {
  console.log("MCP request received");
  
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId];
      console.log("Reusing transport for session:", sessionId);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      const newSessionId = randomUUID();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
      });
      
      transports[newSessionId] = transport;
      await server.connect(transport);
      console.log("Created new transport with session:", newSessionId);
    } else {
      return res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32600,
          message: "Invalid request: missing session or not an initialize request",
        },
        id: null,
      });
    }

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    server: "simple-mcp",
    transport: "streamable-http",
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "Simple MCP Server",
    version: "1.0.0",
    transport: "streamable-http",
    tools: ["add_numbers", "get_random_quote"],
    endpoints: {
      mcp: "/mcp (POST - MCP protocol endpoint)",
      health: "/health (GET - health check)",
    },
  });
});

// Start server
const PORT = parseInt(process.env.PORT || "10000", 10);
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`🚀 MCP Server running on http://${HOST}:${PORT}`);
  console.log(`📡 MCP endpoint: http://${HOST}:${PORT}/mcp`);
  console.log(`❤️  Health check: http://${HOST}:${PORT}/health`);
  console.log(`🔧 Transport: Streamable HTTP`);
});