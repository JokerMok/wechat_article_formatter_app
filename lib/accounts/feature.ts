import { assertServerAIAccess } from "../ai/server/access";
import { ServerAIError } from "../ai/server/errors";
import { center } from "./center";
import { accountEnabled, AccountError } from "./config";
import { activeSession, assertAccountOrigin } from "./session";

type FeatureRoute = "ARTICLE_LAYOUT" | "STYLE_CAPTURE" | "STYLE_VISION" | "ANALYZE" | "GENERATE";

export async function authorizeAI(request: Request, route: FeatureRoute) {
  if (!accountEnabled()) {
    assertServerAIAccess(request);
    return undefined;
  }
  try {
    assertAccountOrigin(request);
    const { session } = await activeSession(request);
    const feature = process.env[`ACCOUNT_FEATURE_${route}`]?.trim();
    if (feature === "account-only" && route !== "ARTICLE_LAYOUT") return undefined;
    if (!feature)
      throw new AccountError(503, "FEATURE_NOT_CONFIGURED", "此功能尚未配置本产品权益。");
    const rights = await center.entitlements(session.access_token);
    const rule = rights.features.find((entry) => entry.id === feature);
    if (!rule) throw new AccountError(503, "FEATURE_NOT_CONFIGURED", "此功能尚未完成权益登记。");
    await center.check(session.access_token, feature);
    if (rule.kind === "access") return undefined;
    if (route !== "ARTICLE_LAYOUT")
      throw new AccountError(503, "FEATURE_NOT_METERED_HERE", "此功能未配置计次执行方式。");
    if ((process.env.CRON_SECRET?.length ?? 0) < 32)
      throw new AccountError(503, "RECOVERY_NOT_CONFIGURED", "排版任务恢复尚未配置，请稍后重试。");
    return { session, feature };
  } catch (error) {
    if (error instanceof AccountError) throw new ServerAIError("AI_FORBIDDEN", error.message, false, error.status);
    throw new ServerAIError("AI_FORBIDDEN", "账号服务暂不可用，请稍后重试。", true, 503);
  }
}
