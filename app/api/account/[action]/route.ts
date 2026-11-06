import { NextResponse } from "next/server";
import { z } from "zod";
import { center, tabs } from "@/lib/accounts/center";
import { accountConfig, accountEnabled, accountError, AccountError } from "@/lib/accounts/config";
import {
  activeSession, assertAccountOrigin, clearSession, dropSession, equal, isInactive,
  localSession, noStore, startLogin,
} from "@/lib/accounts/session";
import { readBoundedBody } from "@/lib/ai/server/bounded-body";

export const runtime = "nodejs";
type Context = { params: Promise<{ action: string }> };
const json = (value: unknown, status = 200) => noStore(NextResponse.json(value, { status }));
const errorResponse = (error: unknown) => {
  const e = accountError(error);
  return json({ code: e.code, error: e.message }, e.status);
};

export async function GET(request: Request, context: Context) {
  if (!accountEnabled() || (await context.params).action !== "status")
    return json({ code: "NOT_FOUND" }, 404);
  try {
    if (!(await localSession()))
      return json({ state: "signed-out" });
    const { identity, session } = await activeSession(request.headers.has("x-formatter-session") ? request : undefined);
    const base = {
      state: "signed-in",
      name: identity.display_name || identity.username || "当前账号",
      scope: session.owner_id,
      binding: session.binding,
      workspaceKey: session.workspace_key,
    };
    try {
      const rights = await center.entitlements(session.access_token);
      return json({ ...base, rights: { membership: rights.membership, features: rights.features } });
    } catch {
      return json({ ...base, rightsError: "会员与额度暂不可用，请重试。" });
    }
  } catch (error) {
    if (isInactive(error)) return json({ state: "signed-out", error: accountError(error).message });
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  if (!accountEnabled()) return json({ code: "NOT_FOUND" }, 404);
  const { action } = await context.params;
  try {
    assertAccountOrigin(request);
    if (action === "login" || action === "switch") {
      if (action === "switch") {
        const binding = new URLSearchParams(await readBoundedBody(request, 1024)).get("binding");
        const session = await localSession();
        if (!session || !equal(binding ?? "", session.binding))
          throw new AccountError(409, "ACCOUNT_CHANGED", "账号已切换，请刷新当前页面。");
      }
      return await startLogin();
    }
    if (action === "logout") {
      const session = await localSession();
      if (session && !equal(request.headers.get("x-formatter-session") ?? "", session.binding))
        throw new AccountError(409, "ACCOUNT_CHANGED", "账号已切换，请刷新当前页面。");
      if (session) await dropSession(session);
      return clearSession(json({ ok: true }));
    }
    if (action === "logout-all") {
      const { session } = await activeSession(request);
      await center.logoutAll(session.access_token);
      await dropSession(session);
      return clearSession(json({ ok: true }));
    }
    if (action === "entry") {
      const { session } = await activeSession(request);
      const body = z.object({ tab: z.enum(tabs) }).strict().parse(JSON.parse(await readBoundedBody(request, 1024)));
      const target = await center.entry(session.access_token, body.tab);
      return json({ url: target.href });
    }
    return json({ code: "NOT_FOUND" }, 404);
  } catch (error) {
    if (action === "login" || action === "switch") {
      try {
        assertAccountOrigin(request);
        return noStore(NextResponse.redirect(new URL("/?account=login-failed", accountConfig().redirect), 303));
      } catch { /* wrong origin or incomplete configuration */ }
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ code: "INVALID_REQUEST", error: "操作请求无效。" }, 400);
    return errorResponse(error);
  }
}
