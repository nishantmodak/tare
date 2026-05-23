import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "tare-live-example",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: "echo",
      description: "Echo a short message back to the caller.",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Message to echo."
          }
        },
        required: ["message"]
      }
    },
    {
      name: "summarize_text",
      description: "Summarize a small block of plain text for a quick local MCP smoke test.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Plain text to summarize."
          },
          maxSentences: {
            type: "number",
            description: "Maximum number of sentences to return."
          }
        },
        required: ["text"]
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false
      }
    }
  ]
}));

await server.connect(new StdioServerTransport());
