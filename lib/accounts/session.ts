import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import * as oidc from "openid-client";
import { z } from "zod";
import { accountConfig, AccountError, signInRequired, unavailable } from "./config";
import { center, CenterError } from "./center";
import { accountDB } from "./db";

const token = () => randomBytes(32).toString("base64url");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const equal = (a: string, b: string) => timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
const invalidLogin = () => new AccountError(400, "INVALID_LOGIN", "登录请求已过期或已使用，请重新登录。");
const attemptCookie = () => accountConfig().redirect.protocol === "https:" ? "__Host-formatter_oidc_attempt" : "formatter_oidc_attempt";
const cookieName = () => accountConfig().redirect.protocol === "https:" ? "__Host-formatter_session" : "formatter_session";
const cookieOptions = () => ({
  secure: accountConfig().redirect.protocol === "https:", httpOnly: true,
  sameSite: "lax" as const, path: "/",
});

export function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function assertAccountOrigin(request: Request) {
  if (request.headers.get("origin") !== accountConfig().redirect.origin)
    throw new AccountError(403, "ORIGIN_MISMATCH", "请求来源不匹配，请刷新页面。");
}

const metadata = z.object({
  issuer: z.string(), authorization_endpoint: z.url(), token_endpoint: z.url(), jwks_uri: z.url(),
  id_token_signing_alg_values_supported: z.array(z.string()),
}).passthrough();

let discovery: { key: string; expires: number; config: Promise<oidc.Configuration> } | undefined;
async function oidcConfig() {
  const c = accountConfig();
  const key = digest(JSON.stringify([c.issuer, c.application, c.clientId, c.clientSecret]));
  if (discovery?.key === key && discovery.expires > Date.now()) return discovery.config;
  const config = (async () => {
    const response = await fetch(`${c.issuer}/.well-known/${c.application}/openid-configuration`, {
      signal: AbortSignal.timeout(7_000), redirect: "error", cache: "no-store",
    });
    if (!response.ok) throw unavailable();
    const doc = metadata.parse(await response.json());
    if (doc.issuer !== c.issuer || !doc.id_token_signing_alg_values_supported.includes("RS256") ||
        [doc.authorization_endpoint, doc.token_endpoint, doc.jwks_uri].some((value) => {
          const url = new URL(value);
          return url.origin !== c.issuer || url.username || url.password || url.hash;
        })) throw unavailable();
    const value = new oidc.Configuration(doc as oidc.ServerMetadata, c.clientId, {
      client_secret: c.clientSecret, id_token_signed_response_alg: "RS256",
    }, oidc.ClientSecretPost(c.clientSecret));
    value.timeout = 8;
    if (c.issuer.startsWith("http:")) oidc.allowInsecureRequests(value);
    value[oidc.customFetch] = (url, options) => fetch(url, { ...options, body: options.body instanceof Uint8Array ? new Uint8Array(options.body) : options.body, redirect: "error", cache: "no-store" });
    oidc.enableNonRepudiationChecks(value);
    return value;
  })();
  discovery = { key, expires: Date.now() + 5 * 60_000, config };
  config.catch(() => { if (discovery?.config === config) discovery = undefined; });
  return config;
}

type LoginCredentials = { username: string; password: string };

async function passwordLogin(credentials: LoginCredentials, authURL: URL) {
  const config = accountConfig();
  const target = new URL("/api/login", config.issuer);
  const params = authURL.searchParams;
  target.search = new URLSearchParams({
    clientId: config.clientId,
    responseType: "code",
    type: "code",
    redirectUri: config.redirect.href,
    scope: params.get("scope") ?? "",
    state: params.get("state") ?? "",
    nonce: params.get("nonce") ?? "",
    code_challenge_method: "S256",
    code_challenge: params.get("code_challenge") ?? "",
  }).toString();
  const response = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...credentials,
      application: config.application,
      organization: "consumers",
      type: "code",
      autoSignin: false,
      signinMethod: "Password",
      loginMethod: "password",
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 429) return authURL;
  if (!response.ok) throw unavailable();
  const result = z.object({
    status: z.enum(["ok", "error"]),
    msg: z.string().optional(),
    data: z.unknown(),
    data2: z.unknown(),
    data3: z.unknown(),
  }).parse(await response.json());
  if (result.status === "error") {
    if (/captcha|turing|验证码|人机|obfuscat|decrypt/i.test(result.msg ?? "")) return authURL;
    throw new AccountError(401, "INVALID_CREDENTIALS", "账号或密码不正确，请重试。");
  }
  // Casdoor returns a hex code or UUID for a completed code grant. A prompt,
  // consent, password update or MFA response continues on the issuer's UI.
  if (result.data2 != null || result.data3 != null ||
      typeof result.data !== "string" ||
      !/^(?:[a-f0-9]{32,64}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(result.data))
    return authURL;
  const callback = new URL(config.redirect);
  callback.searchParams.set("code", result.data);
  // The code came directly from the configured issuer, without a hosted redirect.
  callback.searchParams.set("iss", target.origin);
  callback.searchParams.set("state", params.get("state") ?? "");
  return callback;
}

