import readline from "readline";
import "dotenv/config";
import crypto from "crypto";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_BASE = process.env.MCP_BASE || "http://localhost:3000";
const API_KEY = process.env.MCP_SERVER_API_KEY;
const SECRET_KEY = process.env.MCP_SERVER_SECRET_KEY;

// Model Configuration
const MODEL_CONFIGS = {
    CHATGPT: {
        endpoint: process.env.BLOCKVERSE_API_URL,
        models: {
            "gpt-4o": "gpt-4o",
            "gpt-4o-mini": "gpt-4o-mini",
            "gpt-4-turbo": "gpt-4-turbo-preview"
        },
        defaultModel: "gpt-4o-mini"
    },
    GEMINI: {
        endpoint: process.env.GEMINI_API_URL,
        models: {
            "gemini-pro": "gemini-1.5-pro",
            "gemini-flash": "gemini-1.5-flash",
            "gemini-exp": "gemini-2.0-flash-exp",
            "gemini-3-flash-preview": "gemini-3-flash-preview",
            "gemini-2.5-flash": "gemini-2.5-flash"
        },
        defaultModel: "gemini-1.5-flash"
    }
};

// Current provider - change this to switch between providers
let CURRENT_PROVIDER = "CHATGPT"; // Options: "CHATGPT" or "GEMINI"
let CURRENT_MODEL = MODEL_CONFIGS[CURRENT_PROVIDER].defaultModel;

const transport = new StreamableHTTPClientTransport(new URL(MCP_BASE));
const mcpClient = new Client(
    { name: "mcp-test-client", version: "1.0.0" },
    { capabilities: {} }
);

let isConnected = false;

// Generate HMAC signature
function generateSignature(method, path, body, timestamp, secretKey) {
    const message = `${method}|${path}|${timestamp}|${body}`;
    const signature = crypto
        .createHmac("sha256", secretKey)
        .update(message, "utf8")
        .digest("hex");
    return signature;
}

// Sanitize schema for Gemini (removes forbidden keys)
function sanitizeSchemaForGemini(schema) {
    if (typeof schema !== 'object' || schema === null) return schema;

    const newSchema = Array.isArray(schema) ? [] : {};
    const forbiddenKeys = [
        '$schema',
        'additionalProperties',
        'title',
        'description_internal'
    ];

    for (const key in schema) {
        if (forbiddenKeys.includes(key)) continue;
        newSchema[key] = sanitizeSchemaForGemini(schema[key]);
    }

    return newSchema;
}

// Prepare tools based on provider
function prepareTools(mcpTools, provider) {
    return mcpTools.map(tool => {
        const parameters = provider === "GEMINI" 
            ? sanitizeSchemaForGemini(tool.inputSchema)
            : tool.inputSchema;

        return {
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: parameters,
        };
    });
}

// Generate UUIDs
function generateUUID() {
    return crypto.randomUUID().replace(/-/g, '');
}

// Connect to MCP server
async function connectToMCP() {
    if (!isConnected) {
        console.log("Connecting to MCP server...");
        await mcpClient.connect(transport);
        isConnected = true;
        console.log("Connected to MCP server!\n");
    }
}

// Execute MCP tool
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

