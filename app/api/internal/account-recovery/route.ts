import { NextResponse } from "next/server";
import { accountEnabled } from "@/lib/accounts/config";
import { equal, noStore } from "@/lib/accounts/session";
import { recoverLayoutJobs } from "@/lib/accounts/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

async function recover(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!accountEnabled() || !secret || secret.length < 32 ||
      !equal(request.headers.get("authorization") ?? "", `Bearer ${secret}`))
    return noStore(NextResponse.json({ error: "Not found" }, { status: 404 }));
  try {
    return noStore(NextResponse.json(await recoverLayoutJobs()));
  } catch {
    return noStore(NextResponse.json({ error: "Recovery unavailable" }, { status: 503 }));
  }
}
export { recover as GET, recover as POST };
