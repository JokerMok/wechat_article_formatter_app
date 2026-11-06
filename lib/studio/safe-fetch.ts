import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import http from "node:http";
import https from "node:https";

const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const reservedV6 = new BlockList();
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  reservedV6.addSubnet(address, prefix, "ipv6");
export function isPublicAddress(address: string) {
  if (isIP(address) === 6)
    return (
      globalV6.check(address, "ipv6") && !reservedV6.check(address, "ipv6")
    );
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export async function resolvePublicURL(value: string, resolver = lookup) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("链接格式无效，请粘贴完整的 http 或 https 地址。");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error("仅允许无账号密码、使用标准端口的公开网页链接。");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    /\.(?:local|internal|localhost)$/i.test(hostname)
  )
    throw new Error("不能抓取本机或内网地址。");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolver(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error("链接指向内网、保留地址或不安全的目标，已阻止抓取。");
  return { url, address: addresses[0] };
}
export async function safeFetch(
  value: string,
  options: {
    maxBytes?: number;
    signal?: AbortSignal;
    redirects?: number;
    headers?: Record<string, string>;
    validateRedirect?: (url: URL) => void;
  } = {},
): Promise<{ body: Buffer; contentType: string; url: string }> {
  const { url, address } = await resolvePublicURL(value);
  const maxBytes = options.maxBytes ?? 3_000_000;
  const response = await new Promise<{
    status: number;
    location?: string;
    contentType: string;
    body: Buffer;
  }>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        method: "GET",
        family: address.family,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
        headers: {
          "user-agent": "StyleStudio/1.0 (reference capture)",
          accept: "text/html,text/css,image/*;q=0.8",
          ...options.headers,
          "accept-encoding": "identity",
        },
        signal: AbortSignal.any([
          options.signal ?? new AbortController().signal,
          AbortSignal.timeout(12_000),
        ]),
      },
      (res) => {
        const status = res.statusCode ?? 500;
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({
            status,
            location: res.headers.location,
            contentType: "",
            body: Buffer.alloc(0),
          });
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new PublicFetchHTTPError(status));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            request.destroy(
              new Error("网页或资源过大，请改用截图或手动粘贴。"),
            );
          } else chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status,
            contentType: res.headers["content-type"] ?? "",
            body: Buffer.concat(chunks),
          }),
        );
        res.on("error", reject);
      },
    );
    request.on("error", reject);
    request.end();
  });
  if (response.status >= 300 && response.status < 400) {
    if (!response.location || (options.redirects ?? 0) >= 3)
      throw new Error("网页重定向过多，请改用截图或手动粘贴。");
    const next = new URL(response.location, url);
    options.validateRedirect?.(next);
    return safeFetch(next.href, {
      ...options,
      redirects: (options.redirects ?? 0) + 1,
    });
  }
  return {
    body: response.body,
    contentType: response.contentType,
    url: url.href,
  };
}

export class PublicFetchHTTPError extends Error {
  constructor(readonly status: number) {
    super(`网页返回 HTTP ${status}。`);
  }
}
