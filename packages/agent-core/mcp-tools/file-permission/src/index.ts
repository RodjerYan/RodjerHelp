#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

const PERMISSION_API_PORT = process.env.PERMISSION_API_PORT || "9226";

// ВАЖНО: не используем localhost, чтобы избежать резолва в ::1 (IPv6)
const PERMISSION_API_HOST = process.env.PERMISSION_API_HOST || "127.0.0.1";

// Можно полностью переопределить URL при необходимости
const PERMISSION_API_URL =
  process.env.PERMISSION_API_URL ||
  `http://${PERMISSION_API_HOST}:${PERMISSION_API_PORT}/permission`;

// Таймаут запроса (мс). Если env кривой/пустой — будет 30000.
const PERMISSION_API_TIMEOUT_MS = (() => {
  const raw = process.env.PERMISSION_API_TIMEOUT_MS;
  const n = raw ? Number(raw) : 30000;
  return Number.isFinite(n) && n > 0 ? n : 30000;
})();

interface FilePermissionInput {
  operation: "create" | "delete" | "rename" | "move" | "modify" | "overwrite";
  filePath?: string;
  filePaths?: string[];
  targetPath?: string;
  contentPreview?: string;
}

const server = new Server(
  { name: "file-permission", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "request_file_permission",
      description:
        'Request user permission before performing file operations (create, delete, rename, move, modify, overwrite). Always call this tool BEFORE executing any file modification. Returns "allowed" or "denied".',
      inputSchema: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["create", "delete", "rename", "move", "modify", "overwrite"],
            description: "The type of file operation to perform",
          },
          filePath: {
            type: "string",
            description: "Absolute path to the file being operated on",
          },
          filePaths: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of absolute paths for batch operations (e.g., deleting multiple files)",
          },
          targetPath: {
            type: "string",
            description: "Target path for rename/move operations",
          },
          contentPreview: {
            type: "string",
            description: "Preview of file content for create/modify operations (first ~500 chars)",
          },
        },
        required: ["operation"],
      },
    },
  ],
}));

server.setRequestHandler(
  CallToolRequestSchema,
  async (request): Promise<CallToolResult> => {
    if (request.params.name !== "request_file_permission") {
      return {
        content: [{ type: "text", text: `Error: Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }

    const args = request.params.arguments as FilePermissionInput;
    const { operation, filePath, filePaths, targetPath, contentPreview } = args;

    if (!operation || (!filePath && (!filePaths || filePaths.length === 0))) {
      return {
        content: [
          {
            type: "text",
            text: "Error: operation and either filePath or filePaths are required",
          },
        ],
        isError: true,
      };
    }

    try {
      const response = await fetch(PERMISSION_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          filePath,
          filePaths,
          targetPath,
          contentPreview: contentPreview?.substring(0, 500),
        }),
        signal: AbortSignal.timeout(PERMISSION_API_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          content: [
            {
              type: "text",
              text: `Error: Permission API returned ${response.status}: ${errorText}`,
            },
          ],
          isError: true,
        };
      }

      const result = (await response.json()) as { allowed: boolean };
      return {
        content: [{ type: "text", text: result.allowed ? "allowed" : "denied" }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: Failed to request permission: ${errorMessage}` }],
        isError: true,
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`File Permission MCP Server started (url=${PERMISSION_API_URL})`);
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});