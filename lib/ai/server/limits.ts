import { ServerAIError } from "./errors";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const MAX_CONCURRENT_REQUESTS = 2;
const MAX_TRACKED_CLIENTS = 1_000;

type RateEntry = { startedAt: number; count: number };

const rateEntries = new Map<string, RateEntry>();
let activeRequests = 0;

export type ServerAILimitDependencies = {
  now?: () => number;
  clientKey?: string;
};

export function acquireServerAILimit(request: Request, dependencies: ServerAILimitDependencies = {}) {
  const now = dependencies.now ?? Date.now;
  const timestamp = now();
  const key = dependencies.clientKey ?? clientKeyFromRequest(request);
  const entry = rateEntries.get(key);

  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    throw new ServerAIError("AI_RATE_LIMITED", "服务端 AI 当前请求较多，请稍后重试。", true, 429);
  }

  if (!entry || timestamp - entry.startedAt >= WINDOW_MS) {
    if (!entry && rateEntries.size >= MAX_TRACKED_CLIENTS) {
      // Never reset active login or model quotas to make room for a new key.
      for (const [clientKey, value] of rateEntries) {
        if (timestamp - value.startedAt >= WINDOW_MS) rateEntries.delete(clientKey);
      }
      if (rateEntries.size >= MAX_TRACKED_CLIENTS) {
        throw new ServerAIError("AI_RATE_LIMITED", "服务端 AI 请求过于频繁，请稍后重试。", true, 429);
      }
    }
    rateEntries.set(key, { startedAt: timestamp, count: 1 });
  } else if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    throw new ServerAIError("AI_RATE_LIMITED", "服务端 AI 请求过于频繁，请稍后重试。", true, 429);
  } else {
    entry.count += 1;
  }

  activeRequests += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeRequests = Math.max(0, activeRequests - 1);
  };
}

export function assertAllowedRequestOrigin(request: Request) {
  const requestOrigin = request.headers.get("origin") ?? originFromReferer(request.headers.get("referer"));
  if (!requestOrigin) {
    if (process.env.NODE_ENV === "production" || process.env.AI_REQUIRE_SAME_ORIGIN === "true") {
      throw new ServerAIError("AI_FORBIDDEN", "请从当前网站发起服务端 AI 请求。", false, 403);
    }
    return;
  }

  let parsedRequestOrigin: URL;
  let parsedTargetOrigin: URL;
  try {
    parsedRequestOrigin = new URL(requestOrigin);
    parsedTargetOrigin = requestTargetOrigin(request);
  } catch {
    throw new ServerAIError("AI_FORBIDDEN", "不允许跨站调用服务端 AI。", false, 403);
  }

  if (parsedRequestOrigin.origin !== parsedTargetOrigin.origin) {
    throw new ServerAIError("AI_FORBIDDEN", "不允许跨站调用服务端 AI。", false, 403);
  }
}

function requestTargetOrigin(request: Request) {
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || request.headers.get("host");
  if (!host) return new URL(request.url);

  const forwardedProtocol = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const protocol = forwardedProtocol || new URL(request.url).protocol.replace(":", "");
  return new URL(`${protocol}://${host}`);
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || undefined;
}

export function resetServerAILimitsForTests() {
  rateEntries.clear();
  activeRequests = 0;
}

function clientKeyFromRequest(request: Request) {
  // Vercel overwrites this header at ingress. A standalone Node server cannot
  // authenticate caller-supplied forwarding headers, so it shares one bucket.
  if (process.env.VERCEL === "1") return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  return "anonymous";
}

function originFromReferer(referer: string | null) {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return referer;
  }
}
