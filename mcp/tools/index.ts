import { registerCryptoNewsTool } from "./cryptoNews.js";
import { registerCryptoQuotesTool } from "./cryptoQuotes.js";
import { registerGlobalMarketTool } from "./globalMarket.js";
import { registerRandomQuoteTool } from "./randomQuote.js";

export function registerTools() {
  registerCryptoNewsTool();
  registerCryptoQuotesTool();
  registerGlobalMarketTool();
  registerRandomQuoteTool();
}
