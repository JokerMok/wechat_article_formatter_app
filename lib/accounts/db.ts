import { Pool } from "pg";
import { accountConfig } from "./config";

let pool: Pool | undefined;
export function accountDB() {
  return pool ??= new Pool({
    connectionString: accountConfig().databaseUrl,
    max: 4, idleTimeoutMillis: 15_000, connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000, allowExitOnIdle: true,
  }).on("error", () => { /* requests fail closed and can be retried */ });
}
