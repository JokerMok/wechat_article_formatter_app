import { randomUUID } from "node:crypto";
import { accountDB } from "./db";
import { center, CenterError, type Reservation } from "./center";
import { accountConfig, AccountError } from "./config";
import { digest, type ProductSession } from "./session";

type Stage = "new" | "reserving" | "reserved" | "running" | "prepared" | "confirming" | "failing" | "ready" | "failed";
type Job = {
  id: string; feature: string; stage: Stage; lease: string; reservation_id: string | null;
  input_hash: string; result: unknown; error: string | null; pending_recovery: boolean;
};
export type JobOutcome =
  | { status: "ready"; data: unknown }
  | { status: "processing" | "pending_recovery" }
  | { status: "failed"; error: string };

const fallback = "智能排版未交付，已保留规则排版。";
const table = "formatter_accounts.jobs";
const active = "stage NOT IN ('ready','failed')";
const available = "(lease_until IS NULL OR lease_until < now())";
const uncertain = (e: unknown) => !(e instanceof CenterError) || e.unknown;
const missing = (e: unknown) => e instanceof CenterError && e.status === 404 && e.code === "RESERVATION_NOT_FOUND";
const eligibleForCancellation = (s: Reservation["status"]) => s === "reserved" || s === "confirmed";
const outcome = (job: Job): JobOutcome =>
  job.stage === "ready" ? { status: "ready", data: job.result } :
  job.stage === "failed" ? { status: "failed", error: job.error || fallback } :
  { status: job.pending_recovery ? "pending_recovery" : "processing" };

async function change(job: Job, stage: Stage, values: {
  reservation?: string; result?: unknown; error?: string; pending?: boolean;
} = {}) {
  const { rows } = await accountDB().query<Job>(
    `UPDATE ${table} SET stage=$3, reservation_id=COALESCE($4,reservation_id),
       result=CASE WHEN $3='failed' THEN NULL ELSE COALESCE($5::jsonb,result) END,
       error=COALESCE($6,error),pending_recovery=$7,updated_at=now(),retry_at=now()+interval '20 seconds'
     WHERE id=$1 AND lease=$2 AND lease_until>now() RETURNING *`,
    [job.id, job.lease, stage, values.reservation ?? null, values.result === undefined ? null : JSON.stringify(values.result),
      values.error ?? null, values.pending ?? false],
  );
  if (!rows[0]) throw new Error("Lost job lease");
  Object.assign(job, rows[0]);
}

function locator(job: Job) {
  return job.reservation_id ? { reservation_id: job.reservation_id } : { request_id: job.id };
}
function verify(job: Job, r: Reservation) {
  if ((job.reservation_id && job.reservation_id !== r.id) ||
      r.request_id !== job.id || r.product_id !== accountConfig().product ||
      r.feature_id !== job.feature || r.amount !== 1)
    throw new Error("Mismatched reservation");
  return r;
}
async function status(job: Job) {
  return verify(job, await center.status(locator(job)));
}
async function failed(job: Job, message: string, hold?: Reservation) {
  await change(job, "failing", { error: message, reservation: hold?.id });
  let current = hold;
  if (!current) {
    try {
      current = await status(job);
    } catch (error) {
      if (!missing(error) || job.reservation_id) throw error;
      await change(job, "failed");
      return;
    }
  }
  if (eligibleForCancellation(current.status)) {
    try {
      current = verify(job, await center.recover(locator(job), current.status === "confirmed" ? "refund" : "cancel"));
    } catch (error) {
      // Cancel may race a confirm whose response was lost. Re-read before deciding how to settle it.
      if (!(error instanceof CenterError) || error.status !== 409) throw error;
      current = await status(job);
      if (current.status === "confirmed")
        current = verify(job, await center.recover(locator(job), "refund"));
    }
  }
  if (eligibleForCancellation(current.status)) throw new Error("Recovery is not settled");
  await change(job, "failed");
}

async function finish(job: Job, current: Reservation) {
  if (current.status === "confirmed" && job.result !== null) {
    // Storing 'ready' is the delivery commit. The same result can be retrieved repeatedly without another debit.
    await change(job, "ready", { reservation: current.id });
  } else {
    await failed(job, job.error || fallback, current);
  }
}

