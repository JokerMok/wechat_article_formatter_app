import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const nextPort = process.argv[2] ?? "3003";
const fixture = readFileSync(join(process.cwd(), "tests/fixtures/ai/valid-response.json"), "utf8");

const upstream = createServer((request, response) => {
  if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) {
    response.writeHead(404).end();
    return;
  }

  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    if (!body) {
      response.writeHead(400).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(fixture);
  });
});

await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
const upstreamAddress = upstream.address();
if (!upstreamAddress || typeof upstreamAddress === "string") throw new Error("Fixture upstream did not start");

const next = spawn(process.execPath, [
  join(process.cwd(), "node_modules/next/dist/bin/next"),
  "dev",
  "--hostname",
  "127.0.0.1",
  "--port",
  nextPort,
], {
  stdio: "inherit",
  env: {
    ...process.env,
    AI_PROVIDER: "openai-compatible",
    AI_API_KEY: "fixture-server-secret",
    AI_BASE_URL: `http://127.0.0.1:${upstreamAddress.port}/v1`,
    AI_MODEL: "fixture-model",
    AI_MAX_RETRIES: "0",
    AI_TIMEOUT_MS: "5000",
  },
});

const shutdown = () => {
  upstream.close();
  next.kill("SIGTERM");
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
next.on("exit", (code, signal) => {
  upstream.close();
  process.exit(code ?? (signal ? 1 : 0));
});
