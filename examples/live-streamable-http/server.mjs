import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const port = Number(process.env.PORT ?? 33221);
const transport = new StreamableHTTPServerTransport({
  enableJsonResponse: true,
  sessionIdGenerator: randomUUID
});

const mcpServer = new Server(
  {
    name: "tare-live-http-example",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: "search_docs",
      description: "Search local documentation by keyword for a Streamable HTTP MCP smoke test.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query."
          }
        },
        required: ["query"]
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false
      }
    },
    {
      name: "read_doc",
      description: "Read a single documentation page by slug.",
      inputSchema: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Documentation page slug."
          }
        },
        required: ["slug"]
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false
      }
    }
  ]
}));

await mcpServer.connect(transport);

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const httpServer = createServer(async (request, response) => {
  if (!request.url?.startsWith("/mcp")) {
    response.writeHead(404).end("Not found");
    return;
  }

  try {
    const body = request.method === "POST" ? await readJsonBody(request) : undefined;
    await transport.handleRequest(request, response, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    response.writeHead(500, { "content-type": "text/plain" }).end(message);
  }
});

httpServer.listen(port, "127.0.0.1", () => {
  console.error(`tare-live-http-example listening on http://127.0.0.1:${port}/mcp`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    httpServer.close(() => {
      process.exit(0);
    });
  });
}