async function run(job: Job, session?: ProductSession, produce?: () => Promise<unknown>) {
  try {
    if (job.stage === "failing" || job.stage === "running") {
      await failed(job, job.error || fallback);
      return;
    }
    if (job.stage === "confirming" || job.stage === "prepared") {
      const current = await status(job);
      if (current.status !== "reserved" || !session) {
        await finish(job, current);
        return;
      }
    }
    if (job.stage === "new" || job.stage === "reserving" || job.stage === "reserved") {
      if (!session || !produce) {
        if (job.stage === "new") await change(job, "failed", { error: fallback });
        else await failed(job, fallback);
        return;
      }
      let held: Reservation | undefined;
      if (job.stage !== "new") {
        try {
          held = await status(job);
        } catch (error) {
          if (!missing(error) || job.reservation_id) throw error;
        }
      }
      if (!held) {
        await change(job, "reserving");
        try {
          held = verify(job, await center.reserve(session.access_token, job.feature, job.id));
        } catch (error) {
          if (uncertain(error)) throw error;
          await failed(job, error instanceof AccountError ? error.message : fallback);
          return;
        }
      }
      if (held.status !== "reserved") {
        await finish(job, held);
        return;
      }
      await change(job, "reserved", { reservation: held.id });
      await change(job, "running");
      let data: unknown;
      try {
        data = await produce();
        if (data === null || data === undefined) throw new Error("Missing business result");
      } catch {
        await failed(job, fallback);
        return;
      }
      await change(job, "prepared", { result: data });
    }
    if (!session || !job.reservation_id) throw new Error("Missing confirmation context");
    await change(job, "confirming");
    try {
      await finish(job, verify(job, await center.confirm(session.access_token, job.reservation_id)));
    } catch (error) {
      // Network/5xx/malformed success never means the confirmation failed.
      const current = await status(job);
      if (current.status === "reserved" && uncertain(error)) throw error;
      await finish(job, current);
    }
  } catch {
    await change(job, job.stage, { pending: true });
  }
}

async function release(job: Job) {
  await accountDB().query(`UPDATE ${table} SET lease=NULL,lease_until=NULL WHERE id=$1 AND lease=$2`, [job.id, job.lease]);
}

export async function runLayoutJob(session: ProductSession, feature: string, clientKey: string, input: unknown, produce: () => Promise<unknown>) {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(clientKey))
    throw new AccountError(400, "REQUEST_KEY_REQUIRED", "缺少有效的排版任务编号，请刷新后重试。");
  const inputHash = digest(JSON.stringify(input));
  const db = accountDB();
  await db.query(
    `INSERT INTO ${table}(id,owner_id,feature,client_key,input_hash) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(owner_id,feature,client_key) DO NOTHING`,
    [randomUUID(), session.owner_id, feature, clientKey, inputHash],
  );
  const key = [session.owner_id, feature, clientKey];
  const found = (await db.query<Job>(
    `SELECT * FROM ${table} WHERE owner_id=$1 AND feature=$2 AND client_key=$3`, key,
  )).rows[0];
  if (found.input_hash !== inputHash)
    throw new AccountError(409, "REQUEST_REUSED", "任务编号已用于另一份排版内容。");
  if (found.stage === "ready" || found.stage === "failed") return outcome(found);
  const leased = (await db.query<Job>(
    `UPDATE ${table} SET lease=$4,lease_until=now()+interval '150 seconds'
       WHERE owner_id=$1 AND feature=$2 AND client_key=$3 AND ${active} AND ${available} RETURNING *`,
    [...key, randomUUID()],
  )).rows[0];
  if (!leased) return outcome(found);
  try {
    await run(leased, session, produce);
    return outcome(leased);
  } finally {
    await release(leased);
  }
}

export async function recoverLayoutJobs() {
  const db = accountDB();
  // No user token or request-supplied task/owner. Only durable product tasks can be recovered.
  const jobs = (await db.query<Job>(
    `WITH selected AS (
       SELECT id FROM ${table} WHERE ${active} AND ${available} AND retry_at<now()
       AND updated_at<now()-interval '2 minutes'
       ORDER BY retry_at LIMIT 4 FOR UPDATE SKIP LOCKED
     )
     UPDATE ${table} j SET lease=$1,lease_until=now()+interval '150 seconds'
     FROM selected WHERE j.id=selected.id RETURNING j.*`, [randomUUID()],
  )).rows;
  await Promise.all(jobs.map(async (job) => {
    try { await run(job); } finally { await release(job); }
  }));
  await db.query("DELETE FROM formatter_accounts.attempts WHERE expires_at<now()");
  await db.query("DELETE FROM formatter_accounts.sessions WHERE expires_at<now()");
  return { inspected: jobs.length, pending: jobs.filter((job) => job.pending_recovery).length };
}
