import { NextResponse } from "next/server";
import { accountConfig, accountEnabled } from "@/lib/accounts/config";
import { completeLogin, noStore } from "@/lib/accounts/session";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ product: string }> }) {
  if (!accountEnabled()) return new Response(null, { status: 404 });
  try {
    const c = accountConfig();
    if ((await context.params).product !== c.product)
      return new Response(null, { status: 404 });
    try {
      return await completeLogin(request);
    } catch {
      return noStore(NextResponse.redirect(new URL("/?account=login-expired", c.redirect), 303));
    }
  } catch {
    return new Response("账号服务暂不可用。", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