export async function startLogin(options?: LoginCredentials | "register") {
  const c = accountConfig();
  const oidcClient = await oidcConfig();
  const jar = await cookies();
  const state = oidc.randomState();
  const verifier = oidc.randomPKCECodeVerifier();
  const nonce = oidc.randomNonce();
  const browser = token();
  const previous = jar.get(cookieName())?.value;
  const prior = await localSession();
  const authURL = oidc.buildAuthorizationUrl(oidcClient, {
    response_type: "code", scope: "openid profile", redirect_uri: c.redirect.href,
    state, nonce, code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256", prompt: "login",
  });
  let target = authURL;
  if (options === "register") {
    target = new URL("/signup/oauth/authorize", c.issuer);
    target.search = authURL.search;
  } else if (options) {
    target = await passwordLogin(options, authURL);
  }
  await accountDB().query(
    "INSERT INTO formatter_accounts.attempts VALUES($1,$2,$3,$4,$5,now()+interval '8 minutes')",
    [digest(state), digest(browser), prior?.token_hash ?? null, verifier, nonce],
  );
  const response = noStore(NextResponse.redirect(target, 303));
  response.cookies.set(attemptCookie(), browser, { ...cookieOptions(), maxAge: 480 });
  if (previous && !prior) clearSession(response);
  return response;
}

