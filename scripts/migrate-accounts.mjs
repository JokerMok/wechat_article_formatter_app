import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";

if (!process.env.ACCOUNT_DATABASE_URL) {
  console.error("未设置产品专用 ACCOUNT_DATABASE_URL。");
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString: process.env.ACCOUNT_DATABASE_URL, connectionTimeoutMillis: 5_000 });
  const path = new URL("../migrations/accounts/", import.meta.url);
  let client;
  try {
    client = await pool.connect();
    await client.query("SELECT pg_advisory_lock(711532901)");
    for (const file of (await readdir(path)).filter((x) => /^\d{3}_\w+\.sql$/.test(x)).sort()) {
      await client.query(await readFile(new URL(file, path), "utf8"));
      console.log("产品账号迁移完成：", file);
    }
  } catch {
    await client?.query("ROLLBACK").catch(() => {});
    console.error("迁移失败。检查目标数据库权限、连通性和迁移记录。");
    process.exitCode = 1;
  } finally {
    // The session lock is released on disconnect, including after a partial failure.
    client?.release(true);
    await pool.end();
  }
}
