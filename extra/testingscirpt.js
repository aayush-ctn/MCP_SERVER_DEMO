import { GoogleGenerativeAI } from "@google/generative-ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import "dotenv/config";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function runMcpWithApi() {
    // Use the Client-side transport class with the .js import above
    const transport = new StreamableHTTPClientTransport(
        new URL("https://mcp-server-demo-8irq.onrender.com/mcp")
    );

    const mcpClient = new Client(
        { name: "api-test-client", version: "1.0.0" },
        { capabilities: {} }
    );

    try {
        console.log("🔗 Connecting to Render MCP server...");
        await mcpClient.connect(transport);
        console.log("✅ Connected!");

        // A more aggressive sanitizer for Gemini's strict validator
        function sanitizeSchemaForGemini(schema) {
            if (typeof schema !== 'object' || schema === null) return schema;

            const newSchema = Array.isArray(schema) ? [] : {};

            // List of keys to strictly remove for Gemini compatibility
            const forbiddenKeys = [
                '$schema',
                'additionalProperties',
                'title',
                'description_internal' // Some MCP servers use this
            ];

            for (const key in schema) {
                if (forbiddenKeys.includes(key)) continue;

                // Recursively clean nested objects and arrays
                newSchema[key] = sanitizeSchemaForGemini(schema[key]);
            }

            return newSchema;
        }

        const { tools: mcpTools } = await mcpClient.listTools();



        const functionDeclarations = mcpTools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: sanitizeSchemaForGemini(tool.inputSchema),
        }));

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            tools: [{ functionDeclarations }],
        });

        const chat = model.startChat();
        const result = await chat.sendMessage("What is the current crypto fear and greed index?");
        const call = result.response.functionCalls()?.[0];

        if (call) {
            console.log(`🛠️ Executing: ${call.name}`);
            const toolResult = await mcpClient.callTool({
                name: call.name,
                arguments: call.args,
            });

            const finalResult = await chat.sendMessage([{
                functionResponse: {
                    name: call.name,
                    response: { content: toolResult.content },
                },
            }]);

            console.log("🤖 Gemini:", finalResult.response.text());
        }
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

runMcpWithApi();