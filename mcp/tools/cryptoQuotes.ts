import { z } from "zod";
import { mcpServer } from "../server.js";

export function registerCryptoQuotesTool() {
  mcpServer.registerTool(
    "get_crypto_quotes",
    {
      description: "Get crypto buy/sell quotes",
      inputSchema: {
        vendors: z.array(z.string()),
        crypto_currency: z.string(),
        fiat_currency: z.string(),
        from_amount: z.string(),
        is_buy_sell: z.enum(["BUY", "SELL"]),
        selected_country_code: z.string().length(2),
      },
    },
    async (args) => {
      const response = await fetch(
        "https://api.zen-ex.com/api/front/gateway/get-rates",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        }
      );

      if (!response.ok) {
        return {
          content: [{ type: "text", text: "❌ Failed to fetch quotes" }],
        };
      }

      const result = await response.json();

      if (!result?.data?.length) {
        return {
          content: [{ type: "text", text: "No quotes available" }],
        };
      }

      const text = result.data
        .map(
          (q: any) =>
            `• ${q.provider.toUpperCase()}
  Amount: ${q.amount}
  Rate: ${q.rate}
  Available: ${q.can_process ? "✅ Yes" : "❌ No"}`
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `💱 Crypto Quotes (${args.crypto_currency}/${args.fiat_currency})\n\n${text}`,
          },
        ],
      };
    }
  );
}
