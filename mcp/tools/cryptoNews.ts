import { z } from "zod";
import { mcpServer } from "../server.js";
import { apiRequest } from "../../services/apiClient.js";
import { NewsResponse } from "../../types/news.js";

export function registerCryptoNewsTool() {
  mcpServer.registerTool(
    "get_crypto_news",
    {
      description: "Get cryptocurrency news",
      inputSchema: {
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        per_page_limit: z.number().min(1).max(100).default(10),
        filter_val: z.enum(["all", "positive", "negative", "neutral"]).default("all"),
        coins: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      const response = await apiRequest<NewsResponse>(
        "v1/news-links/news-list/1",
        { method: "POST", body: JSON.stringify(args) }
      );

      if (!response?.data?.docs?.length) {
        return { content: [{ type: "text", text: "No news found" }] };
      }

      const text = response.data.docs
        .map((n, i) => `${i + 1}. ${n.title}`)
        .join("\n");

      return { content: [{ type: "text", text }] };
    }
  );
}
