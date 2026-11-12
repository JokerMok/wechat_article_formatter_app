export class AccountError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const accountEnabled = () => process.env.ACCOUNT_MODE === "center";
export const unavailable = () => new AccountError(503, "ACCOUNT_UNAVAILABLE", "账号服务暂不可用，请稍后重试。");
export const signInRequired = () => new AccountError(401, "SIGN_IN_REQUIRED", "请重新登录后继续。");

export function accountConfig() {
  const required = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) throw unavailable();
    return value;
  };
  try {
    const issuer = new URL(required("OIDC_ISSUER"));
    const center = new URL(required("ACCOUNTS_URL"));
    const redirect = new URL(required("OIDC_REDIRECT_URI"));
    const product = required("PRODUCT_ID");
    const application = required("OIDC_APPLICATION");
    const local = process.env.ACCOUNT_ALLOW_LOOPBACK === "1" && process.env.VERCEL !== "1";
    const secure = (url: URL) => url.protocol === "https:" ||
      (local && url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
    if (
      ![issuer, center, redirect].every((url) => secure(url) && !url.username && !url.password && !url.search && !url.hash) ||
      issuer.pathname !== "/" || center.pathname !== "/" ||
      !/^[a-z][a-z0-9-]{1,62}$/.test(product) || ["admin", "center"].includes(product) ||
      !/^[a-z][a-z0-9-]{1,100}$/.test(application) ||
      redirect.pathname !== `/auth/callback/${product}`
    ) throw unavailable();
    const serviceKey = required("PRODUCT_SERVICE_KEY");
    if (serviceKey.length < 32) throw unavailable();
    return {
      issuer: issuer.origin, center: center.origin, redirect, product, application,
      serviceKey, clientId: required("OIDC_CLIENT_ID"), clientSecret: required("OIDC_CLIENT_SECRET"),
      databaseUrl: required("ACCOUNT_DATABASE_URL"),
    };
  } catch {
    throw unavailable();
  }
}

export function accountError(error: unknown) {
  return error instanceof AccountError ? error : unavailable();
}
