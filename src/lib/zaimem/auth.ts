import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { randomBytes } from "crypto";

export const TOKEN_PREFIX = "zm_";

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(24).toString("hex"); // zm_<48 hex>
}

export function maskToken(token: string): string {
  if (token.length < 14) return token;
  return token.slice(0, 7) + "••••••••" + token.slice(-4);
}

/** Extract bearer token from Authorization header, x-zaimem-token header or ?token= */
export function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const xt = req.headers.get("x-zaimem-token");
  if (xt) return xt.trim();
  const q = req.nextUrl.searchParams.get("token");
  if (q) return q.trim();
  return null;
}

/** Look up a ZaiMem user by raw token. Updates lastSeenAt. */
export async function authenticate(token: string | null | undefined) {
  if (!token) return null;
  const user = await db.user.findUnique({ where: { token } });
  if (user) {
    // fire-and-forget heartbeat
    db.user
      .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }
  return user;
}

/** Standard 401 response for invalid/missing tokens. */
export function unauthorized() {
  return Response.json(
    {
      error: "unauthorized",
      message:
        "Missing or invalid ZaiMem token. Send header 'Authorization: Bearer zm_...' or ?token=zm_...",
    },
    { status: 401 },
  );
}

/** CORS helpers — the MCP endpoint is called cross-origin by chat.z.ai agents. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-Zaimem-Token, MCP-Session-Id, Mcp-Session-Id, Last-Event-ID, Accept, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "MCP-Session-Id, Mcp-Session-Id",
};

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function withCors(res: Response): Response {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}