// Make API call
async function callAIAPI(requestBody) {
    const config = MODEL_CONFIGS[CURRENT_PROVIDER];
    const endpoint = config.endpoint;

    if (!endpoint) {
        throw new Error(`API endpoint not configured for ${CURRENT_PROVIDER}`);
    }

    const bodyString = JSON.stringify(requestBody);
    const url = new URL(endpoint);
    const path = url.pathname;
    const method = "POST";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = generateSignature(method, path, bodyString, timestamp, SECRET_KEY);

    const response = await fetch(endpoint, {
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

// Main conversation handler
async function runMCPClient(userInput, sessionUUID = null, userUUID = null) {
    try {
        await connectToMCP();
        const { tools: mcpTools } = await mcpClient.listTools();
        const tools = prepareTools(mcpTools, CURRENT_PROVIDER);

        const currentSessionUUID = sessionUUID || generateUUID();
        const currentUserUUID = userUUID || generateUUID();

        // Initial request
        const requestBody = {
            input: userInput,
            model: CURRENT_MODEL,
            source: "mcp_server",
            session_uuid: currentSessionUUID,
            user_uuid: currentUserUUID,
            tools: tools
        };

        console.log(`\nUsing: ${CURRENT_PROVIDER} - ${CURRENT_MODEL}`);
        console.log("Sending message to API...\n");

        let result = await callAIAPI(requestBody);

        // Function calling loop
        let iteration = 0;
        const maxIterations = 10;

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

            // Send function results back
            console.log("\n Sending function results back to API...\n");

            const followUpRequest = {
                input: JSON.stringify(functionResults),
                model: CURRENT_MODEL,
                source: "mcp_server",
                session_uuid: currentSessionUUID,
                user_uuid: currentUserUUID,
                tools: tools
            };

            result = await callAIAPI(followUpRequest);
        }

        if (iteration >= maxIterations) {
            console.warn("Max iterations reached. Stopping to prevent infinite loop.");
        }

        // Display final response
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

// Switch provider
function switchProvider(provider, model = null) {
    if (!MODEL_CONFIGS[provider]) {
        console.log(`Invalid provider. Available: ${Object.keys(MODEL_CONFIGS).join(", ")}`);
        return false;
    }

    CURRENT_PROVIDER = provider;
    CURRENT_MODEL = model || MODEL_CONFIGS[provider].defaultModel;
    
    console.log(`\n✓ Switched to ${provider} using model: ${CURRENT_MODEL}\n`);
    return true;
}

// List available models
function listModels() {
    console.log("\n Available Models:");
    console.log("━".repeat(60));
    
    for (const [provider, config] of Object.entries(MODEL_CONFIGS)) {
        console.log(`\n ${provider}:`);
        for (const [key, value] of Object.entries(config.models)) {
            const current = (provider === CURRENT_PROVIDER && value === CURRENT_MODEL) ? " (current)" : "";
            console.log(`   • ${key}: ${value}${current}`);
        }
    }
    console.log("\n" + "━".repeat(60) + "\n");
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let currentSession = {
    sessionUUID: null,
    userUUID: null
};

function loop() {
    rl.question("\nYOU > ", async (input) => {
        // Handle commands
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

        if (input === "models") {
            listModels();
            loop();
            return;
        }

        // Switch provider: "use chatgpt" or "use gemini"
        if (input.startsWith("use ")) {
            const parts = input.split(" ");
            const provider = parts[1].toUpperCase();
            const model = parts[2]; // Optional specific model
            
            if (switchProvider(provider, model)) {
                currentSession = { sessionUUID: null, userUUID: null };
                console.log("Session reset for new provider.");
            }
            loop();
            return;
        }
        
        try {
            const result = await runMCPClient(
                input,
                currentSession.sessionUUID,
                currentSession.userUUID
            );

            currentSession.sessionUUID = result.sessionUUID;
            currentSession.userUUID = result.userUUID;

        } catch (error) {
            console.log("\nERROR >", error.message, "\n");
        }
        
        loop();
    });
}

// Initialize
async function init() {
    console.log("╔════════════════════════════════════════╗");
    console.log("║   MCP Client - Multi-Model Support     ║");
    console.log("╚════════════════════════════════════════╝\n");
    
    try {
        await connectToMCP();
    } catch (error) {
        console.error("Failed to connect to MCP server:", error.message);
        process.exit(1);
    }

    console.log(`Current Provider: ${CURRENT_PROVIDER}`);
    console.log(`Current Model: ${CURRENT_MODEL}\n`);
    
    console.log("Commands:");
    console.log("  • Type your message to chat");
    console.log("  • Type 'models' to list available models");
    console.log("  • Type 'use chatgpt' to switch to ChatGPT");
    console.log("  • Type 'use gemini' to switch to Gemini");
    console.log("  • Type 'use chatgpt gpt-4o' to use specific model");
    console.log("  • Type 'reset' to start a new conversation");
    console.log("  • Type 'exit' to quit");

    loop();
}

init();