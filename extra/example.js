import readline from "readline";
import fetch from "node-fetch";
import OpenAI from "openai";
 
const openai = new OpenAI({
    apiKey: ""
});
 
const MCP_BASE = "http://localhost:3000";
const API_KEY = "dev-secret";
 
// ------------------------------------------------
// CONVERSATION MEMORY
// ------------------------------------------------
const conversation = [
  {
    role: "system",
    content: `You are a crypto risk analyst AI.
 
RULES:
- NEVER move funds
- NEVER sign transactions
- Use backend tools for real data
- Ask for missing inputs before calling tools
- Explain results clearly`
  }
];
 
// ------------------------------------------------
// TOOL DEFINITIONS (AI VIEW)
// ------------------------------------------------
const tools = [
  {
    type: "function",
    function: {
      name: "get_wallet_overview",
      description: "Fetch wallet balances and risk overview",
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_transaction_risk",
      description: "Analyze fraud risk for a transaction hash",
      parameters: {
        type: "object",
        properties: {
          txHash: { type: "string" }
        },
        required: ["txHash"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "simulate_token_transfer",
      description: "Simulate token transfer without execution",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          token: { type: "string" },
          amount: { type: "string" }
        },
        required: ["from", "to", "token", "amount"]
      }
    }
  }
];
 
// ------------------------------------------------
// TOOL → REST MAPPING
// ------------------------------------------------
async function callTool(name, args) {
  const map = {
    get_wallet_overview: {
      url: "/wallet/overview"
    },
    analyze_transaction_risk: {
      url: "/tx/risk"
    },
    simulate_token_transfer: {
      url: "/tx/simulate"
    }
  };
 
  const res = await fetch(MCP_BASE + map[name].url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY
    },
    body: JSON.stringify(args)
  });
 
  return res.json();
}
 
// ------------------------------------------------
// AGENT LOOP
// ------------------------------------------------
async function handleUserInput(input) {
  conversation.push({ role: "user", content: input });
 
  const first = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: conversation,
    tools,
    tool_choice: "auto"
  });
 
  const choice = first.choices[0];
  console.log(choice)
 
  if (choice.finish_reason === "tool_calls") {
    const tool = choice.message.tool_calls[0];
    const result = await callTool(
      tool.function.name,
      JSON.parse(tool.function.arguments)
    );
 
    conversation.push(choice.message);
    conversation.push({
      role: "tool",
      tool_call_id: tool.id,
      content: JSON.stringify(result)
    });
 
    const final = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: conversation
    });
 
    conversation.push(final.choices[0].message);
    return final.choices[0].message.content;
  }
 
  conversation.push(choice.message);
  return choice.message.content;
}
 
// ------------------------------------------------
// CLI
// ------------------------------------------------
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
 
console.log("\nCrypto AI Agent (REST MCP)\n");
 
function loop() {
  rl.question("YOU > ", async (input) => {
    if (input === "exit") process.exit(0);
    const reply = await handleUserInput(input);
    console.log("AI  >", reply, "\n");
    loop();
  });
}
 
loop();