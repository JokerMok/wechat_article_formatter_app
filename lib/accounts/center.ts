import { z } from "zod";
import { accountConfig, AccountError } from "./config";

export class CenterError extends AccountError {
  constructor(status: number, code: string, public unknown = false) {
    super(status, code, unknown ? "权益请求结果暂未确认，请稍后重试。" :
      status === 401 ? "登录已失效或账号服务配置不可用。" :
      code === "MEMBERSHIP_REQUIRED" ? "此功能需要有效的本产品会员。" :
      code === "INSUFFICIENT_QUOTA" ? "此功能的可用次数不足。" :
      status === 403 || status === 409 || status === 429 ? "当前账号没有此功能的使用权限或可用额度。" :
      "账号中心暂未完成此操作。");
  }
}
const bounded = z.string().min(1).max(400);
const identity = z.object({
  uid: bounded,
  issuer: z.url(),
  subject: bounded,
  username: bounded.optional(),
  display_name: z.string().nullish(),
  organization: z.string(),
  blocked: z.boolean().optional(),
});
export const entitlementsSchema = z.object({
  product: z.object({ id: bounded }),
  membership: z.object({ active: z.boolean(), expires_at: z.string().nullable() }),
  features: z.array(z.object({
    id: bounded, name: bounded, kind: z.enum(["access", "quota"]),
    allowed: z.boolean(), remaining: z.number().int().nonnegative(),
    held: z.number().int().nonnegative(),
  })),
});
export const reservationSchema = z.object({
  id: z.uuid(), status: z.enum(["reserved", "confirmed", "cancelled", "expired", "refunded"]),
  request_id: bounded, product_id: bounded,
  feature_id: bounded, amount: z.number().int().positive(),
});
export type Reservation = z.infer<typeof reservationSchema>;
export const tabs = ["redeem", "security", "records", "overview"] as const;
export type AccountTab = typeof tabs[number];

async function call<T>(schema: z.ZodType<T>, path: string, token?: string, body?: object): Promise<T> {
  const c = accountConfig();
  let response: Response;
  let payload: unknown;
  try {
    response = await fetch(`${c.center}/api/v1/products/${c.product}${path}`, {
      method: body ? "POST" : "GET", redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(7_000),
      headers: {
        Authorization: `Bearer ${c.serviceKey}`,
        ...(token ? { "X-User-Token": token } : {}),
        "Content-Type": "application/json",
      },
      body: body && JSON.stringify(body),
    });
    payload = await response.json();
  } catch {
    throw new CenterError(503, "CENTER_UNKNOWN", true);
  }
  if (!response.ok) {
    const parsed = z.object({ code: z.string().regex(/^[A-Z_0-9]{2,80}$/) }).safeParse(payload);
    const unknown = response.status >= 500 || response.status === 408 || !parsed.success;
    throw new CenterError(unknown ? 503 : response.status, parsed.success ? parsed.data.code : "CENTER_UNKNOWN", unknown);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new CenterError(503, "CENTER_INCOMPLETE", true);
  return parsed.data;
}

type Locator = { reservation_id: string } | { request_id: string };
export const center = {
  async identity(token: string) {
    const { user } = await call(z.object({ user: identity }), "/identity", token);
    if (user.organization !== "consumers" || user.blocked)
      throw new AccountError(403, "IDENTITY_INACTIVE", "该消费者账号当前不可用。");
    return user;
  },
  async entitlements(token: string) {
    const data = await call(entitlementsSchema, "/entitlements", token);
    if (data.product.id !== accountConfig().product) throw new CenterError(503, "WRONG_PRODUCT", true);
    return data;
  },
  check: (token: string, feature: string) =>
    call(z.object({ allowed: z.literal(true) }), "/check", token, { feature_id: feature }),
  reserve: (token: string, feature: string, id: string) =>
    call(reservationSchema, "/reservations", token, { feature_id: feature, request_id: id, amount: 1 }),
  confirm: (token: string, id: string) =>
    call(reservationSchema, `/reservations/${id}/confirm`, token, {}),
  status: (locator: Locator) =>
    call(reservationSchema, "/recovery/reservations?" + new URLSearchParams(locator)),
  recover: (locator: Locator, action: "cancel" | "refund") =>
    call(reservationSchema, "/recovery", undefined, { ...locator, action, reason: "产品排版任务未交付" }),
  async entry(token: string, tab: AccountTab) {
    const { url } = await call(z.object({ url: z.url() }), "/consumer-entry", token, { tab });
    const target = new URL(url);
    if (target.origin !== accountConfig().center || target.pathname !== "/auth/consumer" ||
        target.username || target.password || target.hash || !target.searchParams.get("context"))
      throw new CenterError(503, "UNTRUSTED_CENTER_LINK", true);
    return target;
  },
  logoutAll: (token: string) =>
    call(z.object({ ok: z.literal(true), scope: z.literal("all-products-and-casdoor") }), "/logout-all", token, {}),
};
