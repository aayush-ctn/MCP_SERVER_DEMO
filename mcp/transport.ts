import { randomUUID } from "crypto";
import { StreamableHTTPServerTransport } from
  "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from
  "@modelcontextprotocol/sdk/types.js";
import { mcpServer } from "./server.js";

const transports: Record<string, StreamableHTTPServerTransport> = {};

export async function handleMcp(req: any, res: any, body?: any) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport = sessionId && transports[sessionId];

  if (!transport && isInitializeRequest(body)) {
    const newId = randomUUID();
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newId,
    });

    transports[newId] = transport;
    await mcpServer.connect(transport);
    res.setHeader("mcp-session-id", newId);
    console.log(`✅ MCP session: ${newId}`);
  }

  if (!transport) {
    return res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Invalid session" },
      id: null,
    });
  }

  await transport.handleRequest(req, res, body);
}