export async function completeLogin(request: Request) {
  const c = accountConfig();
  const internal = new URL(request.url);
  // Next standalone constructs request.url with its loopback listener.
  // The edge proxy preserves Host and sets X-Forwarded-Proto from the actual connection.
  const protocol = request.headers.get("x-forwarded-proto") ?? internal.protocol.slice(0, -1);
  if (request.headers.get("host") !== c.redirect.host || `${protocol}:` !== c.redirect.protocol ||
      internal.pathname !== c.redirect.pathname)
    throw invalidLogin();
  const incoming = new URL(c.redirect);
  incoming.search = internal.search;
  const state = incoming.searchParams.get("state") ?? "";
  if (!/^[a-zA-Z0-9_-]{43}$/.test(state) || incoming.searchParams.getAll("state").length !== 1)
    throw invalidLogin();
  const jar = await cookies();
  const browser = jar.get(attemptCookie())?.value;
  if (!browser) throw invalidLogin();
  const previous = jar.get(cookieName())?.value;
  const priorHash = previous ? digest(previous) : null;
  const attempt = (await accountDB().query<{ prior_session: string | null; verifier: string; nonce: string }>(
    `DELETE FROM formatter_accounts.attempts WHERE state_hash=$1 AND binding_hash=$2
     AND expires_at>now() RETURNING prior_session,verifier,nonce`, [digest(state), digest(browser)],
  )).rows[0];
  if (!attempt || attempt.prior_session !== priorHash) throw invalidLogin();
  const finish = (reason?: string) => {
    const result = noStore(NextResponse.redirect(new URL(reason ? `/?account=${reason}` : "/", c.redirect), 303));
    result.cookies.set(attemptCookie(), "", { ...cookieOptions(), maxAge: 0 });
    return result;
  };
  if (incoming.searchParams.has("error")) return finish(
    incoming.searchParams.get("error") === "access_denied" ? "cancelled" : "login-failed",
  );
  try {
    const tokens = await oidc.authorizationCodeGrant(await oidcConfig(), incoming, {
      expectedState: state, expectedNonce: attempt.nonce, pkceCodeVerifier: attempt.verifier, idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims || typeof claims.sub !== "string" || !claims.sub || claims.iss !== c.issuer ||
        typeof claims.exp !== "number" || typeof claims.iat !== "number" || claims.iat > Date.now() / 1000 + 5 ||
        (claims.azp !== undefined && claims.azp !== c.clientId)) throw invalidLogin();
    const user = await center.identity(tokens.access_token);
    if (user.issuer !== claims.iss || user.subject !== claims.sub) throw invalidLogin();
    const maxAge = Math.min(Math.floor(claims.exp - Date.now() / 1000), tokens.expiresIn() ?? 3600, 8 * 3600);
    if (maxAge < 1) throw invalidLogin();

    const db = await accountDB().connect();
    const session = token();
    try {
      await db.query("BEGIN");
      const mapping = (await db.query<{ id: string; center_uid: string }>(
        `INSERT INTO formatter_accounts.identities(id,issuer,subject,center_uid,workspace_key) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT DO NOTHING`, [randomUUID(), c.issuer, claims.sub, user.uid, token()],
      ));
      const owner = (await db.query<{ id: string; center_uid: string }>(
        "SELECT id,center_uid FROM formatter_accounts.identities WHERE issuer=$1 AND subject=$2",
        [c.issuer, claims.sub],
      )).rows[0];
      if (!owner || owner.center_uid !== user.uid || (mapping.rowCount !== 0 && mapping.rowCount !== 1))
        throw new AccountError(409, "MAPPING_CONFLICT", "账号关联未完成，既有作品归属未变更。");
      if (priorHash) {
        const previousSession = await db.query("DELETE FROM formatter_accounts.sessions WHERE token_hash=$1", [priorHash]);
        if (previousSession.rowCount !== 1) throw invalidLogin();
      }
      await db.query(
        "INSERT INTO formatter_accounts.sessions VALUES($1,$2,$3,$4,now()+$5::integer*interval '1 second')",
        [digest(session), owner.id, tokens.access_token, token(), maxAge],
      );
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      db.release();
    }
    const result = finish();
    result.cookies.set(cookieName(), session, { ...cookieOptions(), maxAge });
    return result;
  } catch (error) {
    return finish(error instanceof AccountError && error.code === "MAPPING_CONFLICT" ? "mapping-conflict" : "login-failed");
  }
}

export type ProductSession = {
  token_hash: string; owner_id: string; access_token: string; binding: string;
  issuer: string; subject: string; center_uid: string; workspace_key: string;
};

export async function localSession() {
  const value = (await cookies()).get(cookieName())?.value;
  if (!value || !/^[a-zA-Z0-9_-]{43}$/.test(value)) return undefined;
  return (await accountDB().query<ProductSession>(
    `SELECT s.token_hash,s.owner_id,s.access_token,s.binding,i.issuer,i.subject,i.center_uid,i.workspace_key
       FROM formatter_accounts.sessions s JOIN formatter_accounts.identities i ON i.id=s.owner_id
       WHERE s.token_hash=$1 AND s.expires_at>now() AND i.issuer=$2`,
    [digest(value), accountConfig().issuer],
  )).rows[0];
}

export function isInactive(error: unknown) {
  return error instanceof AccountError && [
    "SIGN_IN_REQUIRED", "TOKEN_REVOKED", "INVALID_TOKEN", "SUBJECT_MISMATCH", "IDENTITY_INACTIVE",
    "USER_BLOCKED", "WRONG_ORGANIZATION", "IDENTITY_MISMATCH",
  ].includes(error.code);
}

export async function activeSession(request?: Request) {
  const session = await localSession();
  if (!session) throw signInRequired();
  if (request && !equal(request.headers.get("x-formatter-session") ?? "", session.binding))
    throw new AccountError(409, "ACCOUNT_CHANGED", "账号已切换，请刷新当前页面。");
  try {
    const identity = await center.identity(session.access_token);
    if (identity.uid !== session.center_uid || identity.issuer !== session.issuer || identity.subject !== session.subject)
      throw new AccountError(403, "IDENTITY_MISMATCH", "账号身份不一致，请重新登录。");
    return { session, identity };
  } catch (error) {
    if (isInactive(error)) await dropSession(session);
    if (error instanceof CenterError && error.code === "INVALID_PRODUCT_CREDENTIAL") throw unavailable();
    throw error;
  }
}

export async function dropSession(session: ProductSession) {
  await accountDB().query("DELETE FROM formatter_accounts.sessions WHERE token_hash=$1", [session.token_hash]);
}

export function clearSession(response: NextResponse) {
  response.cookies.set(cookieName(), "", { ...cookieOptions(), maxAge: 0 });
  return response;
}
