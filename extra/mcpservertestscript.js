import readline from "readline";
import "dotenv/config";
import crypto from "crypto";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_BASE = process.env.MCP_BASE || "http://localhost:3000";
const API_KEY = process.env.MCP_SERVER_API_KEY;
const SECRET_KEY = process.env.MCP_SERVER_SECRET_KEY;
//const API_ENDPOINT = process.env.BLOCKVERSE_API_URL;
const API_ENDPOINT = process.env.GEMINI_API_URL;

const transport = new StreamableHTTPClientTransport(
    new URL(MCP_BASE)
);

const mcpClient = new Client(
    { name: "mcp-test-client", version: "1.0.0" },
    { capabilities: {} }
);

// Track connection status
let isConnected = false;

// Generate HMAC signature with correct format
function generateSignature(method, path, body, timestamp, secretKey) {
    const message = `${method}|${path}|${timestamp}|${body}`;
    const signature = crypto
        .createHmac("sha256", secretKey)
        .update(message, "utf8")
        .digest("hex");

    return signature;
}

// Add the sanitizeSchemaForGemini function before the runMCPClient function
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

// Generate UUIDs
function generateUUID() {
    return crypto.randomUUID().replace(/-/g, '');
}

// Connect to MCP server once
async function connectToMCP() {
    if (!isConnected) {
        console.log("Connecting to MCP server...");
        await mcpClient.connect(transport);
        isConnected = true;
        console.log("Connected to MCP server!\n");
    }
}

// Execute MCP tool and return result
async function executeMCPTool(toolName, args) {
    try {
        console.log(`Executing tool: ${toolName}`);
        console.log(`Arguments:`, JSON.stringify(args, null, 2));

        const result = await mcpClient.callTool({
            name: toolName,
            arguments: args
        });

        console.log(`Tool result:`, JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        console.error(`Error executing tool ${toolName}:`, error.message);
        return { error: error.message };
    }
}

// Make API call to ChatGPT
async function callChatGPTAPI(requestBody) {
    const bodyString = JSON.stringify(requestBody);
    const url = new URL(API_ENDPOINT);
    const path = url.pathname;
    const method = "POST";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = generateSignature(method, path, bodyString, timestamp, SECRET_KEY);

    const response = await fetch(API_ENDPOINT, {
        method: method,
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": API_KEY,
            "X-Timestamp": timestamp,
            "X-Signature": signature,
        },
        body: bodyString
    });

    const responseText = await response.text();

    if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}\nResponse: ${responseText}`);
    }

    return JSON.parse(responseText);
}

// Main function to handle conversation with function calling
async function runMCPClient(userInput, sessionUUID = null, userUUID = null) {
    try {
        await connectToMCP();
        const { tools: mcpTools } = await mcpClient.listTools();
        const tools = mcpTools.map(tool => ({
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: sanitizeSchemaForGemini(tool.inputSchema),
        }));

        const currentSessionUUID = sessionUUID || generateUUID();
        const currentUserUUID = userUUID || generateUUID();

        // Initial request body
        const requestBody = {
            input: userInput,
            model: "gemini-3-flash-preview",
            source: "mcp_server",
            session_uuid: currentSessionUUID,
            user_uuid: currentUserUUID,
            tools: tools
        };

        console.log("Sending message to API...\n");

        // Make initial API call
        let result = await callChatGPTAPI(requestBody);

        // Handle function calling loop
        let iteration = 0;
        const maxIterations = 10; // Prevent infinite loops

        while (result.is_function_call && iteration < maxIterations) {
            iteration++;
            console.log(`\n Function call detected (iteration ${iteration})`);
            console.log(`   Functions to execute: ${result.json_response.length}\n`);

            // Execute all requested functions
            const functionResults = [];
            for (const funcCall of result.json_response) {
                const args = JSON.parse(funcCall.arguments);
                const toolResult = await executeMCPTool(funcCall.name, args);

                functionResults.push({
                    call_id: funcCall.call_id,
                    name: funcCall.name,
                    result: toolResult
                });
            }

            // Send function results back to API
            console.log("\n Sending function results back to API...\n");

            const followUpRequest = {
                input: JSON.stringify(functionResults), // Send results as input
                model: "gemini-3-flash-preview",
                source: "mcp_server",
                session_uuid: currentSessionUUID, // Keep same session
                user_uuid: currentUserUUID, // Keep same user
                tools: tools
            };

            result = await callChatGPTAPI(followUpRequest);
        }

        if (iteration >= maxIterations) {
            console.warn("Max iterations reached. Stopping to prevent infinite loop.");
        }

        // Return final text response
        console.log("\n Final Response:");
        console.log("━".repeat(60));
        console.log(result.md_response || "No response text");
        console.log("━".repeat(60));

        console.log("\n Token Usage:");
        console.log(`   Input: ${result.modality_total_input_token}`);
        console.log(`   Output: ${result.modality_total_output_token}`);
        console.log(`   Total: ${result.modality_total_token}`);

        return {
            response: result.md_response,
            sessionUUID: currentSessionUUID,
            userUUID: currentUserUUID,
            fullResult: result
        };

    } catch (error) {

        console.error("Error:", error.message);
        throw error;
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Store session info for continuous conversation
let currentSession = {
    sessionUUID: null,
    userUUID: null
};

function loop() {
    rl.question("\nYOU > ", async (input) => {
        if (input === "exit") {
            rl.close();
            process.exit(0);
        }

        if (input === "reset") {
            currentSession = { sessionUUID: null, userUUID: null };
            console.log("Session reset. Starting new conversation.\n");
            loop();
            return;
        }

        try {
            const result = await runMCPClient(
                input,
                currentSession.sessionUUID,
                currentSession.userUUID
            );

            // Store session info for next message
            currentSession.sessionUUID = result.sessionUUID;
            currentSession.userUUID = result.userUUID;

        } catch (error) {
            console.log(error)
            console.log("\nERROR >", error.message, "\n");
        }

        loop();
    });
}

// Initialize
async function init() {
    console.log("╔════════════════════════════════════════╗");
    console.log("║     MCP Client with ChatGPT API        ║");
    console.log("╚════════════════════════════════════════╝\n");
    // Connect to MCP server at startup
    try {
        await connectToMCP();
    } catch (error) {
        console.error("Failed to connect to MCP server:", error.message);
        process.exit(1);
    }

    console.log("Commands:");
    console.log("  • Type your message to chat");
    console.log("  • Type 'reset' to start a new conversation");
    console.log("  • Type 'exit' to quit");

    loop();
}

init();