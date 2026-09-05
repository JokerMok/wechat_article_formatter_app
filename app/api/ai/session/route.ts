import { AI_SESSION_COOKIE, MAX_ACCESS_CODE_LENGTH, assertServerAIAccess, createAISession } from "../../../../lib/ai/server/access";
import { assertAllowedRequestOrigin, acquireServerAILimit } from "../../../../lib/ai/server/limits";
import { normalizeServerAIError, publicAIError } from "../../../../lib/ai/server/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertServerAIAccess(request);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const normalized = normalizeServerAIError(error);
    return Response.json({ ok: false, error: publicAIError(normalized) }, {
      status: normalized.code === "AI_NOT_CONFIGURED" ? 503 : 403,
      headers: { "cache-control": "no-store" },
    });
  }
}

export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    assertAllowedRequestOrigin(request);
    release = acquireServerAILimit(request, { clientKey: "access-attempt" });
    // A short header avoids accepting an unbounded credential request body.
    const candidate = request.headers.get("x-ai-access-code") ?? "";
    const token = createAISession(candidate.length <= MAX_ACCESS_CODE_LENGTH ? candidate : "");
    const secure = process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:";
    return Response.json({ ok: true }, { headers: {
      "cache-control": "no-store",
      "set-cookie": `${AI_SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api/ai; Max-Age=86400${secure ? "; Secure" : ""}`,
    } });
  } catch (error) {
    const normalized = normalizeServerAIError(error);
    return Response.json({ ok: false, error: publicAIError(normalized) }, {
      status: normalized.code === "AI_RATE_LIMITED" ? 429 : normalized.code === "AI_NOT_CONFIGURED" ? 503 : 403,
      headers: { "cache-control": "no-store" },
    });
  } finally { release?.(); }
}
