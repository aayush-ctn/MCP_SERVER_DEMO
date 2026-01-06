import { z } from "zod";
import { mcpServer } from "../server.js";
import { apiRequest } from "../../services/apiClient.js";
import { MarketDataResponse } from "../../types/market.js";

export function registerGlobalMarketTool() {
  mcpServer.registerTool(
    "get_global_market",
    {
      description: "Get global crypto market data",
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
      const response = await apiRequest<MarketDataResponse>(
        "api/public-api/get-global-market-data"
      );

      if (!response?.data) {
        return {
          content: [{ type: "text", text: "❌ Failed to fetch market data" }],
        };
      }

      const d = response.data;
      let text = "";

      switch (view) {
        case "btc_dominance":
          text = `🟠 BTC Dominance: ${d.btc_dominance.toFixed(2)}%`;
          break;

        case "fear_and_greed":
          text = `😨 Fear & Greed Index: ${d.fear_and_greed_index}`;
          break;

        case "market_cap":
          text = `🌍 Market Cap: $${d.global_market.toLocaleString()}`;
          break;

        case "volume":
          text = `📊 24h Volume: $${d.global_volume.toLocaleString()}`;
          break;

        default:
          text = [
            "🌍 Global Crypto Market Summary",
            "",
            `BTC Dominance: ${d.btc_dominance.toFixed(2)}%`,
            `Fear & Greed Index: ${d.fear_and_greed_index}`,
            `Market Cap: $${d.global_market.toLocaleString()}`,
            `24h Volume: $${d.global_volume.toLocaleString()}`,
            `Updated: ${new Date(d.updated_at).toUTCString()}`,
          ].join("\n");
      }

      return {
        content: [{ type: "text", text }],
      };
    }
  );
}
