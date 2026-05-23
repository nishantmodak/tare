import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

if (process.env.FAKE_MCP_PID_FILE) {
  writeFileSync(process.env.FAKE_MCP_PID_FILE, String(process.pid));
}

if (process.argv.includes("--delay")) {
  await sleep(60_000);
}

const server = new Server(
  { name: "fake-stdio", version: "1.0.0" },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, (request) => {
  if (request.params?.cursor === "page-2") {
    return {
      tools: [
        {
          name: "create_issue",
          description: "Create an issue in the tracker",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string" }
            }
          }
        }
      ]
    };
  }

  return {
    tools: [
      {
        name: "search_code",
        description: "Search code in a repository",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" }
          }
        }
      }
    ],
    nextCursor: "page-2"
  };
});

await server.connect(new StdioServerTransport());
