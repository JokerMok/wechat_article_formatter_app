import { runLayoutJob } from "../../../../lib/accounts/jobs";
import { AccountError } from "../../../../lib/accounts/config";
import { authorizeAI } from "../../../../lib/accounts/feature";
import { readBoundedBody } from "@/lib/ai/server/bounded-body";
import { publicAIError, ServerAIError } from "@/lib/ai/server/errors";
import {
  acquireServerAILimit,
  assertAllowedRequestOrigin,
} from "@/lib/ai/server/limits";
import { analyzeArticleLayout } from "@/lib/studio/layout-ai";
import { layoutRequestSchema } from "@/lib/studio/layout-contract";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    assertAllowedRequestOrigin(request);
    const grant = await authorizeAI(request, "ARTICLE_LAYOUT");
    const parsed = layoutRequestSchema.safeParse(
      JSON.parse(await readBoundedBody(request, 1_050_000)),
    );
    if (!parsed.success)
      return Response.json(
        { error: "文章过长或结构无效，已保留规则排版。" },
        { status: 400 },
      );
    release = acquireServerAILimit(request);
    if (grant) {
      const job = await runLayoutJob(
        grant.session, grant.feature, request.headers.get("Idempotency-Key") ?? "", parsed.data,
        async () => {
          const result = await analyzeArticleLayout(parsed.data, AbortSignal.timeout(82_000));
          if (result.plan.origin !== "ai") throw new Error("No AI layout delivered");
          return result;
        },
      );
      return Response.json(job, {
        status: job.status === "ready" ? 200 : job.status === "failed" ? 409 : 202,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const data = await analyzeArticleLayout(parsed.data, request.signal);
    return Response.json(
      { data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AccountError)
      return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    if (error instanceof SyntaxError)
      return Response.json(
        { error: "文章结构请求无法读取。" },
        { status: 400 },
      );
    return Response.json(
      { error: publicAIError(error) },
      { status: error instanceof ServerAIError ? (error.status ?? 500) : 500 },
    );
  } finally {
    release?.();
  }
}
