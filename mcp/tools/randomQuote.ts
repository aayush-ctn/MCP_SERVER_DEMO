import { mcpServer } from "../server.js";

export function registerRandomQuoteTool() {
  mcpServer.registerTool(
    "get_random_quote",
    {
      description: "Get a random inspirational quote",
      inputSchema: {},
    },
    async () => {
      const quotes = [
        "The only way to do great work is to love what you do. — Steve Jobs",
        "Innovation distinguishes between a leader and a follower. — Steve Jobs",
        "Life is what happens when you're busy making other plans. — John Lennon",
        "The future belongs to those who believe in the beauty of their dreams. — Eleanor Roosevelt",
        "It is during our darkest moments that we must focus to see the light. — Aristotle",
      ];

      const quote = quotes[Math.floor(Math.random() * quotes.length)];

      return {
        content: [{ type: "text", text: quote }],
      };
    }
  );
}
