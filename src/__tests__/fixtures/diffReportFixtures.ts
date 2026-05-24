import type { TareReport } from "../../analysis/types.js";

const base: TareReport = {
  version: "0.1.0",
  generatedAt: "2026-01-01T00:00:00.000Z",
  summary: {
    configFiles: 1,
    servers: 2,
    tools: 3,
    estimatedTokens: { claude: 2000, openaiCl100k: 1800 },
    contextWindows: {
      "64000": { claude: 3, openaiCl100k: 3 },
      "128000": { claude: 2, openaiCl100k: 1 },
      "200000": { claude: 1, openaiCl100k: 1 }
    },
    insufficientServers: 0
  },
  servers: [
    {
      name: "github",
      sourceConfigPath: "/repo/.mcp.json",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      toolCount: 2,
      estimatedTokens: { claude: 1400, openaiCl100k: 1260 },
      inspectionMode: "live",
      confidence: "high",
      warnings: [],
      tools: [
        {
          name: "search_code",
          description: "Search code.",
          estimatedTokens: { claude: 700, openaiCl100k: 650 },
          hasInputSchema: true
        },
        {
          name: "list_repos",
          description: "List repositories.",
          estimatedTokens: { claude: 400, openaiCl100k: 360 },
          hasInputSchema: true
        }
      ]
    },
    {
      name: "linear",
      sourceConfigPath: "/repo/.mcp.json",
      transport: "stdio",
      command: "linear-mcp",
      toolCount: 1,
      estimatedTokens: { claude: 600, openaiCl100k: 540 },
      inspectionMode: "live",
      confidence: "high",
      warnings: [],
      tools: [
        {
          name: "list_issues",
          description: "List issues.",
          estimatedTokens: { claude: 450, openaiCl100k: 410 },
          hasInputSchema: true
        }
      ]
    }
  ],
  overlapClusters: [
    {
      label: "search intent",
      score: 0.82,
      reason: "tools share a search intent",
      signals: ["intent-heuristic"],
      tools: [
        { server: "github", name: "search_code" },
        { server: "linear", name: "list_issues" }
      ],
      recommendation: "Prefer one search surface per workflow."
    }
  ],
  recommendations: [],
  warnings: [],
  metadata: { staticOnly: false, inspectionMode: "live default" }
};

const head: TareReport = {
  version: "0.2.0",
  generatedAt: "2026-01-02T00:00:00.000Z",
  summary: {
    configFiles: 1,
    servers: 3,
    tools: 6,
    estimatedTokens: { claude: 3800, openaiCl100k: 3420 },
    contextWindows: {
      "64000": { claude: 6, openaiCl100k: 5 },
      "128000": { claude: 3, openaiCl100k: 3 },
      "200000": { claude: 2, openaiCl100k: 2 }
    },
    insufficientServers: 0
  },
  servers: [
    {
      name: "github",
      sourceConfigPath: "/repo/.mcp.json",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      toolCount: 3,
      estimatedTokens: { claude: 1900, openaiCl100k: 1710 },
      inspectionMode: "live",
      confidence: "high",
      warnings: [],
      tools: [
        {
          name: "search_code",
          description: "Search code and files.",
          estimatedTokens: { claude: 800, openaiCl100k: 740 },
          hasInputSchema: true
        },
        {
          name: "list_repos",
          description: "List repositories.",
          estimatedTokens: { claude: 400, openaiCl100k: 360 },
          hasInputSchema: true
        },
        {
          name: "create_issue",
          description: "Create an issue.",
          estimatedTokens: { claude: 500, openaiCl100k: 450 },
          hasInputSchema: true
        }
      ]
    },
    {
      name: "notion",
      sourceConfigPath: "/repo/.mcp.json",
      transport: "streamable-http",
      urlHost: "mcp.notion.example",
      toolCount: 2,
      estimatedTokens: { claude: 1100, openaiCl100k: 990 },
      inspectionMode: "live",
      confidence: "high",
      warnings: [],
      tools: [
        {
          name: "search_pages",
          description: "Search pages.",
          estimatedTokens: { claude: 600, openaiCl100k: 540 },
          hasInputSchema: true
        },
        {
          name: "create_page",
          description: "Create a page.",
          estimatedTokens: { claude: 300, openaiCl100k: 270 },
          hasInputSchema: true
        }
      ]
    },
    {
      name: "slack",
      sourceConfigPath: "/repo/.mcp.json",
      transport: "stdio",
      command: "slack-mcp",
      toolCount: 1,
      estimatedTokens: { claude: 800, openaiCl100k: 720 },
      inspectionMode: "live",
      confidence: "high",
      warnings: [],
      tools: [
        {
          name: "search_messages",
          description: "Search messages.",
          estimatedTokens: { claude: 620, openaiCl100k: 560 },
          hasInputSchema: true
        }
      ]
    }
  ],
  overlapClusters: [
    {
      label: "search intent",
      score: 0.88,
      reason: "tools share a search intent",
      signals: ["intent-heuristic"],
      tools: [
        { server: "github", name: "search_code" },
        { server: "notion", name: "search_pages" }
      ],
      recommendation: "Prefer one search surface per workflow."
    }
  ],
  recommendations: [],
  warnings: [],
  metadata: { staticOnly: false, inspectionMode: "live default" }
};

export function baseReport(): TareReport {
  return clone(base);
}

export function headReport(): TareReport {
  return clone(head);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
