import { NextRequest, NextResponse } from "next/server";
import { handleMcpPost } from "@/lib/zaimem/mcp";
import { corsPreflight, withCors } from "@/lib/zaimem/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ZaiMem MCP server — Model Context Protocol over Streamable HTTP.
 *
 *   POST /api/mcp   JSON-RPC 2.0 (initialize, tools/list, tools/call, …)
 *   Auth:           Authorization: Bearer zm_…   (or ?token=zm_…)
 *
 * chat.z.ai agents connect here; CORS is fully open so any web client works.
 */
export async function POST(req: NextRequest) {
  try {
    return await handleMcpPost(req);
  } catch (err) {
    console.error("[zaimem-mcp] fatal:", err);
    return withCors(
      NextResponse.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32603, message: "Internal server error", data: err instanceof Error ? err.message : String(err) },
        },
        { status: 500 },
      ),
    );
  }
}

export async function GET() {
  // Streamable HTTP: server offers no server-initiated streams → 405 per spec
  return withCors(
    NextResponse.json(
      {
        server: "zaimem",
        version: "1.0.0",
        transport: "streamable-http",
        message:
          "ZaiMem MCP server. POST JSON-RPC 2.0 here with Authorization: Bearer <your zaimem token>. See the ZaiMem dashboard for the ready-made agent prompt.",
      },
      { status: 405 },
    ),
  );
}

export async function OPTIONS() {
  return corsPreflight();
}

export async function DELETE() {
  return withCors(NextResponse.json({ error: "Method not allowed" }, { status: 405 }));
}
